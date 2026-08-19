import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Distributed Lock — prevents concurrent execution of mutually exclusive operations
 * using Redis SET NX PX (atomic set-if-not-exists with expiry).
 *
 * Use cases:
 *   Prevent two full crawls simultaneously
 *   Prevent two GSC syncs for same site/date
 *   Prevent two monthly snapshots
 *   Prevent duplicate reports
 *
 * The lock auto-expires after `ttlMs` to prevent deadlocks from crashed workers.
 */

export interface LockOptions {
  ttlMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface Lock {
  key: string;
  value: string;
  acquiredAt: number;
  ttlMs: number;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttlMs: 300_000, // 5 minutes
  retryAttempts: 3,
  retryDelayMs: 100,
};

export class DistributedLock {
  private readonly logger = new Logger(DistributedLock.name);
  private readonly locks = new Map<string, Lock>();

  constructor(private readonly redis: Redis) {}

  /**
   * Acquire a distributed lock.
   * Returns the lock handle if acquired, null if not.
   */
  async acquire(
    name: string,
    options: LockOptions = {},
  ): Promise<Lock | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const key = `lock:${name}`;
    const value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    for (let attempt = 0; attempt <= opts.retryAttempts; attempt++) {
      try {
        const result = await this.redis.set(key, value, 'PX', opts.ttlMs, 'NX');
        if (result === 'OK') {
          const lock: Lock = { key, value, acquiredAt: Date.now(), ttlMs: opts.ttlMs };
          this.locks.set(name, lock);
          return lock;
        }
      } catch (error) {
        this.logger.warn(`Lock acquire error for "${name}": ${error}`);
        return null;
      }

      if (attempt < opts.retryAttempts) {
        await sleep(opts.retryDelayMs * (attempt + 1));
      }
    }

    return null;
  }

  /**
   * Release a distributed lock (only if we still own it).
   */
  async release(name: string): Promise<boolean> {
    const lock = this.locks.get(name);
    if (!lock) return false;

    try {
      // Lua script: check value matches then delete (atomic)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.redis.eval(script, 1, lock.key, lock.value) as number;
      this.locks.delete(name);
      return result === 1;
    } catch (error) {
      this.logger.warn(`Lock release error for "${name}": ${error}`);
      return false;
    }
  }

  /**
   * Check if a lock is currently held.
   */
  async isLocked(name: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(`lock:${name}`);
      return result === 1;
    } catch {
      return false;
    }
  }

  /**
   * Get all currently held locks (for observability).
   */
  getHeldLocks(): Lock[] {
    return Array.from(this.locks.values());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
