import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GscDailyMetric,
  GscOpportunity,
  GscPageDailyMetric,
  GscProperty,
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  GscSiteDailyMetric,
  GscSyncState,
  GscToken,
  Site,
} from '@creative-seo/database';
import { GscClientService } from './gsc-client.service';
import { GscController, GscOauthController } from './gsc.controller';
import { GscService } from './gsc.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      GscProperty,
      GscToken,
      GscDailyMetric,
      GscSiteDailyMetric,
      GscQueryDailyMetric,
      GscPageDailyMetric,
      GscQueryPageDailyMetric,
      GscSyncState,
      GscOpportunity,
    ]),
  ],
  controllers: [GscController, GscOauthController],
  providers: [GscService, GscClientService],
  exports: [GscService],
})
export class GscModule {}
