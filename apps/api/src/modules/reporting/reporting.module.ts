import { Module } from '@nestjs/common';
import { SiteReportingController } from './reporting.controller';

@Module({
  controllers: [SiteReportingController],
})
export class ReportingModule {}
