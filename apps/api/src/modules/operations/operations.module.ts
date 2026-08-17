import { Module } from '@nestjs/common';
import { AdminOperationsController, SiteOperationsController } from './operations.controller';
import { SiteMonitoringController } from './monitoring.controller';
import {
  PerformanceController,
  SiteBaselineController,
  SiteProgressController,
} from './performance.controller';

@Module({
  controllers: [
    SiteOperationsController,
    SiteMonitoringController,
    AdminOperationsController,
    PerformanceController,
    SiteBaselineController,
    SiteProgressController,
  ],
})
export class OperationsModule {}
