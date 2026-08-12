import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '@creative-seo/database';
import { AiAdminController, SiteAiController } from './ai.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [SiteAiController, AiAdminController],
})
export class AiModule {}
