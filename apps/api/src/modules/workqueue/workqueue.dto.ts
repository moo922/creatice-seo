import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  WORK_BULK_ACTIONS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  WORK_SOURCES,
  type WorkBulkAction,
  type WorkFilterCriteriaDto,
  type WorkItemPriority,
} from '@creative-seo/types';

/**
 * Query filters for GET /work (and GET /sites/:siteId/work). Multi-value
 * filters arrive as comma-separated strings so a single query param maps to an
 * array; the service normalizes them.
 */
export class WorkQueueQueryDto {
  @IsOptional()
  @IsString()
  types?: string;

  @IsOptional()
  @IsString()
  statuses?: string;

  @IsOptional()
  @IsString()
  priorities?: string;

  @IsOptional()
  @IsString()
  sources?: string;

  @IsOptional()
  @IsString()
  sites?: string;

  @IsOptional()
  @IsIn(['me', 'unassigned'])
  assignedTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === '1' || value === true))
  overdue?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}

export class SaveWorkFilterDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsArray()
  @IsIn(WORK_ITEM_TYPES, { each: true })
  @IsOptional()
  types?: WorkFilterCriteriaDto['types'];

  @IsArray()
  @IsIn(WORK_ITEM_STATUSES, { each: true })
  @IsOptional()
  statuses?: WorkFilterCriteriaDto['statuses'];

  @IsArray()
  @IsIn(WORK_ITEM_PRIORITIES, { each: true })
  @IsOptional()
  priorities?: WorkFilterCriteriaDto['priorities'];

  @IsArray()
  @IsIn(WORK_SOURCES, { each: true })
  @IsOptional()
  sources?: WorkFilterCriteriaDto['sources'];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  sites?: string[];

  @IsOptional()
  @IsIn(['me', 'unassigned'])
  assignedTo?: 'me' | 'unassigned';

  @IsOptional()
  overdue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class WorkBulkActionDto {
  @IsIn(WORK_BULK_ACTIONS)
  action: WorkBulkAction;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  itemKeys: string[];

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsIn(WORK_ITEM_PRIORITIES)
  priority?: WorkItemPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  taskTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taskDeadline?: string | null;
}
