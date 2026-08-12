import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALERT_KINDS,
  ALERT_STATUSES,
  BASELINE_TYPES,
  CHANGE_TYPES,
  ISSUE_KINDS,
  ISSUE_SEVERITIES,
  ISSUE_SOURCES,
  ISSUE_STATUSES,
  TASK_STATUSES,
  type AlertStatus,
  type BaselineMetricsDto,
  type BaselineType,
  type ChangeType,
  type IssueKind,
  type IssueSeverity,
  type IssueSource,
  type IssueStatus,
  type TaskStatus,
} from '@creative-seo/types';

export class CreateIssueDto {
  @IsIn(ISSUE_KINDS)
  kind: IssueKind;

  @IsIn(ISSUE_SEVERITIES)
  severity: IssueSeverity;

  @IsString()
  @MaxLength(2000)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string | null;

  @IsOptional()
  @IsIn(ISSUE_SOURCES)
  source?: IssueSource;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class UpdateIssueDto {
  @IsOptional()
  @IsIn(ISSUE_STATUSES)
  status?: IssueStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class CreateRecommendationDto {
  @IsString()
  issueId: string;

  @IsString()
  @MaxLength(2000)
  title: string;

  @IsString()
  @MaxLength(20000)
  evidence: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  reason?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  impact: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidence: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  effort: number;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  suggestedAction?: string;

  @IsOptional()
  @IsBoolean()
  aiExplain?: boolean;
}

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  issueId?: string | null;

  @IsOptional()
  @IsString()
  recommendationId?: string | null;

  @IsString()
  @MaxLength(2000)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string | null;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clientNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  evidence?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  clientNotes?: string;
}

export class CreateChangeLogDto {
  @IsString()
  @MaxLength(2000)
  pageUrl: string;

  @IsOptional()
  @IsString()
  taskId?: string | null;

  @IsIn(CHANGE_TYPES)
  changeType: ChangeType;

  @IsOptional()
  @IsObject()
  before?: Record<string, unknown> | null;

  @IsObject()
  after: Record<string, unknown>;
}

export class CreateBaselineDto {
  @IsIn(BASELINE_TYPES)
  type: BaselineType;

  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @IsObject()
  metrics: BaselineMetricsDto;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string | null;
}

class TrafficDto {
  @IsNumber()
  clicks: number;
  @IsNumber()
  prevClicks: number;
}

class CtrDto {
  @IsNumber()
  ctr: number;
  @IsNumber()
  prevCtr: number;
}

class PositionDto {
  @IsNumber()
  avgPosition: number;
  @IsNumber()
  prevAvgPosition: number;
  @IsNumber()
  keywords: number;
}

class ContentDecaySignalDto {
  @IsString()
  page: string;
  @IsNumber()
  clicks: number;
  @IsNumber()
  prevClicks: number;
}

class CannibalizationSignalDto {
  @IsString()
  query: string;
  @IsArray()
  @IsString({ each: true })
  pages: string[];
}

export class EvaluateAlertsDto {
  @IsOptional()
  @IsBoolean()
  gscHealthy?: boolean;

  @IsOptional()
  @IsBoolean()
  wordpressHealthy?: boolean;

  @IsOptional()
  @IsObject()
  traffic?: TrafficDto;

  @IsOptional()
  @IsObject()
  ctr?: CtrDto;

  @IsOptional()
  @IsObject()
  position?: PositionDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  criticalTechnicalIssueCount?: number;

  @IsOptional()
  @IsArray()
  contentDecay?: ContentDecaySignalDto[];

  @IsOptional()
  @IsArray()
  cannibalization?: CannibalizationSignalDto[];
}

export class UpdateAlertDto {
  @IsIn(ALERT_STATUSES)
  status: AlertStatus;
}

export class PagePerformanceQueryDto {
  @IsString()
  pageUrl: string;

  @IsDateString()
  beforeStart: string;

  @IsDateString()
  beforeEnd: string;

  @IsDateString()
  afterStart: string;

  @IsDateString()
  afterEnd: string;
}

export class OperationsQueryDto {
  @IsOptional()
  @IsIn([...ISSUE_STATUSES, ...TASK_STATUSES, ...ALERT_STATUSES])
  status?: string;

  @IsOptional()
  @IsIn([...ISSUE_KINDS, ...ALERT_KINDS])
  kind?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

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
