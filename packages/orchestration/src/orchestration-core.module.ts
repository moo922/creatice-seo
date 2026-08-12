import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowJob } from '@creative-seo/database';
import { OrchestrationService } from './orchestration.service';

/**
 * n8n orchestration infrastructure for the API and worker apps. Depends on the
 * global OperationsCoreModule from @creative-seo/operations (for failure
 * alerts) which host applications must import.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WorkflowJob])],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationCoreModule {}
