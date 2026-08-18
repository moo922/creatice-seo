import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiVisibilityObservation,
  AiVisibilityPromptSet,
  AiVisibilityRun,
  AiVisibilityPromptSetV2,
  AiVisibilityPrompt,
  AiVisibilityCompetitor,
  AiVisibilityObservationV2,
  AiVisibilitySourceProvenance,
  AiProviderCapability,
  AiVisibilityBudget,
  AiVisibilityBaseline,
  AiVisibilitySnapshot,
} from '@creative-seo/database';
import { VisibilityService } from './visibility.service';
import { CostBudgetService } from './cost-budget';
import { BaselineService } from './baseline';
import { SnapshotService } from './snapshot';
import { ObservationEngine } from './observation-engine';

/**
 * AI visibility observation infrastructure for the API and worker apps.
 * Depends on the global AiCoreModule from @creative-seo/ai (AiService) which
 * host applications must import.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiVisibilityPromptSet,
      AiVisibilityRun,
      AiVisibilityObservation,
      AiVisibilityPromptSetV2,
      AiVisibilityPrompt,
      AiVisibilityCompetitor,
      AiVisibilityObservationV2,
      AiVisibilitySourceProvenance,
      AiProviderCapability,
      AiVisibilityBudget,
      AiVisibilityBaseline,
      AiVisibilitySnapshot,
    ]),
  ],
  providers: [VisibilityService, CostBudgetService, BaselineService, SnapshotService, ObservationEngine],
  exports: [VisibilityService, CostBudgetService, BaselineService, SnapshotService, ObservationEngine],
})
export class VisibilityCoreModule {}
