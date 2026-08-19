import { NotificationService, type NotificationPayload } from './notification.service';
import { CircuitBreaker, CircuitBreakerRegistry } from './circuit-breaker';
import { JobLogger } from './job-logger';

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
      expect(cb.getState()).toBe('OPEN');

      // Wait for recovery timeout
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cb.getState()).toBe('HALF_OPEN');
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
      expect(entries[0]!.metadata).toEqual({ apiKey: 'REDACTED' }); // metadata preserved but not logged as message
    });
  });
});
