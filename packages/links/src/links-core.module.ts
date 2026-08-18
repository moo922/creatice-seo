import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  CrawledPage,
  CrawlError,
  CrawlLink,
  CrawlPage,
  CrawlRun,
  AuditRun,
  AuditResult,
  LighthouseRun,
  Keyword,
  LinkAnalysis,
  LinkSuggestion,
  UrlMapping,
  AeoPageAudit,
  GeoPageAudit,
  KnowledgeFact,
  PageQuestion,
  EntityRelation,
  CrawlerPolicyResult,
  AiCrawlerRegistry,
  Site,
} from '@creative-seo/database';
import { LinksService } from './links.service';
import { AuditService } from './audit.service';
import { LighthouseService } from './lighthouse.service';
import { AeoAuditService } from './aeo-audit.service';
import { GeoAuditService } from './geo-audit.service';
import { AiCrawlerPolicyService } from './ai-crawler-policy.service';
import { AiCoreModule } from '@creative-seo/ai';

/**
 * Internal-link intelligence + deterministic audit infrastructure for the API
 * and worker apps. Depends on the global OperationsCoreModule from
 * @creative-seo/operations (for the change log on applied changes and issue
 * persistence) which host applications must import.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrawledPage,
      CrawlRun,
      CrawlPage,
      CrawlLink,
      CrawlError,
      AuditRun,
      AuditResult,
      LighthouseRun,
      LinkAnalysis,
      LinkSuggestion,
      UrlMapping,
      Cluster,
      ClusterKeyword,
      Keyword,
      AeoPageAudit,
      GeoPageAudit,
      KnowledgeFact,
      PageQuestion,
      EntityRelation,
      CrawlerPolicyResult,
      AiCrawlerRegistry,
      Site,
    ]),
    AiCoreModule,
  ],
  providers: [LinksService, AuditService, LighthouseService, AeoAuditService, GeoAuditService, AiCrawlerPolicyService],
  exports: [LinksService, AuditService, LighthouseService, AeoAuditService, GeoAuditService, AiCrawlerPolicyService],
})
export class LinksCoreModule {}
