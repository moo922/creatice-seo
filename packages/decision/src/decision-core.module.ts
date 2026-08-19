import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation, Issue, OperationsTask, WorkItemState, KeywordOpportunity, CannibalizationCase, LinkSuggestion } from '@creative-seo/database';

/**
 * Decision Engine — cross-domain prioritization, conflict detection,
 * deduplication, dependency tracking, work packages, and next best action.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Recommendation,
      Issue,
      OperationsTask,
      WorkItemState,
      KeywordOpportunity,
      CannibalizationCase,
      LinkSuggestion,
    ]),
  ],
  providers: [],
  exports: [],
})
export class DecisionCoreModule {}
