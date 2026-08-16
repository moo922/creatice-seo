import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GscDailyMetric,
  GscProperty,
  GscSiteDailyMetric,
  Site,
  SiteActivationStep,
  WordPressPost,
} from '@creative-seo/database';
import { ActivationController } from './activation.controller';
import { ActivationService } from './activation.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { GscModule } from '../gsc/gsc.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Site, SiteActivationStep, WordPressPost, GscProperty, GscDailyMetric, GscSiteDailyMetric]),
    WordPressModule,
    KeywordsModule,
    GscModule,
    ActivityLogModule,
  ],
  controllers: [ActivationController],
  providers: [ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
