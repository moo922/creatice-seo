import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiVisibilityObservation, AiVisibilityPromptSet, AiVisibilityRun } from '@creative-seo/database';
import { VisibilityService } from './visibility.service';

/**
 * AI visibility observation infrastructure for the API and worker apps.
 * Depends on the global AiCoreModule from @creative-seo/ai (AiService) which
 * host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiVisibilityPromptSet, AiVisibilityRun, AiVisibilityObservation])],
  providers: [VisibilityService],
  exports: [VisibilityService],
})
export class VisibilityCoreModule {}
