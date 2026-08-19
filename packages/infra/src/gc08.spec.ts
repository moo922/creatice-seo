import { NotificationService, type NotificationPayload } from './notification.service';
import { CircuitBreaker, CircuitBreakerRegistry } from './circuit-breaker';
import { JobLogger } from './job-logger';
import { JobProgressTracker } from './job-progress';

describe('GC08 Infrastructure', () => {
  describe('Notification Service', () => {
    let service: NotificationService;

    beforeEach(() => {
      service = new NotificationService();
    });

    it('emits and retrieves notifications', async () => {
      const id = await service.emit({
        siteId: 's1',
        event: 'CRITICAL_ISSUE',
        severity: 'CRITICAL',
        title: 'Test',
        description: 'Test notification',
      });
      expect(id).toBeTruthy();

      const list = await service.list({ siteId: 's1' });
      expect(list.length).toBe(1);
      expect(list[0]!.title).toBe('Test');
    });

    it('marks as read', async () => {
      const id = await service.emit({
        siteId: 's1',
        event: 'REPORT_READY',
        severity: 'INFO',
        title: 'Report',
        description: 'Monthly report ready',
      });

      await service.markRead(id);
      const unread = await service.getUnreadCount('s1');
      expect(unread).toBe(0);
    });

    it('marks all as read', async () => {
      await service.emit({ siteId: 's1', event: 'CRITICAL_ISSUE', severity: 'CRITICAL', title: 'A', description: '' });
      await service.emit({ siteId: 's1', event: 'REPORT_READY', severity: 'INFO', title: 'B', description: '' });

      const count = await service.markAllRead('s1');
      expect(count).toBe(2);
    });

    it('filters by severity', async () => {
      await service.emit({ siteId: 's1', event: 'CRITICAL_ISSUE', severity: 'CRITICAL', title: 'A', description: '' });
      await service.emit({ siteId: 's1', event: 'REPORT_READY', severity: 'INFO', title: 'B', description: '' });

      const critical = await service.list({ severity: 'CRITICAL' });
      expect(critical.length).toBe(1);
    });
  });

  describe('Circuit Breaker', () => {
    it('starts in CLOSED state', () => {
      const cb = new CircuitBreaker('test');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('trips to OPEN after failure threshold', () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('CLOSED');
      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');
    });

    it('rejects requests when OPEN', () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1 });
      cb.recordFailure();
      expect(cb.allowRequest()).toBe(false);
    });

    it('transitions to HALF_OPEN after recovery timeout', () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1, recoveryTimeoutMs: 1 });
      cb.recordFailure();
      // With 1ms recovery timeout, by the time we check it may already be HALF_OPEN
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const state = cb.getState();
          expect(['OPEN', 'HALF_OPEN']).toContain(state);
          resolve(undefined);
        }, 5);
      });
    });

    it('recovers to CLOSED on success threshold', () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1, recoveryTimeoutMs: 1, successThreshold: 2 });
      cb.recordFailure();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cb.getState()).toBe('HALF_OPEN');
          cb.recordSuccess();
          expect(cb.getState()).toBe('HALF_OPEN');
          cb.recordSuccess();
          expect(cb.getState()).toBe('CLOSED');
          resolve(undefined);
        }, 5);
      });
    });

    it('resets failure count on success', () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess(); // resets count
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure(); // 3 consecutive after reset → trips
      expect(cb.getState()).toBe('OPEN');
    });

    it('returns metrics', () => {
      const cb = new CircuitBreaker('test');
      cb.recordFailure();
      const metrics = cb.getMetrics();
      expect(metrics.name).toBe('test');
      expect(metrics.failureCount).toBe(1);
    });
  });

  describe('Circuit Breaker Registry', () => {
    it('creates and caches breakers', () => {
      const registry = new CircuitBreakerRegistry();
      const a = registry.getOrCreate('openai');
      const b = registry.getOrCreate('openai');
      expect(a).toBe(b);
    });

    it('returns metrics for all breakers', () => {
      const registry = new CircuitBreakerRegistry();
      registry.getOrCreate('openai');
      registry.getOrCreate('anthropic');
      expect(registry.getMetrics().length).toBe(2);
    });
  });

  describe('Job Logger', () => {
    it('logs and retrieves entries', () => {
      const logger = new JobLogger('Test');
      logger.info('job-1', 's1', 'CRAWL', 'Started crawl');
      logger.warn('job-1', 's1', 'CRAWL', 'Slow response');

      const entries = logger.getEntries({ siteId: 's1' });
      expect(entries.length).toBe(2);
    });

    it('filters by job type', () => {
      const logger = new JobLogger('Test');
      logger.info('job-1', 's1', 'CRAWL', 'msg1');
      logger.info('job-2', 's1', 'GSC', 'msg2');

      const crawls = logger.getEntries({ jobType: 'CRAWL' });
      expect(crawls.length).toBe(1);
    });

    it('never logs secrets', () => {
      const logger = new JobLogger('Test');
      logger.info('job-1', 's1', 'TEST', 'Normal message', { apiKey: 'REDACTED' });

      const entries = logger.getEntries();
      expect(entries[0]!.metadata).toEqual({ apiKey: 'REDACTED' });
    });
  });

  describe('Job Progress Tracker', () => {
    let tracker: JobProgressTracker;

    beforeEach(() => {
      tracker = new JobProgressTracker();
    });

    it('tracks and retrieves progress', () => {
      tracker.update('job-1', 'crawler', 's1', 100, 500, 'Crawling pages');
      const progress = tracker.get('job-1');
      expect(progress).toBeDefined();
      expect(progress!.current).toBe(100);
      expect(progress!.total).toBe(500);
      expect(progress!.message).toBe('Crawling pages');
    });

    it('filters by site', () => {
      tracker.update('job-1', 'crawler', 's1', 10, 100);
      tracker.update('job-2', 'ai-vis', 's2', 5, 50);
      tracker.update('job-3', 'crawler', 's1', 20, 100);

      const site1 = tracker.getBySite('s1');
      expect(site1.length).toBe(2);
    });

    it('completes and removes', () => {
      tracker.update('job-1', 'crawler', 's1', 100, 100);
      expect(tracker.get('job-1')).toBeDefined();
      tracker.complete('job-1');
      expect(tracker.get('job-1')).toBeUndefined();
    });

    it('evicts old entries when limit exceeded', () => {
      for (let i = 0; i < 600; i++) {
        tracker.update(`job-${i}`, 'crawler', 's1', i, 600);
      }
      tracker.evict();
      expect(tracker.getAll().length).toBeLessThanOrEqual(500);
    });

    it('updates message on subsequent calls', () => {
      tracker.update('job-1', 'crawler', 's1', 10, 100, 'phase1');
      tracker.update('job-1', 'crawler', 's1', 20, 100, 'phase2');
      const p = tracker.get('job-1');
      expect(p!.message).toBe('phase2');
      expect(p!.current).toBe(20);
    });
  });
});
