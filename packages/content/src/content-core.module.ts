import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentPackage } from '@creative-seo/database';
import { ContentPackagesService } from './content-packages.service';
import { ContentPipelineService } from './pipeline.service';

/**
 * Content intelligence pipeline infrastructure for the API and worker apps.
 * Depends on the global AiCoreModule from @creative-seo/ai (AiService,
 * PromptRegistryService), which host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ContentPackage])],
  providers: [ContentPackagesService, ContentPipelineService],
  exports: [ContentPackagesService, ContentPipelineService],
})
export class ContentCoreModule {}
