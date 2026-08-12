import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  CrawledPage,
  Keyword,
  LinkAnalysis,
  LinkSuggestion,
  UrlMapping,
} from '@creative-seo/database';
import { LinksService } from './links.service';

/**
 * Internal-link intelligence infrastructure for the API and worker apps.
 * Depends on the global OperationsCoreModule from @creative-seo/operations
 * (for the change log on applied changes) which host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([CrawledPage, LinkAnalysis, LinkSuggestion, UrlMapping, Cluster, ClusterKeyword, Keyword])],
  providers: [LinksService],
  exports: [LinksService],
})
export class LinksCoreModule {}
