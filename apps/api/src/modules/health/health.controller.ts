import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async readiness() {
    const checks: Record<string, 'up' | 'down'> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    const ready = checks.database === 'up' && checks.redis === 'up';
    if (!ready) {
      throw new ServiceUnavailableException({ status: 'not_ready', checks });
    }
    return { status: 'ready', checks };
  }
}
