import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GscSiteDailyMetric, GscSyncState, GscProperty } from '@creative-seo/database';
import type { DataQualityDto, DataQualityStatus } from '@creative-seo/types';
import { Repository } from 'typeorm';

@Injectable()
export class PeriodService {
  constructor(
    @InjectRepository(GscSiteDailyMetric) private readonly siteMetrics: Repository<GscSiteDailyMetric>,
    @InjectRepository(GscSyncState) private readonly syncStates: Repository<GscSyncState>,
    @InjectRepository(GscProperty) private readonly properties: Repository<GscProperty>,
  ) {}

  /**
   * Data quality assessment for a site (Section 28).
   * Evaluates GSC data completeness, freshness, and coverage.
   */
  async getDataQuality(siteId: string): Promise<DataQualityDto> {
    const expectedDays = 28;
    const now = new Date();
    const periodEnd = now.toISOString().slice(0, 10);
    const periodStart = new Date(now.getTime() - (expectedDays - 1) * 86_400_000).toISOString().slice(0, 10);

    const property = await this.properties.findOne({ where: { siteId, selected: true } });
    const syncState = property ? await this.syncStates.findOne({ where: { propertyId: property.id } }) : null;

    const availableDays = await this.siteMetrics
      .createQueryBuilder('m')
      .where('m.site_id = :siteId', { siteId })
      .andWhere('m.date >= :start AND m.date <= :end', { start: periodStart, end: periodEnd })
      .select('COUNT(DISTINCT m.date)', 'count')
      .getRawOne<{ count: string }>();

    const daysAvailable = Number(availableDays?.count ?? 0);
    const latestDataDate = syncState?.latestAvailableDate ?? null;

    let status: DataQualityStatus;
    let details: string | undefined;

    if (daysAvailable === 0) {
      status = 'INSUFFICIENT';
      details = 'No GSC data available for the requested period.';
    } else if (daysAvailable < expectedDays * 0.5) {
      status = 'PARTIAL';
      details = `Only ${daysAvailable} of ${expectedDays} expected days have data.`;
    } else if (daysAvailable < expectedDays * 0.85) {
      status = 'PARTIAL';
      details = `${daysAvailable} of ${expectedDays} expected days have data.`;
    } else {
      status = 'GOOD';
      details = `${daysAvailable} of ${expectedDays} expected days have data.`;
    }

    if (latestDataDate) {
      const latestDate = new Date(latestDataDate);
      const ageDays = Math.floor((now.getTime() - latestDate.getTime()) / 86_400_000);
      if (ageDays > 5) {
        status = 'STALE';
        details = `Latest data is ${ageDays} days old (${latestDataDate}).`;
      }
    }

    return {
      status,
      latestDataDate,
      daysAvailable,
      expectedDays,
      quality: status,
      details,
    };
  }
}
