import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, SiteSecret, WordPressIntegration, WordPressPost } from '@creative-seo/database';
import { WordPressClientService } from './wordpress-client.service';
import { WordPressController, SiteWordPressController } from './wordpress.controller';
import { WordPressService } from './wordpress.service';

@Module({
  imports: [TypeOrmModule.forFeature([WordPressIntegration, WordPressPost, Site, SiteSecret])],
  controllers: [WordPressController, SiteWordPressController],
  providers: [WordPressService, WordPressClientService],
  exports: [WordPressService],
})
export class WordPressModule {}
