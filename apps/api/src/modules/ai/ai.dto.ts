import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AI_JOB_STATUSES,
  AI_PROVIDER_KINDS,
  type AiProviderKind,
  type AiPromptStatus,
  type AiWorkflow,
} from '@creative-seo/types';

export class AiWorkflowOverrideDto {
  @IsOptional()
  @IsIn(AI_PROVIDER_KINDS)
  provider?: AiProviderKind;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsArray()
  @IsIn(AI_PROVIDER_KINDS, { each: true })
  fallback?: AiProviderKind[];
}

export class AiProviderConfigRequestDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  workflowOverrides?: Partial<Record<AiWorkflow, AiWorkflowOverrideDto>>;

  /** Provider kind -> API key to encrypt and store (never returned). */
  @IsOptional()
  @IsObject()
  apiKeys?: Partial<Record<AiProviderKind, string>>;

  @IsOptional()
  @IsArray()
  @IsIn(AI_PROVIDER_KINDS, { each: true })
  removeApiKeys?: AiProviderKind[];
}

export class AiGenerationRequestDto {
  @IsString()
  @MaxLength(100)
  workflow: string;

  @IsString()
  @MaxLength(200)
  promptName: string;

  @IsObject()
  variables: Record<string, string>;

  @IsOptional()
  @IsIn(AI_PROVIDER_KINDS)
  provider?: AiProviderKind;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128_000)
  maxOutputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  temperature?: number;
}

export class AiPromptCreateRequestDto {
  @IsString()
  @MaxLength(200)
  promptName: string;

  @IsString()
  systemPrompt: string;

  @IsString()
  template: string;

  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'DRAFT', 'DEPRECATED'])
  status?: AiPromptStatus;
}

export class AiPromptActivateRequestDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class AiJobsQueryDto {
  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflow?: string;

  @IsOptional()
  @IsIn(AI_JOB_STATUSES)
  status?: (typeof AI_JOB_STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class UpdateGlobalProviderDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  defaultModel?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TestProviderConnectionDto {
  @IsOptional()
  @IsString()
  apiKey?: string;
}

export class TestSiteProviderDto {
  @IsString()
  @IsIn(AI_PROVIDER_KINDS)
  kind!: AiProviderKind;
}
