import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AutomationRun, Site, SiteAutomationSettings } from '@creative-seo/database';
import { Repository } from 'typeorm';
import type {
  AutomationHistoryQuery,
  AutomationOperation,
  AutomationRunDto,
  AutomationStatusResponseDto,
  AutomationStatusDto,
  SiteAutomationSettingsDto,
} from '@creative-seo/types';
import { AUTOMATION_OPERATIONS } from '@creative-seo/types';
import { defaultAutomationOperations, DEFAULT_AUTOMATION_FLAGS, type AutomationFlags } from './definitions';
import { normalizeFlags, normalizeOperations, toSettingsDto } from './settings';
import { isDue, nextSlot, slotFor, type Cadence } from './schedule';

export interface ClaimedRun {
  runId: string;
  siteId: string;
  organizationId: string | null;
  operation: AutomationOperation;
  idempotencyKey: string;
}

export interface UpdateAutomationSettingsInput {
  enabled?: boolean;
  timezone?: string;
  operations?: Record<string, Partial<SiteAutomationSettingsDto['operations'][AutomationOperation]>>;
  defaults?: Partial<AutomationFlags>;
}

/**
 * Recurring automation: per-site settings, run history, status and the DB-backed
 * scheduler. `claimDue` is the scheduler lock — runs are claimed with a unique
 * idempotency key (`operation:siteId:period`) via INSERT ... ON CONFLICT, so a
 * period can never be scheduled twice even across multiple worker instances,
 * restarts or overlapping ticks. Missed periods are recovered because the
 * current-period slot is computed from `now` and claimed when it lies in the past.
 */
