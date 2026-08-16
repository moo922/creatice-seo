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
  Keyword,
  LinkAnalysis,
  LinkSuggestion,
  UrlMapping,
} from '@creative-seo/database';
import { LinksService } from './links.service';
import { AuditService } from './audit.service';

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
      LinkAnalysis,
      LinkSuggestion,
      UrlMapping,
      Cluster,
      ClusterKeyword,
      Keyword,
    ]),
  ],
  providers: [LinksService, AuditService],
  exports: [LinksService, AuditService],
})
export class LinksCoreModule {}
