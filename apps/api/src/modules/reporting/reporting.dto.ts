import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REPORT_TYPES, type ReportType } from '@creative-seo/types';

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
}

export class ReportQueryDto {
  @IsOptional()
  @IsIn(REPORT_TYPES)
  type?: ReportType;

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
