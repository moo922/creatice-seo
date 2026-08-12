import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from '@creative-seo/database';
import type { ActivityAction } from '@creative-seo/types';

export interface RecordActivityInput {
  action: ActivityAction;
  userId?: string | null;
  organizationId?: string | null;
  siteId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logs: Repository<ActivityLog>,
  ) {}

  /**
   * Best-effort audit trail: a failure to persist an activity entry must never
   * fail the request it describes.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      const entry = this.logs.create({
        action: input.action,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        siteId: input.siteId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ?? {},
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      await this.logs.save(entry);
    } catch (error) {
      this.logger.warn(`Failed to persist activity '${input.action}': ${String(error)}`);
    }
  }
}
