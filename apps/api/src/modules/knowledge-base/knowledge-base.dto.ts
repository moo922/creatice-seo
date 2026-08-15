import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_VERIFICATION_STATUSES,
} from '@creative-seo/types';

export class CreateKnowledgeFactDto {
  @IsIn(KNOWLEDGE_CATEGORIES)
  category: (typeof KNOWLEDGE_CATEGORIES)[number];

  @IsString()
  @MaxLength(100)
  key: string;

  @IsString()
  @MaxLength(10000)
  value: string;

  @IsOptional()
  @IsIn(KNOWLEDGE_VERIFICATION_STATUSES)
  verificationStatus: (typeof KNOWLEDGE_VERIFICATION_STATUSES)[number] = 'UNVERIFIED';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateKnowledgeFactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  value?: string;

  @IsOptional()
  @IsIn(KNOWLEDGE_VERIFICATION_STATUSES)
  verificationStatus?: (typeof KNOWLEDGE_VERIFICATION_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListKnowledgeFactsDto {
  @IsOptional()
  @IsIn(KNOWLEDGE_CATEGORIES)
  category?: (typeof KNOWLEDGE_CATEGORIES)[number];

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perPage: number = 200;
}
