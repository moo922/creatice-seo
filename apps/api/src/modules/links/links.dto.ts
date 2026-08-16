import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LINK_DETECTIONS,
  LINK_SUGGESTION_STATUSES,
  type LinkDetection,
  type LinkSuggestionStatus,
} from '@creative-seo/types';

export class CrawledLinkDto {
  @IsString()
  @MaxLength(2000)
  url: string;

  @IsString()
  @MaxLength(500)
  anchor: string;
}

export class CreateCrawledPageDto {
  @IsString()
  @MaxLength(2000)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  title?: string | null;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  httpStatus?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headings?: string[];

  @IsOptional()
  @IsArray()
  outLinks?: CrawledLinkDto[];
}

export class LinkSuggestionDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class StartCrawlDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  maxPages?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(10)
  maxDepth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  seedPath?: string;
}

export class RunAuditDto {
  @IsOptional()
  @IsString()
  crawlRunId?: string;

  @IsOptional()
  @IsBoolean()
  persist?: boolean;
}

export class RunLighthouseDto {
  @IsString()
  @MaxLength(2000)
  url: string;
}

export class ApplyLinkSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  appliedSnapshot?: Record<string, unknown>;
}

export class VerifyLinkSuggestionDto {
  @IsBoolean()
  found: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class LinkSuggestionQueryDto {
  @IsOptional()
  @IsIn(LINK_SUGGESTION_STATUSES)
  status?: LinkSuggestionStatus;

  @IsOptional()
  @IsIn(LINK_DETECTIONS)
  detection?: LinkDetection;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  targetUrl?: string;

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
