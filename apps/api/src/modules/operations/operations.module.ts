import { Module } from '@nestjs/common';
import { SiteMonitoringController } from './monitoring.controller';
import { SiteOperationsController } from './operations.controller';

@Module({
  controllers: [SiteOperationsController, SiteMonitoringController],
})
export class OperationsModule {}
