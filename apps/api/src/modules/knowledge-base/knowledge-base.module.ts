import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeFact } from '@creative-seo/database';
import { AccessControlModule } from '../access-control/access-control.module';
import { KnowledgeBaseController, SiteKnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeFact]), AccessControlModule],
  controllers: [KnowledgeBaseController, SiteKnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
