import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../../config/app-config';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfig): Redis => new Redis(config.env.REDIS_URL),
      inject: [AppConfig],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
