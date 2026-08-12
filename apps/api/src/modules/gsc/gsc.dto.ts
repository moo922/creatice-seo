import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import {
  GSC_DIMENSIONS,
  GSC_OPPORTUNITY_KINDS,
  GSC_OPPORTUNITY_STATUSES,
  type GscDimension,
} from '@creative-seo/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class GscSyncQueryDto {
  /** Comma-separated Search Console dimensions, e.g. "query,page". */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((part) => part.trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(GSC_DIMENSIONS as readonly string[], { each: true })
  dimensions?: GscDimension[];

  @IsOptional()
  @Matches(DATE_RE)
  startDate?: string;

  @IsOptional()
  @Matches(DATE_RE)
  endDate?: string;
}

export class GscPerformanceQueryDto {
  /** Single dimension to group the response by (defaults to "query"). */
  @IsOptional()
  @IsIn(GSC_DIMENSIONS as readonly string[])
  dimension?: GscDimension;

  @IsOptional()
  @Matches(DATE_RE)
  startDate?: string;

  @IsOptional()
  @Matches(DATE_RE)
  endDate?: string;
}

export class GscOpportunitiesQueryDto {
  @IsOptional()
  @IsIn(GSC_OPPORTUNITY_KINDS)
  kind?: (typeof GSC_OPPORTUNITY_KINDS)[number];

  @IsOptional()
  @IsIn(GSC_OPPORTUNITY_STATUSES)
  status?: (typeof GSC_OPPORTUNITY_STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => Number(value))
  windowDays?: number;
}

export class GscRegisterTokensDto {
  @IsString()
  accessToken: string;

  @IsString()
  refreshToken: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  expiresIn?: number;
}

export class GscSelectPropertyDto {
  @IsString()
  siteUrl: string;
}

export class GscConnectRequestDto {
  @IsString()
  siteUrl: string;

  @IsOptional()
  @IsString()
  permissionLevel?: string;

  @IsOptional()
  @IsIn(['URL_PREFIX', 'DOMAIN'])
  type?: 'URL_PREFIX' | 'DOMAIN';
}

export interface OauthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}
