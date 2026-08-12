import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ORCHESTRATION_WORKFLOWS,
  WORKFLOW_JOB_STATUSES,
  type OrchestrationWorkflow,
  type WorkflowJobStatus,
} from '@creative-seo/types';

export class CreateOrchestrationJobDto {
  @IsIn(ORCHESTRATION_WORKFLOWS)
  workflow: OrchestrationWorkflow;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class OrchestrationJobQueryDto {
  @IsOptional()
  @IsIn(WORKFLOW_JOB_STATUSES)
  status?: WorkflowJobStatus;

  @IsOptional()
  @IsIn(ORCHESTRATION_WORKFLOWS)
  workflow?: OrchestrationWorkflow;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  offset?: number;
}

export class N8nCallbackDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  executionId?: string;

  @IsIn(['SUCCEEDED', 'FAILED'])
  status: 'SUCCEEDED' | 'FAILED';

  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
