import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cluster, ClusterKeyword, Keyword, KeywordMetric, Site } from '@creative-seo/database';
import { SiteContentController } from './content.controller';
import { ContentInputResolver } from './content.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Cluster, ClusterKeyword, Keyword, KeywordMetric])],
  controllers: [SiteContentController],
  providers: [ContentInputResolver],
})
export class ContentModule {}
