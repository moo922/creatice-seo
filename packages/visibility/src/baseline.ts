/**
 * AI Visibility Baseline (GC06 Section 69). Creates immutable baselines
 * per prompt set version. Old baselines are never mutated.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityBaseline } from '@creative-seo/database';

export interface BaselineResult {
  id: string;
  siteId: string;
  promptSetId: string;
  promptSetVersion: number;
  providers: string[];
  models: string[];
  methodologyVersion: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, unknown>;
  createdAt: string;
}

@Injectable()
export class BaselineService {
  constructor(
    @InjectRepository(AiVisibilityBaseline)
    private readonly baselines: Repository<AiVisibilityBaseline>,
  ) {}

  async getBaseline(siteId: string, promptSetVersion: number): Promise<BaselineResult | null> {
    const row = await this.baselines.findOne({ where: { siteId, promptSetVersion } });
    if (!row) return null;
    return this.toDto(row);
  }

  async createBaseline(
    siteId: string,
    promptSetId: string,
    promptSetVersion: number,
    providers: string[],
    models: string[],
    methodologyVersion: string,
    periodStart: string,
    periodEnd: string,
    metrics: Record<string, unknown>,
  ): Promise<BaselineResult> {
    const existing = await this.getBaseline(siteId, promptSetVersion);
    if (existing) return existing;

    const row = this.baselines.create({
      siteId,
      promptSetId,
      promptSetVersion,
      providers,
      models,
      methodologyVersion,
      periodStart,
      periodEnd,
      metrics,
    });
    const saved = await this.baselines.save(row);
    return this.toDto(saved);
  }

  async updateBaseline(
    siteId: string,
    promptSetVersion: number,
    metrics: Record<string, unknown>,
  ): Promise<BaselineResult | null> {
    const row = await this.baselines.findOne({ where: { siteId, promptSetVersion } });
    if (!row) return null;
    row.metrics = metrics;
    const saved = await this.baselines.save(row);
    return this.toDto(saved);
  }

  async compareWithBaseline(
    currentMetrics: Record<string, unknown>,
    baselineMetrics: Record<string, unknown>,
  ): Promise<Record<string, { current: unknown; baseline: unknown; delta: unknown }>> {
    const result: Record<string, { current: unknown; baseline: unknown; delta: unknown }> = {};
    const allKeys = new Set([...Object.keys(currentMetrics), ...Object.keys(baselineMetrics)]);

    for (const key of allKeys) {
      const current = currentMetrics[key];
      const baseline = baselineMetrics[key];
      if (typeof current === 'number' && typeof baseline === 'number') {
        result[key] = { current, baseline, delta: Math.round((current - baseline) * 10000) / 10000 };
      } else {
        result[key] = { current, baseline, delta: null };
      }
    }

    return result;
  }

  private toDto(row: AiVisibilityBaseline): BaselineResult {
    return {
      id: row.id,
      siteId: row.siteId,
      promptSetId: row.promptSetId,
      promptSetVersion: row.promptSetVersion,
      providers: row.providers,
      models: row.models,
      methodologyVersion: row.methodologyVersion,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      metrics: row.metrics,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
