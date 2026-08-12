import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';

/**
 * Redis-backed throttle storage implementing the @nestjs/throttler v6
 * `increment` contract. Falls back to in-process memory when Redis is
 * unavailable so rate limiting never takes the service down. In-memory mode is
 * per-process; scale-out deployments should rely on Redis.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private redisAvailable = true;

  private readonly memory = new Map<
    string,
    { hits: number[]; windowExpiresAt: number; blockExpiresAt: number; isBlocked: boolean }
  >();

  constructor(private readonly redis: Redis) {
    this.redis.on('error', (error) => {
      if (this.redisAvailable) {
        this.logger.warn(`Redis throttle storage degraded to in-memory: ${String(error)}`);
      }
      this.redisAvailable = false;
    });
    this.redis.on('ready', () => {
      if (!this.redisAvailable) {
        this.logger.log('Redis throttle storage reconnected');
      }
      this.redisAvailable = true;
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      if (this.redisAvailable) {
        return await this.incrementRedis(key, ttl, limit, blockDuration);
      }
    } catch (error) {
      this.logger.debug(`increment fallback to memory: ${String(error)}`);
      this.redisAvailable = false;
    }
    return this.incrementMemory(key, ttl, limit, blockDuration);
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const blockKey = `${key}:block`;

    const blocked = await this.redis.get(blockKey);
    if (blocked) {
      const timeToBlockExpire = Math.max(1, Math.ceil((await this.redis.pttl(blockKey)) / 1000));
      const timeToExpire = await this.redisTimeToExpire(key, ttl);
      return { totalHits: limit + 1, timeToExpire, isBlocked: true, timeToBlockExpire };
    }

    const pipeline = this.redis.multi();
    pipeline.zadd(key, now, `${now}-${randomUUID()}`);
    pipeline.zremrangebyscore(key, 0, now - ttl);
    pipeline.pexpire(key, ttl);
    await pipeline.exec();

    const totalHits = await this.redis.zcard(key);
    const timeToExpire = await this.redisTimeToExpire(key, ttl);

    if (totalHits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.max(1, Math.ceil(blockDuration / 1000)),
      };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }

  private async redisTimeToExpire(key: string, ttl: number): Promise<number> {
    const earliest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    if (!earliest || earliest.length < 2) {
      return Math.ceil(ttl / 1000);
    }
    const earliestHit = Number(earliest[1]);
    return Math.max(1, Math.ceil((earliestHit + ttl - Date.now()) / 1000));
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    let record = this.memory.get(key);
    if (!record || now >= record.windowExpiresAt) {
      record = { hits: [], windowExpiresAt: now + ttl, blockExpiresAt: 0, isBlocked: false };
      this.memory.set(key, record);
    }

    let timeToExpire = Math.max(1, Math.ceil((record.windowExpiresAt - now) / 1000));

    if (!record.isBlocked) {
      record.hits.push(now);
    }

    if (record.hits.length > limit && !record.isBlocked) {
      record.isBlocked = true;
      record.blockExpiresAt = now + blockDuration;
    }

    let timeToBlockExpire = Math.ceil((record.blockExpiresAt - now) / 1000);
    if (timeToBlockExpire <= 0 && record.isBlocked) {
      record.isBlocked = false;
      record.hits = [now];
      timeToExpire = Math.max(1, Math.ceil(ttl / 1000));
      timeToBlockExpire = 0;
    }

    if (this.memory.size > 10_000) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) {
        this.memory.delete(oldestKey);
      }
    }

    return {
      totalHits: record.hits.length,
      timeToExpire,
      isBlocked: record.isBlocked,
      timeToBlockExpire: Math.max(0, timeToBlockExpire),
    };
  }
}
