import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, AeoPageAudit, GeoPageAudit, AuditRun, CrawlPage, CrawlRun, KnowledgeFact, PageQuestion, UrlMapping, EntityRelation } from '@creative-seo/database';
import { SiteLinksController } from './links.controller';
import { AuditRulesController, SiteAuditController, SiteLighthouseController } from './audit.controller';
import { AeoAuditController, GeoAuditController } from './aeo-geo.controller';
import { AuditService } from '@creative-seo/links';
import { AeoAuditService } from '@creative-seo/links';
import { GeoAuditService } from '@creative-seo/links';
import { AiCoreModule } from '@creative-seo/ai';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site, AeoPageAudit, GeoPageAudit, AuditRun, CrawlPage, CrawlRun,
      KnowledgeFact, PageQuestion, UrlMapping, EntityRelation,
    ]),
    AiCoreModule,
  ],
  controllers: [
    SiteLinksController, SiteAuditController, AuditRulesController,
    SiteLighthouseController, AeoAuditController, GeoAuditController,
  ],
  providers: [AuditService, AeoAuditService, GeoAuditService],
  exports: [AuditService, AeoAuditService, GeoAuditService],
})
export class LinksModule {}
