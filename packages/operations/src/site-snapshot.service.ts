import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSnapshot, GscProperty, GscSyncState, CrawlRun, AuditRun, AiVisibilityRun } from '@creative-seo/database';
import type {
  SiteSnapshotType,
  BaselineMetricsDto,
  MetricAvailability,
} from '@creative-seo/types';

/** Stale thresholds in days (platform defaults, not search-engine rules). */
const STALE_THRESHOLDS = {
  crawl: 14,
  audit: 14,
  gsc: 5, // beyond expected data latency
  aiObservation: 30,
} as const;

export interface SnapshotFreshness {
  gsc: { latestDataDate: string | null; status: MetricAvailability };
  audit: { auditRunId: string | null; ageDays: number | null; status: MetricAvailability };
  crawl: { crawlRunId: string | null; ageDays: number | null; status: MetricAvailability };
  aiObservation: { ageDays: number | null; status: MetricAvailability };
}

export interface CreateSnapshotInput {
  snapshotType: SiteSnapshotType;
  siteId: string;
  effectiveDate: string;
  metrics: BaselineMetricsDto;
  dataQuality: Record<string, unknown>;
  availability: Record<string, MetricAvailability>;
  referenceCrawlRunId?: string;
  referenceAuditRunId?: string;
  gscPeriodStart?: string;
  gscPeriodEnd?: string;
}

@Injectable()
export class SiteSnapshotService {
  constructor(
    @InjectRepository(SiteSnapshot) private readonly snapshots: Repository<SiteSnapshot>,
    @InjectRepository(GscProperty) private readonly gscProperties: Repository<GscProperty>,
    @InjectRepository(GscSyncState) private readonly syncStates: Repository<GscSyncState>,
    @InjectRepository(CrawlRun) private readonly crawlRuns: Repository<CrawlRun>,
    @InjectRepository(AuditRun) private readonly auditRuns: Repository<AuditRun>,
    @InjectRepository(AiVisibilityRun) private readonly visibilityRuns: Repository<AiVisibilityRun>,
  ) {}

  /**
   * Create a new snapshot. Each snapshot independently resolves current metrics
   * from source data (never copied from previous).
   */
  async create(input: CreateSnapshotInput): Promise<SiteSnapshot> {
    const existing = await this.snapshots.count({
      where: { siteId: input.siteId, snapshotType: input.snapshotType },
    });

    const snapshot = this.snapshots.create({
      siteId: input.siteId,
      snapshotType: input.snapshotType,
      effectiveDate: input.effectiveDate,
      version: existing + 1,
      referenceCrawlRunId: input.referenceCrawlRunId ?? null,
      referenceAuditRunId: input.referenceAuditRunId ?? null,
      gscPeriodStart: input.gscPeriodStart ?? null,
      gscPeriodEnd: input.gscPeriodEnd ?? null,
      metrics: input.metrics as unknown as Record<string, unknown>,
      dataQuality: input.dataQuality,
      availability: input.availability as unknown as Record<string, string>,
    });
    return (await this.snapshots.save(snapshot)) as SiteSnapshot;
  }

  /**
   * Calculate freshness for each data source at a point in time.
   */
  async calculateFreshness(siteId: string, asOf: Date = new Date()): Promise<SnapshotFreshness> {
    // GSC sync state is per-property, not per-site. We'll find the property first.
    const property = await this.gscProperties.findOne({ where: { siteId, selected: true } });
    const [syncState, latestCrawl, latestAudit, latestAiVisibility] = await Promise.all([
      property ? this.syncStates.findOne({ where: { propertyId: property.id } }) : null,
      this.crawlRuns.findOne({ where: { siteId }, order: { startedAt: 'DESC' } }),
      this.auditRuns.findOne({ where: { siteId }, order: { startedAt: 'DESC' } }),
      this.visibilityRuns.findOne({ where: { siteId }, order: { createdAt: 'DESC' } }),
    ]);

    const now = asOf.getTime();
    const daysSince = (date: Date | string | null): number | null => {
      if (!date) return null;
      return Math.floor((now - new Date(date).getTime()) / 86_400_000);
    };

    // GSC freshness
    const gscDate = syncState?.latestAvailableDate ?? null;
    const gscAgeDays = daysSince(gscDate);
    const gscStatus: MetricAvailability = !gscDate
      ? 'NOT_SYNCED'
      : gscAgeDays !== null && gscAgeDays > STALE_THRESHOLDS.gsc
        ? 'STALE'
        : 'AVAILABLE';

    // Audit freshness
    const auditDate = latestAudit?.startedAt ?? null;
    const auditAgeDays = daysSince(auditDate);
    const auditStatus: MetricAvailability = !latestAudit
      ? 'NOT_MEASURED'
      : auditAgeDays !== null && auditAgeDays > STALE_THRESHOLDS.audit
        ? 'STALE'
        : 'AVAILABLE';

    // Crawl freshness
    const crawlDate = latestCrawl?.startedAt ?? null;
    const crawlAgeDays = daysSince(crawlDate);
    const crawlStatus: MetricAvailability = !latestCrawl
      ? 'NOT_MEASURED'
      : crawlAgeDays !== null && crawlAgeDays > STALE_THRESHOLDS.crawl
        ? 'STALE'
        : 'AVAILABLE';

    // AI observation freshness
    const aiDate = latestAiVisibility?.createdAt ?? null;
    const aiAgeDays = daysSince(aiDate);
    const aiStatus: MetricAvailability = !latestAiVisibility
      ? 'NOT_MEASURED'
      : aiAgeDays !== null && aiAgeDays > STALE_THRESHOLDS.aiObservation
        ? 'STALE'
        : 'AVAILABLE';

    return {
      gsc: { latestDataDate: gscDate, status: gscStatus },
      audit: {
        auditRunId: latestAudit?.id ?? null,
        ageDays: auditAgeDays,
        status: auditStatus,
      },
      crawl: {
        crawlRunId: latestCrawl?.id ?? null,
        ageDays: crawlAgeDays,
        status: crawlStatus,
      },
      aiObservation: {
        ageDays: aiAgeDays,
        status: aiStatus,
      },
    };
  }

  /**
   * List snapshots for a site, optionally filtered by type.
   */
  async list(siteId: string, type?: SiteSnapshotType): Promise<SiteSnapshot[]> {
    const where = { siteId } as Record<string, unknown>;
    if (type) where.snapshotType = type;
    return this.snapshots.find({ where, order: { capturedAt: 'DESC' } });
  }

  /**
   * Get a snapshot by id.
   */
  async get(id: string): Promise<SiteSnapshot | null> {
    return this.snapshots.findOne({ where: { id } });
  }
}
