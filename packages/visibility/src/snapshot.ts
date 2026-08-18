/**
 * Periodic AI Visibility snapshots (GC06 Section 70).
 * Every snapshot recalculates from observations in its defined period.
 * Never copies previous values.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilitySnapshot, AiVisibilityObservationV2 } from '@creative-seo/database';

export type DataQuality = 'GOOD' | 'PARTIAL' | 'LOW_COVERAGE' | 'METHODOLOGY_CHANGED' | 'PROVIDER_FAILURE' | 'INSUFFICIENT' | 'STALE';

export interface SnapshotResult {
  id: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  promptSetVersion: number;
  methodologyVersion: string;
  metrics: Record<string, unknown>;
  dataQuality: DataQuality;
  createdAt: string;
}

@Injectable()
export class SnapshotService {
  constructor(
    @InjectRepository(AiVisibilitySnapshot)
    private readonly snapshots: Repository<AiVisibilitySnapshot>,
    @InjectRepository(AiVisibilityObservationV2)
    private readonly observations: Repository<AiVisibilityObservationV2>,
  ) {}

  async getLatestSnapshot(siteId: string): Promise<SnapshotResult | null> {
    const row = await this.snapshots.findOne({
      where: { siteId },
      order: { periodStart: 'DESC' },
    });
    if (!row) return null;
    return this.toDto(row);
  }

  async listSnapshots(siteId: string, limit = 12): Promise<SnapshotResult[]> {
    const rows = await this.snapshots.find({
      where: { siteId },
      order: { periodStart: 'DESC' },
      take: limit,
    });
    return rows.map((r) => this.toDto(r));
  }

  async createSnapshot(
    siteId: string,
    periodStart: string,
    periodEnd: string,
    promptSetVersion: number,
    methodologyVersion: string,
  ): Promise<SnapshotResult> {
    const metrics = await this.computeMetricsForPeriod(siteId, periodStart, periodEnd);
    const dataQuality = this.determineDataQuality(metrics);

    const row = this.snapshots.create({
      siteId,
      periodStart,
      periodEnd,
      promptSetVersion,
      methodologyVersion,
      metrics,
      dataQuality,
    });
    const saved = await this.snapshots.save(row);
    return this.toDto(saved);
  }

  async computeMetricsForPeriod(
    siteId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Record<string, unknown>> {
    const obs = await this.observations.find({
      where: {
        siteId,
        observedAt: periodStart,
      },
    });

    const filtered = obs.filter((o) => {
      const d = o.observedAt;
      return d >= periodStart && d <= periodEnd;
    });

    const total = filtered.length;
    const successful = filtered.filter((o) => o.status === 'SUCCESS');

    if (total === 0) {
      return { totalObservations: 0, successfulObservations: 0 };
    }

    const brandMentioned = successful.filter((o) => o.brandMentioned).length;
    const brandIncluded = successful.filter((o) => o.brandIncluded).length;
    const verifiedCitation = successful.filter((o) => o.verifiedTargetCitation).length;
    const totalCost = successful.reduce((sum, o) => sum + Number(o.costUsd), 0);

    return {
      totalObservations: total,
      successfulObservations: successful.length,
      failedObservations: total - successful.length,
      brandMentionRate: total > 0 ? Math.round((brandMentioned / total) * 10000) / 10000 : 0,
      brandInclusionRate: total > 0 ? Math.round((brandIncluded / total) * 10000) / 10000 : 0,
      verifiedCitationRate: total > 0 ? Math.round((verifiedCitation / total) * 10000) / 10000 : 0,
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
    };
  }

  private determineDataQuality(metrics: Record<string, unknown>): DataQuality {
    const total = (metrics.totalObservations as number) ?? 0;
    const successful = (metrics.successfulObservations as number) ?? 0;

    if (total === 0) return 'INSUFFICIENT';
    if (successful < 3) return 'LOW_COVERAGE';
    if (successful / total < 0.5) return 'PARTIAL';
    return 'GOOD';
  }

  private toDto(row: AiVisibilitySnapshot): SnapshotResult {
    return {
      id: row.id,
      siteId: row.siteId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      promptSetVersion: row.promptSetVersion,
      methodologyVersion: row.methodologyVersion,
      metrics: row.metrics,
      dataQuality: row.dataQuality as DataQuality,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
