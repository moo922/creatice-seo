import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { SiteVisibilityController } from './visibility.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [SiteVisibilityController],
})
export class VisibilityModule {}
