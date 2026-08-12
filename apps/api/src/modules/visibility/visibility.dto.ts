import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { VISIBILITY_CATEGORIES, type VisibilityCategory } from '@creative-seo/types';

export class VisibilityPromptDto {
  @IsIn(VISIBILITY_CATEGORIES)
  category: VisibilityCategory;

  @IsString()
  @MaxLength(2000)
  prompt: string;
}

export class UpdatePromptSetDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VisibilityPromptDto)
  prompts?: VisibilityPromptDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateVisibilityRunDto {
  @IsOptional()
  @IsDateString()
  observedAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsIn(VISIBILITY_CATEGORIES, { each: true })
  categories?: VisibilityCategory[];
}

export class VisibilityObservationQueryDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsIn(VISIBILITY_CATEGORIES)
  category?: VisibilityCategory;

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
