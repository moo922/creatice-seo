import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { REDIS_CLIENT, RedisModule } from '../redis/redis.module';
import { RedisThrottlerStorage } from './redis-throttler-storage';

/**
 * Global rate limiting. The default throttler applies to every route; auth
 * endpoints tighten limits via the @Throttle decorator. Storage is Redis-backed
 * with an in-memory fallback (see RedisThrottlerStorage).
 */
@Global()
@Module({
  imports: [
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: Redis) => ({
        throttlers: [
          {
            ttl: config.env.THROTTLE_TTL,
            limit: config.env.THROTTLE_LIMIT,
            blockDuration: config.env.THROTTLE_TTL,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [ThrottlerModule],
})
export class ThrottleModule {}
