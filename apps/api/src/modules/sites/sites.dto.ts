import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SITE_ROLES, SITE_STATUSES } from '@creative-seo/types';

const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(\.[a-zA-Z0-9-]{1,63})+$/;

export class CreateSiteDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(DOMAIN_REGEX, {
    message: 'domain must be a valid hostname without protocol or path (e.g. example.com)',
  })
  domain: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale: string = 'en';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language: string = 'English';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  targetCities?: string[];
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Matches(DOMAIN_REGEX, {
    message: 'domain must be a valid hostname without protocol or path (e.g. example.com)',
  })
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  targetCities?: string[];

  @IsOptional()
  @IsIn(SITE_STATUSES)
  status?: (typeof SITE_STATUSES)[number];
}

export class CreateMembershipDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsIn(SITE_ROLES)
  siteRole: (typeof SITE_ROLES)[number] = 'VIEWER';
}

export class SiteQueryDto {
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  perPage: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsIn(SITE_STATUSES)
  status?: (typeof SITE_STATUSES)[number];
}
