import { Module } from '@nestjs/common';
import { AdminOperationsController, SiteOperationsController } from './operations.controller';
import { SiteMonitoringController } from './monitoring.controller';

@Module({
  controllers: [SiteOperationsController, SiteMonitoringController, AdminOperationsController],
})
export class OperationsModule {}
