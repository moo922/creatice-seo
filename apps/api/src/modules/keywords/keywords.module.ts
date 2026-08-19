import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CannibalizationCase,
  Cluster,
  ClusterKeyword,
  CrawlRun,
  CrawlPage,
  GoogleAdsIntegration,
  GscDailyMetric,
  GscProperty,
  GscQueryDailyMetric,
  GscQueryPageDailyMetric,
  Keyword,
  KeywordDiscoveryJob,
  KeywordMetric,
  KeywordOpportunity,
  KeywordPlannerMetric,
  KeywordSource,
  Site,
  SiteSecret,
  UrlMapping,
  WordPressPost,
} from '@creative-seo/database';
import { AiCoreModule } from '@creative-seo/ai';
import { SiteKeywordsController } from './keywords.controller';
import { KeywordsService } from './keywords.service';
import { GoogleAdsController } from './google-ads.controller';
import { GoogleAdsService } from './google-ads.service';
import { GoogleAdsClientService } from './google-ads-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      SiteSecret,
      Keyword,
      KeywordSource,
      KeywordMetric,
      KeywordPlannerMetric,
      KeywordDiscoveryJob,
      KeywordOpportunity,
      CannibalizationCase,
      GoogleAdsIntegration,
      Cluster,
      ClusterKeyword,
      UrlMapping,
      GscProperty,
      GscDailyMetric,
      GscQueryDailyMetric,
      GscQueryPageDailyMetric,
      CrawlRun,
      CrawlPage,
      WordPressPost,
    ]),
    AiCoreModule,
  ],
  controllers: [SiteKeywordsController, GoogleAdsController],
  providers: [KeywordsService, GoogleAdsService, GoogleAdsClientService],
  exports: [KeywordsService, GoogleAdsService],
})
export class KeywordsModule {}