@Injectable()
export class AutomationService {
  constructor(
    @InjectRepository(SiteAutomationSettings) private readonly settings: Repository<SiteAutomationSettings>,
    @InjectRepository(AutomationRun) private readonly runs: Repository<AutomationRun>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  async getSettings(siteId: string): Promise<SiteAutomationSettingsDto> {
    const row = await this.settings.findOne({ where: { siteId } });
    return row ? toSettingsDto(siteId, row) : defaultSettingsDto(siteId);
  }

  async updateSettings(siteId: string, input: UpdateAutomationSettingsInput): Promise<SiteAutomationSettingsDto> {
    const row = (await this.settings.findOne({ where: { siteId } })) ?? this.settings.create({ siteId });
    if (typeof input.enabled === 'boolean') row.enabled = input.enabled;
    if (typeof input.timezone === 'string' && isValidTimeZone(input.timezone)) {
      row.timezone = input.timezone;
    }
    row.operations = normalizeOperations(input.operations ?? (row.operations as Record<string, unknown> | undefined) ?? {});
    row.defaults = normalizeFlags(input.defaults ?? (row.defaults as Record<string, boolean> | undefined) ?? {}) as unknown as Record<string, boolean>;
    const saved = await this.settings.save(row);
    return toSettingsDto(siteId, saved);
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  async listRuns(siteId: string, query: AutomationHistoryQuery = {}): Promise<{ data: AutomationRunDto[]; total: number }> {
    const builder = this.runs.createQueryBuilder('run').where('run.site_id = :siteId', { siteId }).orderBy('run.created_at', 'DESC');
    if (query.operation) builder.andWhere('run.operation = :operation', { operation: query.operation });
    if (query.status) builder.andWhere('run.status = :status', { status: query.status });
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const [rows, total] = await builder.skip(offset).take(take).getManyAndCount();
    return { data: rows.map(toRunDto), total };
  }

  // -------------------------------------------------------------------------
  // Status (last run + next run per operation, in the site timezone)
  // -------------------------------------------------------------------------

  async status(siteId: string): Promise<AutomationStatusResponseDto> {
    const row = await this.settings.findOne({ where: { siteId } });
    const dto = row ? toSettingsDto(siteId, row) : defaultSettingsDto(siteId);
    const runs = await this.runs.find({ where: { siteId }, order: { createdAt: 'DESC' }, take: 500 });
    const latestByOp = new Map<AutomationOperation, AutomationRun>();
    for (const run of runs) {
      if (!latestByOp.has(run.operation)) latestByOp.set(run.operation, run);
    }
    const now = new Date();
    const items: AutomationStatusDto[] = AUTOMATION_OPERATIONS.map((operation) => {
      const opSettings = dto.operations[operation];
      const latest = latestByOp.get(operation) ?? null;
      const cadence: Cadence = {
        frequency: opSettings.frequency,
        weekday: opSettings.weekday,
        dayOfMonth: opSettings.dayOfMonth,
        time: opSettings.time,
      };
      const next = opSettings.enabled ? nextSlot(now, cadence, dto.timezone) : null;
      return {
        operation,
        enabled: opSettings.enabled,
        frequency: opSettings.frequency,
        lastRunAt: latest ? (latest.completedAt ?? latest.startedAt ?? latest.createdAt).toISOString() : null,
        nextRunAt: next ? next.date.toISOString() : null,
        durationMs: latest?.durationMs ?? null,
        status: latest ? (latest.status as AutomationStatusDto['status']) : null,
        error: latest?.error ?? null,
        recordsProcessed: latest?.recordsProcessed ?? 0,
      };
    });
    return { siteId, timezone: dto.timezone, enabled: dto.enabled, items };
  }

  // -------------------------------------------------------------------------
  // Scheduler
  // -------------------------------------------------------------------------

  /**
   * Claims every run that is due right now across active sites. Returns the
   * claimed runs so the caller (worker) can enqueue the BullMQ jobs. The claim
   * itself is idempotent — a concurrent tick or a second worker can never claim
   * the same period.
   */
  async claimDue(now = new Date()): Promise<ClaimedRun[]> {
    const sites = await this.sites.find({ where: { status: 'ACTIVE' } });
    const claimed: ClaimedRun[] = [];
    for (const site of sites) {
      const row = await this.settings.findOne({ where: { siteId: site.id } });
      const dto = row ? toSettingsDto(site.id, row) : defaultSettingsDto(site.id);
      if (!dto.enabled) continue;
      for (const operation of AUTOMATION_OPERATIONS) {
        const opSettings = dto.operations[operation];
        if (!opSettings.enabled) continue;
        const cadence: Cadence = {
          frequency: opSettings.frequency,
          weekday: opSettings.weekday,
          dayOfMonth: opSettings.dayOfMonth,
          time: opSettings.time,
        };
        const slot = slotFor(now, cadence, dto.timezone);
        if (!isDue(now, slot.date)) continue;
        const idempotencyKey = `${operation}:${site.id}:${slot.periodKey}`;
        const inserted = await this.claim(idempotencyKey, site.id, site.organizationId, operation, slot.date);
        if (inserted) {
          claimed.push({ runId: inserted, siteId: site.id, organizationId: site.organizationId, operation, idempotencyKey });
        }
      }
    }
    return claimed;
  }

  /** Stale PENDING runs (claimed but never executed) — for re-enqueue rescue. */
  async listPendingStale(olderThanMs = 15 * 60 * 1000): Promise<AutomationRunDto[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = await this.runs
      .createQueryBuilder('run')
      .where('run.status = :status', { status: 'PENDING' })
      .andWhere('run.created_at < :cutoff', { cutoff })
      .orderBy('run.created_at', 'ASC')
      .take(200)
      .getMany();
    return rows.map(toRunDto);
  }

  private async claim(idempotencyKey: string, siteId: string, organizationId: string | null, operation: AutomationOperation, scheduledFor: Date): Promise<string | null> {
    const rows: Array<{ id: string }> = await this.runs.query(
      `
      INSERT INTO "automation_runs"
        ("id", "site_id", "organization_id", "operation", "status", "scheduled_for", "idempotency_key")
      VALUES (gen_random_uuid(), $1, $2, $3, 'PENDING', $4, $5)
      ON CONFLICT ("idempotency_key") WHERE "idempotency_key" IS NOT NULL DO NOTHING
      RETURNING "id"
      `,
      [siteId, organizationId, operation, scheduledFor, idempotencyKey],
    );
    return rows.length > 0 ? rows[0]!.id : null;
  }
}

export function defaultSettingsDto(siteId: string): SiteAutomationSettingsDto {
  return {
    siteId,
    enabled: true,
    timezone: 'UTC',
    operations: defaultAutomationOperations(),
    defaults: { ...DEFAULT_AUTOMATION_FLAGS },
    updatedAt: new Date(0).toISOString(),
  };
}

export function toRunDto(row: AutomationRun): AutomationRunDto {
  return {
    id: row.id,
    siteId: row.siteId,
    operation: row.operation as AutomationOperation,
    status: row.status as AutomationRunDto['status'],
    scheduledFor: row.scheduledFor.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    durationMs: row.durationMs,
    recordsProcessed: row.recordsProcessed,
    error: row.error,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
