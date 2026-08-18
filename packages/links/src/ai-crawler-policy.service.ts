/**
 * AI Crawler Policy Service. Manages the crawler registry, checks robots.txt
 * access for known AI crawlers, and stores results for GEO audits.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AiCrawlerRegistry, CrawlerPolicyResult, Site } from '@creative-seo/database';
import type { CrawlerPolicyResultDto } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { parseRobotsTxt, isPathAllowed, selectGroup } from '@creative-seo/crawler';

@Injectable()
export class AiCrawlerPolicyService {
  private readonly logger = new Logger(AiCrawlerPolicyService.name);

  constructor(
    @InjectRepository(AiCrawlerRegistry)
    private readonly crawlerRegistry: Repository<AiCrawlerRegistry>,
    @InjectRepository(CrawlerPolicyResult)
    private readonly policyResults: Repository<CrawlerPolicyResult>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
  ) {}

  /** List all registered crawlers. */
  async listCrawlers(): Promise<AiCrawlerRegistry[]> {
    return this.crawlerRegistry.find({ where: { enabled: true }, order: { name: 'ASC' } });
  }

  /** Check crawler policy for a site by fetching and analyzing robots.txt. */
  async checkCrawlerPolicy(siteId: string): Promise<CrawlerPolicyResultDto[]> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new Error('Site not found');

    const crawlers = await this.listCrawlers();
    const results: CrawlerPolicyResultDto[] = [];

    // Fetch robots.txt
    let robotsTxt = '';
    try {
      const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;
      const robotsUrl = `${url}/robots.txt`;
      const response = await fetch(robotsUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'CreativeSEO-Auditor/1.0' },
      });
      if (response.ok) {
        robotsTxt = await response.text();
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch robots.txt for ${site.domain}: ${error}`);
    }

    const rules = parseRobotsTxt(robotsTxt);

    // Clear previous results for this site
    await this.policyResults.delete({ siteId });

    for (const crawler of crawlers) {
      let accessResult = 'UNKNOWN';
      const analysis: Record<string, unknown> = {};

      if (robotsTxt) {
        const group = selectGroup(rules, crawler.userAgentPattern);
        const pathAllowed = isPathAllowed(rules, crawler.userAgentPattern, '/');

        accessResult = pathAllowed ? 'ALLOWED' : 'BLOCKED';
        analysis.allowed = pathAllowed;
        analysis.userAgent = crawler.userAgentPattern;
        analysis.groupFound = group !== null;
      }

      const result = this.policyResults.create({
        siteId,
        crawlerName: crawler.name,
        crawlerPurpose: crawler.purpose,
        accessResult,
        robotsTxtAnalysis: analysis,
        checkedAt: new Date(),
      });

      const saved = await this.policyResults.save(result);
      results.push(this.toDto(saved));
    }

    return results;
  }

  /** Get latest crawler policy results for a site. */
  async getPolicyResults(siteId: string): Promise<CrawlerPolicyResultDto[]> {
    const results = await this.policyResults.find({
      where: { siteId },
      order: { checkedAt: 'DESC' },
    });
    return results.map((r) => this.toDto(r));
  }

  /** Get a summary of crawler access for GEO audit context. */
  async getCrawlerAccessSummary(siteId: string): Promise<{
    allowed: string[];
    blocked: string[];
    unknown: string[];
    trainingBlocked: boolean;
    searchDiscoveryAllowed: boolean;
  }> {
    const results = await this.getPolicyResults(siteId);
    const allowed: string[] = [];
    const blocked: string[] = [];
    const unknown: string[] = [];

    for (const r of results) {
      if (r.accessResult === 'ALLOWED') allowed.push(r.crawlerName);
      else if (r.accessResult === 'BLOCKED') blocked.push(r.crawlerName);
      else unknown.push(r.crawlerName);
    }

    const trainingBlocked = results
      .filter((r) => r.crawlerPurpose === 'TRAINING')
      .every((r) => r.accessResult === 'BLOCKED');

    const searchDiscoveryAllowed = results
      .filter((r) => r.crawlerPurpose === 'SEARCH_DISCOVERY')
      .some((r) => r.accessResult === 'ALLOWED');

    return { allowed, blocked, unknown, trainingBlocked, searchDiscoveryAllowed };
  }

  private toDto(result: CrawlerPolicyResult): CrawlerPolicyResultDto {
    return {
      id: result.id,
      siteId: result.siteId,
      crawlerName: result.crawlerName,
      crawlerPurpose: result.crawlerPurpose,
      accessResult: result.accessResult,
      robotsTxtAnalysis: result.robotsTxtAnalysis,
      checkedAt: result.checkedAt.toISOString(),
    };
  }
}
