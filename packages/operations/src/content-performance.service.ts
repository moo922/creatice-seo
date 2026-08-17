import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContentPublication, GscPageDailyMetric, GscQueryPageDailyMetric } from '@creative-seo/database';
import type { ContentPerformanceDto } from '@creative-seo/types';
import { Repository } from 'typeorm';

@Injectable()
export class ContentPerformanceService {
  constructor(
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(GscPageDailyMetric) private readonly pageMetrics: Repository<GscPageDailyMetric>,
    @InjectRepository(GscQueryPageDailyMetric) private readonly queryPageMetrics: Repository<GscQueryPageDailyMetric>,
  ) {}

  /**
   * Content performance metrics for published content (Section 24).
   *
   * For each published content page, returns GSC metrics observed after
   * publication. Wording uses "observed after publication" — never "caused
   * by publication".
   *
   * - clicks/impressions/ctr/position: latest 28-day aggregates
   * - sincePublication: cumulative totals from publication date to latest available data
   */
  async getContentPerformance(siteId: string): Promise<ContentPerformanceDto[]> {
    const now = new Date();
    const latest28Start = new Date(now);
    latest28Start.setDate(latest28Start.getDate() - 28);
    const latest28StartStr = latest28Start.toISOString().slice(0, 10);
    const nowStr = now.toISOString().slice(0, 10);

    // Fetch published content with a URL
    const pubs = await this.publications
      .createQueryBuilder('pub')
      .where('pub.site_id = :siteId', { siteId })
      .andWhere('pub.status = :status', { status: 'PUBLISHED' })
      .andWhere('pub.url IS NOT NULL')
      .andWhere('pub.published_at IS NOT NULL')
      .select(['pub.id', 'pub.url', 'pub.published_at'])
      .getMany();

    if (pubs.length === 0) return [];

    const results: ContentPerformanceDto[] = [];

    for (const pub of pubs) {
      const pageUrl = pub.url!;
      const publishedAt = pub.publishedAt!.toISOString().slice(0, 10);

      // Latest 28-day aggregate for this page
      const latest28 = await this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :start AND m.date <= :end', {
          start: latest28StartStr,
          end: nowStr,
        })
        .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
        .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
        .addSelect(
          `CASE WHEN SUM(m.impressions) > 0 THEN ROUND(SUM(m.clicks)::numeric / SUM(m.impressions), 4) ELSE 0 END`,
          'ctr',
        )
        .addSelect(
          `AVG(m.position) FILTER (WHERE m.position > 0)`,
          'position',
        )
        .getRawOne<{ clicks: string; impressions: string; ctr: string; position: string | null }>();

      // First seen in GSC: earliest date this page appeared in page metrics
      const firstSeenRow = await this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .orderBy('m.date', 'ASC')
        .limit(1)
        .select('m.date', 'date')
        .getRawOne<{ date: string }>();

      // Cumulative since publication
      const sincePub = await this.pageMetrics
        .createQueryBuilder('m')
        .where('m.site_id = :siteId', { siteId })
        .andWhere('m.page_url = :pageUrl', { pageUrl })
        .andWhere('m.date >= :pubDate', { pubDate: publishedAt })
        .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
        .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
        .getRawOne<{ clicks: string; impressions: string }>();

      // Distinct query count since publication
      const queryCountRow = await this.queryPageMetrics
        .createQueryBuilder('q')
        .where('q.site_id = :siteId', { siteId })
        .andWhere('q.page_url = :pageUrl', { pageUrl })
        .andWhere('q.date >= :pubDate', { pubDate: publishedAt })
        .select('COUNT(DISTINCT q.query)', 'count')
        .getRawOne<{ count: string }>();

      const clicks = Number(latest28?.clicks ?? 0);
      const impressions = Number(latest28?.impressions ?? 0);

      results.push({
        pageUrl,
        publishedAt,
        firstSeenInGsc: firstSeenRow?.date ?? null,
        clicks: impressions > 0 ? clicks : null,
        impressions: impressions > 0 ? impressions : null,
        ctr: impressions > 0 ? Number(latest28?.ctr ?? 0) : null,
        position: latest28?.position ? Number(latest28.position) : null,
        queryCount: queryCountRow ? Number(queryCountRow.count) : null,
        sincePublication:
          sincePub && (Number(sincePub.clicks) > 0 || Number(sincePub.impressions) > 0)
            ? {
                clicks: Number(sincePub.clicks),
                impressions: Number(sincePub.impressions),
              }
            : null,
      });
    }

    return results;
  }
}
