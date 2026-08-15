import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { REPORT_LANGUAGES, REPORT_TYPES, type ReportLanguage, type ReportType } from '@creative-seo/types';

export class SaveReportBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  agencyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agencyLogoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientLogoUrl?: string;

  @IsOptional()
  @IsObject()
  contactDetails?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  footer?: string;
}

export class GenerateReportDto {
  @IsIn(REPORT_TYPES)
  type: ReportType;

  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  /** Report language; Arabic renders right-to-left. Defaults to 'en'. */
  @IsOptional()
  @IsIn(REPORT_LANGUAGES)
  lang?: ReportLanguage;
}

export class ReportQueryDto {
  @IsOptional()
  @IsIn(REPORT_TYPES)
  type?: ReportType;

  @IsOptional()
  @IsUUID()
  siteId?: string;

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
