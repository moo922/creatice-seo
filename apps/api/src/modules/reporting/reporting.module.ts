import { Module } from '@nestjs/common';
import { AdminReportingController, SiteReportingController } from './reporting.controller';

@Module({
  controllers: [SiteReportingController, AdminReportingController],
})
export class ReportingModule {}
