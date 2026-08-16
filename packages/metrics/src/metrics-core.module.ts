import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  GscPageDailyMetric,
  GscSiteDailyMetric,
} from '@creative-seo/database';
import { MetricsService } from './metrics.service';

/**
 * Canonical metric infrastructure. Exposes only grain-safe read methods so
 * application code can never accidentally sum SITE_DAILY + QUERY_DAILY +
 * PAGE_DAILY rows (which would double-count the same traffic).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      GscSiteDailyMetric,
      GscQueryDailyMetric,
      GscPageDailyMetric,
      GscQueryPageDailyMetric,
    ]),
  ],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsCoreModule {}
