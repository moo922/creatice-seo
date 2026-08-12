import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { SiteLinksController } from './links.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [SiteLinksController],
})
export class LinksModule {}
