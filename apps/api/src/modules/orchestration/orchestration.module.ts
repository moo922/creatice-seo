import { Module } from '@nestjs/common';
import { N8nCallbackController, OrchestrationAdminController, SiteOrchestrationController } from './orchestration.controller';

@Module({
  controllers: [SiteOrchestrationController, OrchestrationAdminController, N8nCallbackController],
})
export class OrchestrationModule {}
