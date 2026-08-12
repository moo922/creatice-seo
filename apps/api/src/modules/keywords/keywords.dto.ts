import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { KEYWORD_INTENTS, KEYWORD_SOURCES, type ClusterAction, type KeywordIntent, type KeywordSource } from '@creative-seo/types';

export class SeedKeywordDto {
  @IsString()
  @MaxLength(200)
  keyword: string;

  @IsOptional()
  @IsIn(KEYWORD_INTENTS)
  intent?: KeywordIntent;

  @IsOptional()
  @IsIn(KEYWORD_SOURCES)
  source?: KeywordSource;
}

export class KeywordPipelineRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsBoolean()
  discoverFromGsc?: boolean;
}

export class ApproveClusterDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetUrl?: string;

  @IsOptional()
  @IsIn(['KEEP', 'UPDATE', 'EXPAND', 'CREATE', 'MERGE', 'REDIRECT', 'REVIEW'])
  action?: ClusterAction;
}

export class OverrideMappingDto {
  @IsString()
  @MaxLength(2000)
  url: string;
}

export class KeywordQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  intent?: string;
}

export class SiteIdQueryDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;
}
