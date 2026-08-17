import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentPublication, GscPageDailyMetric, GscQueryPageDailyMetric } from '@creative-seo/database';
import type { ContentDecayPageDto } from '@creative-seo/types';
import { Repository } from 'typeorm';

const DECAY_CLICK_DROP_PCT = 0.3;
const DECAY_IMPRESSION_DROP_PCT = 0.25;
const MIN_CURRENT_CLICKS = 10;
const MIN_PREVIOUS_CLICKS = 10;
const MIN_DATA_DAYS = 14;

@Injectable()
export class ContentDecayService {
  constructor(
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(GscPageDailyMetric) private readonly pageMetrics: Repository<GscPageDailyMetric>,
    @InjectRepository(GscQueryPageDailyMetric) private readonly queryPageMetrics: Repository<GscQueryPageDailyMetric>,
  ) {}

  /**
   * Content decay detection (Section 42).
   *
   * Rules:
   * - Historically meaningful page AND
   * - Current comparable period decline exceeds threshold AND
   * - Minimum data volume
   *
   * Tracks: click decline, impression decline, query loss.
   * Does NOT use content age alone as proof of decay.
   * Content age may be supporting context only.
   */
  async detectDecay(siteId: string): Promise<ContentDecayPageDto[]> {
    const now = new Date();
    const currentEnd = now.toISOString().slice(0, 10);
    const currentStart = new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
    const prevEnd = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    const prevStart = new Date(now.getTime() - 56 * 86_400_000).toISOString().slice(0, 10);

    const pubs = await this.publications
      .createQueryBuilder('pub')
      .where('pub.site_id = :siteId', { siteId })
      .andWhere('pub.status = :status', { status: 'PUBLISHED' })
      .andWhere('pub.url IS NOT NULL')
      .select(['pub.url'])
      .getMany();

    const uniqueUrls = [...new Set(pubs.map((p) => p.url!))];
    if (uniqueUrls.length === 0) return [];

    const results: ContentDecayPageDto[] = [];

    for (const pageUrl of uniqueUrls) {
      const result = await this.analyzePage(siteId, pageUrl, currentStart, currentEnd, prevStart, prevEnd);
      if (result) results.push(result);
    }

    return results.sort((a, b) => b.clickDropPct - a.clickDropPct);
  }

  private async analyzePage(
    siteId: string,
    pageUrl: string,
    currentStart: string,
    currentEnd: string,
    prevStart: string,
    prevEnd: string,
  ): Promise<ContentDecayPageDto | null> {
    const [current, previous, firstSeenRow, currentQueries, previousQueries] = await Promise.all([
      this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :start AND m.date <= :end', { start: currentStart, end: currentEnd })
        .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
        .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
        .addSelect('COUNT(DISTINCT m.date)', 'days')
        .getRawOne<{ clicks: string; impressions: string; days: string }>(),
      this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :start AND m.date <= :end', { start: prevStart, end: prevEnd })
        .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
        .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
        .addSelect('COUNT(DISTINCT m.date)', 'days')
        .getRawOne<{ clicks: string; impressions: string; days: string }>(),
      this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .orderBy('m.date', 'ASC')
        .limit(1)
        .select('m.date', 'date')
        .getRawOne<{ date: string }>(),
      this.queryPageMetrics
        .createQueryBuilder('q')
        .where('q.site_id = :siteId', { siteId })
        .andWhere('q.page_url = :pageUrl', { pageUrl })
        .andWhere('q.date >= :start AND q.date <= :end', { start: currentStart, end: currentEnd })
        .select('DISTINCT q.query')
        .getMany(),
      this.queryPageMetrics
        .createQueryBuilder('q')
        .where('q.site_id = :siteId', { siteId })
        .andWhere('q.page_url = :pageUrl', { pageUrl })
        .andWhere('q.date >= :start AND q.date <= :end', { start: prevStart, end: prevEnd })
        .select('DISTINCT q.query')
        .getMany(),
    ]);

    const currentClicks = Number(current?.clicks ?? 0);
    const prevClicks = Number(previous?.clicks ?? 0);
    const currentImpressions = Number(current?.impressions ?? 0);
    const prevImpressions = Number(previous?.impressions ?? 0);

    if (prevClicks < MIN_PREVIOUS_CLICKS || prevImpressions < 10) return null;
    if (Number(current?.days ?? 0) < MIN_DATA_DAYS || Number(previous?.days ?? 0) < MIN_DATA_DAYS) return null;

    const clickDropPct = prevClicks > 0 ? (prevClicks - currentClicks) / prevClicks : 0;
    const impressionDropPct = prevImpressions > 0 ? (prevImpressions - currentImpressions) / prevImpressions : 0;

    const currentQuerySet = new Set(currentQueries.map((q) => q.query));
    const prevQuerySet = new Set(previousQueries.map((q) => q.query));
    const lostQueries = [...prevQuerySet].filter((q) => !currentQuerySet.has(q));

    const isDecay = clickDropPct >= DECAY_CLICK_DROP_PCT && currentClicks < prevClicks;
    if (!isDecay) return null;

    const supportingContext: string[] = [];
    if (impressionDropPct >= DECAY_IMPRESSION_DROP_PCT) {
      supportingContext.push(`Impressions dropped ${Math.round(impressionDropPct * 100)}%`);
    }
    if (lostQueries.length > 0) {
      supportingContext.push(`${lostQueries.length} queries lost visibility`);
    }
    if (firstSeenRow?.date) {
      const ageDays = Math.floor((new Date().getTime() - new Date(firstSeenRow.date).getTime()) / 86_400_000);
      if (ageDays > 180) {
        supportingContext.push(`Content is ${ageDays} days old (supporting context, not proof)`);
      }
    }

    const evidenceCount = [clickDropPct >= DECAY_CLICK_DROP_PCT, impressionDropPct >= DECAY_IMPRESSION_DROP_PCT, lostQueries.length > 0].filter(Boolean).length;
    const evidenceStrength: ContentDecayPageDto['evidenceStrength'] = evidenceCount >= 3 ? 'strong' : evidenceCount >= 2 ? 'moderate' : 'weak';

    const contentAgeDays = firstSeenRow?.date
      ? Math.floor((new Date().getTime() - new Date(firstSeenRow.date).getTime()) / 86_400_000)
      : null;

    return {
      pageUrl,
      currentClicks,
      previousClicks: prevClicks,
      clickDropPct: Math.round(clickDropPct * 10000) / 10000,
      currentImpressions,
      previousImpressions: prevImpressions,
      impressionDropPct: Math.round(impressionDropPct * 10000) / 10000,
      queryLossCount: lostQueries.length,
      totalLostQueries: prevQuerySet.size,
      evidenceStrength,
      supportingContext,
      firstSeenInGsc: firstSeenRow?.date ?? null,
      contentAgeDays,
    };
  }
}
