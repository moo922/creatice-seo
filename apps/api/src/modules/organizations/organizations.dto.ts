import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ORGANIZATION_STATUSES } from '@creative-seo/types';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,63}$/, {
    message: 'slug must be lowercase alphanumeric with dashes (2-64 chars)',
  })
  slug?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES)
  status?: (typeof ORGANIZATION_STATUSES)[number];
}
