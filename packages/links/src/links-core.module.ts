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
} from '@creative-seo/database';
import { LinksService } from './links.service';
import { AuditService } from './audit.service';
import { LighthouseService } from './lighthouse.service';

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
    ]),
  ],
  providers: [LinksService, AuditService, LighthouseService],
  exports: [LinksService, AuditService, LighthouseService],
})
export class LinksCoreModule {}
