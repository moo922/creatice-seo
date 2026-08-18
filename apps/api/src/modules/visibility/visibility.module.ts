import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, AiVisibilityCompetitor, AiVisibilityPromptSetV2, AiVisibilityPrompt, AiVisibilitySourceProvenance, AiVisibilityBudget, AiProviderCapability } from '@creative-seo/database';
import { SiteVisibilityController } from './visibility.controller';
import {
  VisibilityCompetitorController,
  VisibilityPromptSetController,
  VisibilityBudgetController,
  VisibilitySourceController,
  ProviderCapabilitiesController,
} from './gc06-visibility.controller';
import { AiCoreModule } from '@creative-seo/ai';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      AiVisibilityCompetitor,
      AiVisibilityPromptSetV2,
      AiVisibilityPrompt,
      AiVisibilitySourceProvenance,
      AiVisibilityBudget,
      AiProviderCapability,
    ]),
    AiCoreModule,
  ],
  controllers: [
    SiteVisibilityController,
    VisibilityCompetitorController,
    VisibilityPromptSetController,
    VisibilityBudgetController,
    VisibilitySourceController,
    ProviderCapabilitiesController,
  ],
})
export class VisibilityModule {}
