import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { SiteLinksController } from './links.controller';
import { AuditRulesController, SiteAuditController } from './audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [SiteLinksController, SiteAuditController, AuditRulesController],
})
export class LinksModule {}
