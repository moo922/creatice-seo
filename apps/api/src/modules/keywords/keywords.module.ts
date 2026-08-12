import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Cluster,
  ClusterKeyword,
  GscDailyMetric,
  GscProperty,
  Keyword,
  KeywordMetric,
  Site,
  UrlMapping,
} from '@creative-seo/database';
import { SiteKeywordsController } from './keywords.controller';
import { KeywordsService } from './keywords.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      Keyword,
      KeywordMetric,
      Cluster,
      ClusterKeyword,
      UrlMapping,
      GscProperty,
      GscDailyMetric,
    ]),
  ],
  controllers: [SiteKeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}
