import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Site, Issue, GscSiteDailyMetric, OperationsTask, ContentPublication, BaselineSnapshot } from '@creative-seo/database';
import type { PortfolioAggregationDto } from '@creative-seo/types';
import { Repository } from 'typeorm';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(GscSiteDailyMetric) private readonly siteMetrics: Repository<GscSiteDailyMetric>,
    @InjectRepository(OperationsTask) private readonly tasks: Repository<OperationsTask>,
    @InjectRepository(ContentPublication) private readonly publications: Repository<ContentPublication>,
    @InjectRepository(BaselineSnapshot) private readonly baselines: Repository<BaselineSnapshot>,
  ) {}

  /**
   * Portfolio-level aggregated metrics (Section 26).
   */
  async getPortfolioAggregation(): Promise<PortfolioAggregationDto> {
    const totalSites = await this.sites.count({ where: { status: 'ACTIVE' } });

    const [totalCriticalIssues, totalOpenTasks] = await Promise.all([
      this.issues
        .createQueryBuilder('issue')
        .where('issue.severity = :severity', { severity: 'CRITICAL' })
        .andWhere('issue.status NOT IN (:...statuses)', { statuses: ['RESOLVED', 'IGNORED'] })
        .getCount(),
      this.tasks
        .createQueryBuilder('task')
        .where('task.status NOT IN (:...statuses)', { statuses: ['DONE', 'BLOCKED'] })
        .getCount(),
    ]);

    const sitesWithMetrics = await this.siteMetrics
      .createQueryBuilder('m')
      .select('m.site_id', 'siteId')
      .groupBy('m.site_id')
      .getRawMany<{ siteId: string }>();

    let organicClicks = 0;
    let organicImpressions = 0;
    let sitesGrowing = 0;
    let sitesDeclining = 0;
    const siteCtrs: number[] = [];

    for (const { siteId } of sitesWithMetrics) {
      const now = new Date();
      const latest28End = now.toISOString().slice(0, 10);
      const latest28Start = new Date(now.getTime() - 27 * 86_400_000).toISOString().slice(0, 10);
      const prev28End = new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
      const prev28Start = new Date(now.getTime() - 55 * 86_400_000).toISOString().slice(0, 10);

      const [latest, prev] = await Promise.all([
        this.siteMetrics
          .createQueryBuilder('m')
          .where('m.site_id = :siteId', { siteId })
          .andWhere('m.date >= :start AND m.date <= :end', { start: latest28Start, end: latest28End })
          .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
          .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
          .getRawOne<{ clicks: string; impressions: string }>(),
        this.siteMetrics
          .createQueryBuilder('m')
          .where('m.site_id = :siteId', { siteId })
          .andWhere('m.date >= :start AND m.date <= :end', { start: prev28Start, end: prev28End })
          .select('COALESCE(SUM(m.clicks), 0)', 'clicks')
          .addSelect('COALESCE(SUM(m.impressions), 0)', 'impressions')
          .getRawOne<{ clicks: string; impressions: string }>(),
      ]);

      const latestClicks = Number(latest?.clicks ?? 0);
      const prevClicks = Number(prev?.clicks ?? 0);
      organicClicks += latestClicks;

      const latestImpressions = Number(latest?.impressions ?? 0);
      const prevImpressions = Number(prev?.impressions ?? 0);
      organicImpressions += latestImpressions;

      if (latestImpressions > 0) {
        siteCtrs.push(latestClicks / latestImpressions);
      }

      if (prevClicks > 0) {
        const change = (latestClicks - prevClicks) / prevClicks;
        if (change > 0.05) sitesGrowing++;
        else if (change < -0.05) sitesDeclining++;
      }
    }

    return {
      totalSites,
      activatedSites: totalSites,
      sitesWithFreshAudits: totalSites,
      sitesWithStaleAudits: 0,
      sitesGrowing,
      sitesDeclining,
      totalCriticalIssues,
      totalOpenTasks,
      reportsDue: 0,
      organicClicks,
      organicImpressions,
      portfolioCtr: organicImpressions > 0 ? Math.round((organicClicks / organicImpressions) * 10000) / 10000 : null,
      seoHealthAverage: null,
      seoHealthMeasuredSites: 0,
      seoHealthTotalSites: totalSites,
    };
  }
}
