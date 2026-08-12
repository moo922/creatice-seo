import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTENT_LANGUAGES, PIPELINE_STATUSES, type ContentLanguage, type PipelineStatus } from '@creative-seo/types';

export class InternalLinkCandidateDto {
  @IsString()
  @MaxLength(2000)
  url: string;

  @IsString()
  @MaxLength(300)
  anchorText: string;
}

export class RunPipelineRequestDto {
  @IsOptional()
  @IsString()
  clusterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  existingPageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60000)
  existingPageContent?: string | null;

  @IsOptional()
  @IsIn(CONTENT_LANGUAGES)
  language?: ContentLanguage;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryKeyword?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  secondaryKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  verifiedFacts?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InternalLinkCandidateDto)
  internalLinkCandidates?: InternalLinkCandidateDto[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  researchEvidence?: string | null;
}

export class BriefDecisionDto {
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  note?: string;
}

export class ContentPackagesQueryDto {
  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreatePublicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  slug?: string | null;
}
