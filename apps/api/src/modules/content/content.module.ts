import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cluster, ClusterKeyword, ContentPackage, ContentPublication, Keyword, KeywordMetric, Site } from '@creative-seo/database';
import { WordPressModule } from '../wordpress/wordpress.module';
import { SiteContentController } from './content.controller';
import { ContentInputResolver } from './content.resolver';
import { ContentPublishService } from './content-publish.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Cluster, ClusterKeyword, Keyword, KeywordMetric, ContentPackage, ContentPublication]), WordPressModule],
  controllers: [SiteContentController],
  providers: [ContentInputResolver, ContentPublishService],
})
export class ContentModule {}
