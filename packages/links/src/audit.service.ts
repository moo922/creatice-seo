import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditResult, AuditRun, CrawlError, CrawlLink, CrawlPage, CrawlRun } from '@creative-seo/database';
import {
  AUDIT_RULES,
  computeHealthScores,
  evaluateAudit,
  type AuditContext,
  type AuditErrorSignal,
  type AuditFinding,
  type AuditLinkSignal,
  type AuditPageSignal,
} from '@creative-seo/audit-rules';
import { OperationsService } from '@creative-seo/operations';
import type {
  AuditReportDto,
  AuditResultDto,
  AuditRunDto,
  CrawlRunDto,
  HealthScoresDto,
  IssueDto,
  IssueKind,
  IssueSeverity,
  RunAuditRequest,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { analyzeLinkGraph } from './analysis';
import type { CrawledPageData } from './graph';
import { normalizeUrl } from './graph';

const OPEN_ISSUE_STATUSES = ['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING'];
const VERIFICATION_ELIGIBLE = ['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS'];
const ISSUE_SEVERITY_MIN = 2; // 0=info,1=low,2=medium,3=high,4=critical

const CATEGORY_TO_ISSUE_KIND: Record<string, IssueKind> = {
  technical: 'CRITICAL_TECHNICAL',
  content: 'ON_PAGE',
  'on-page': 'ON_PAGE',
  'rank-math': 'ON_PAGE',
  'internal-linking': 'ON_PAGE',
  seo: 'ON_PAGE',
  aeo: 'ON_PAGE',
  geo: 'ON_PAGE',
  'search-performance': 'ON_PAGE',
};

const SEVERITY_MAP: Record<AuditFinding['severity'], IssueSeverity> = {
  info: 'LOW',
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

const SEVERITY_RANK: Record<AuditFinding['severity'], number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Runs the deterministic audit rule registry over a versioned crawl run,
 * persists audit runs + results (passed and failed, with machine-readable
 * evidence), reconciles failed findings with the Issues engine using a
 * deterministic identity (site + rule + normalized URL + material finding),
 * and computes the versioned Internal Platform Health Score.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(CrawlRun) private readonly crawlRuns: Repository<CrawlRun>,
    @InjectRepository(CrawlPage) private readonly crawlPages: Repository<CrawlPage>,
    @InjectRepository(CrawlLink) private readonly crawlLinks: Repository<CrawlLink>,
    @InjectRepository(CrawlError) private readonly crawlErrors: Repository<CrawlError>,
    @InjectRepository(AuditRun) private readonly auditRuns: Repository<AuditRun>,
    @InjectRepository(AuditResult) private readonly auditResults: Repository<AuditResult>,
    private readonly operations: OperationsService,
  ) {}

  async runAudit(
    site: { id: string; organizationId: string | null; domain: string; language: string | null },
    actorId: string | null,
    options: RunAuditRequest = {},
  ): Promise<AuditReportDto> {
    const crawlRun = await this.resolveRun(site.id, options.crawlRunId);
    if (!crawlRun) {
      throw new NotFoundException('No completed crawl run found for this site. Run a crawl first.');
    }

    const type = options.type ?? 'FULL';
    const auditRun = await this.auditRuns.save(
      this.auditRuns.create({
        siteId: site.id,
        crawlRunId: crawlRun.id,
        type,
        status: 'RUNNING',
        startedAt: new Date(),
        finishedAt: null,
        scoreVersion: 1,
        createdBy: actorId,
      }),
    );

    try {
      const [pages, links, errors] = await Promise.all([
        this.crawlPages.find({ where: { crawlRunId: crawlRun.id } }),
        this.crawlLinks.find({ where: { crawlRunId: crawlRun.id } }),
        this.crawlErrors.find({ where: { crawlRunId: crawlRun.id } }),
      ]);

      const context: AuditContext = {
        siteId: site.id,
        siteDomain: site.domain,
        siteLanguage: site.language,
        run: {
          robotsStatus: crawlRun.robotsStatus,
          sitemapStatus: crawlRun.sitemapStatus,
          seedUrl: crawlRun.seedUrl,
          sitemapUrls: crawlRun.sitemapUrls,
          pagesCrawled: crawlRun.pagesCrawled,
          pagesFailed: crawlRun.pagesFailed,
          pagesDiscovered: crawlRun.pagesDiscovered,
          maxPages: crawlRun.maxPages,
        },
        pages: pages.map(toPageSignal),
        links: links.map(toLinkSignal),
        errors: errors.map(toErrorSignal),
        linkAnalysis: this.integrateLinkAnalysis(site.domain, pages, links),
      };

      // Evaluate with passes so coverage is reproducible from stored results.
      const findings = evaluateAudit(context, true);
      const pageIdByUrl = new Map(pages.map((page) => [normalizeUrl(page.url), page.id]));
      const ruleVersionByKey = new Map(AUDIT_RULES.map((rule) => [rule.definition.key, rule.definition.version]));

      const resultRows: AuditResult[] = findings.map((finding) =>
        this.auditResults.create({
          auditRunId: auditRun.id,
          siteId: site.id,
          crawlPageId: finding.url ? (pageIdByUrl.get(normalizeUrl(finding.url)) ?? null) : null,
          url: finding.url ?? crawlRun.seedUrl,
          ruleKey: finding.ruleKey,
          ruleVersion: ruleVersionByKey.get(finding.ruleKey) ?? 1,
          category: finding.category,
          severity: finding.severity,
          passed: finding.passed,
          evidence: finding.evidence,
        }),
      );
      await this.saveChunked(this.auditResults, resultRows);

      const scores = computeHealthScores(
        findings.map((finding) => ({
          ruleKey: finding.ruleKey,
          category: finding.category,
          severity: finding.severity,
          passed: finding.passed,
          url: finding.url,
        })),
        { pagesCrawled: crawlRun.pagesCrawled },
      );

      let issuesCreated = 0;
      let issuesUpdated = 0;
      let issuesMovedToVerification = 0;
      if (options.persist !== false) {
        ({ issuesCreated, issuesUpdated, issuesMovedToVerification } = await this.reconcileIssues(
          site,
          findings,
          crawlRun.pagesCrawled,
        ));
      }

      auditRun.status = 'COMPLETED';
      auditRun.finishedAt = new Date();
      await this.auditRuns.save(auditRun);

      return {
        auditRun: toAuditRunDto(auditRun),
        run: toRunDto(crawlRun),
        results: resultRows.map(toResultDto),
        findings: findings.filter((finding) => !finding.passed),
        scores,
        issuesCreated,
        issuesUpdated,
        issuesMovedToVerification,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      auditRun.status = 'FAILED';
      auditRun.finishedAt = new Date();
      await this.auditRuns.save(auditRun);
      throw error;
    }
  }

  async listAuditRuns(siteId: string): Promise<AuditRunDto[]> {
    const rows = await this.auditRuns.find({ where: { siteId }, order: { startedAt: 'DESC' } });
    return rows.map(toAuditRunDto);
  }

  async getAuditRun(siteId: string, runId: string): Promise<{ run: AuditRunDto; results: AuditResultDto[] }> {
    const run = await this.auditRuns.findOne({ where: { id: runId, siteId } });
    if (!run) {
      throw new NotFoundException('Audit run not found');
    }
    const results = await this.auditResults.find({ where: { auditRunId: run.id }, order: { createdAt: 'ASC' } });
    return { run: toAuditRunDto(run), results: results.map(toResultDto) };
  }

  /** Deterministic health scores from the latest completed audit run. */
  async latestScores(siteId: string): Promise<HealthScoresDto | null> {
    const run = await this.auditRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { startedAt: 'DESC' },
    });
    if (!run) return null;
    const crawlRun = await this.crawlRuns.findOne({ where: { id: run.crawlRunId } });
    const results = await this.auditResults.find({ where: { auditRunId: run.id } });
    return computeHealthScores(
      results.map((result) => ({
        ruleKey: result.ruleKey,
        category: result.category,
        severity: result.severity as 'info' | 'low' | 'medium' | 'high' | 'critical',
        passed: result.passed,
        url: result.url,
      })),
      { pagesCrawled: crawlRun?.pagesCrawled ?? 0 },
    );
  }

  private async resolveRun(siteId: string, runId?: string): Promise<CrawlRun | null> {
    if (runId) {
      return this.crawlRuns.findOne({ where: { id: runId, siteId } });
    }
    return this.crawlRuns.findOne({
      where: { siteId, status: 'COMPLETED' },
      order: { startedAt: 'DESC' },
    });
  }

  /** Integrates the existing link-analysis engine for broken internal links. */
  private integrateLinkAnalysis(siteDomain: string, pages: CrawlPage[], links: CrawlLink[]) {
    const crawledData: CrawledPageData[] = pages.map((page) => ({
      url: page.url,
      text: '',
      headings: page.headings.map((heading) => heading.text),
      httpStatus: page.httpStatus,
      outLinks: links
        .filter((link) => link.sourcePageId === page.id || link.sourceUrl === page.url)
        .map((link) => ({ url: link.targetUrl, anchor: link.anchorText })),
    }));

    const result = analyzeLinkGraph({ siteDomain, crawledPages: crawledData, approvedTargets: [] });
    const brokenLinks = result.suggestions
      .filter((suggestion) => suggestion.detection === 'BROKEN')
      .map((suggestion) => ({ sourceUrl: suggestion.sourceUrl, targetUrl: suggestion.targetUrl }));
    return { brokenLinks };
  }

  /**
   * Reconciles failed audit results with the Issues engine using a
   * deterministic identity: site + rule key + normalized URL + material
   * finding identity (e.g. the broken target). Open issues are refreshed
   * (last detected + evidence); passing rules move open issues to
   * verification; resolved/ignored issues are never auto-touched.
   */
  private async reconcileIssues(
    site: { id: string; organizationId: string | null },
    findings: AuditFinding[],
    pagesCrawled: number,
  ): Promise<{ issuesCreated: number; issuesUpdated: number; issuesMovedToVerification: number }> {
    const actionable = findings.filter(
      (finding) =>
        !finding.passed && SEVERITY_RANK[finding.severity] >= ISSUE_SEVERITY_MIN && Boolean(finding.url),
    );
    if (actionable.length === 0 && !pagesCrawled) {
      return { issuesCreated: 0, issuesUpdated: 0, issuesMovedToVerification: 0 };
    }

    const existing = await this.operations.listIssues(site.id);
    const byIdentity = new Map<string, IssueDto>();
    for (const issue of existing) {
      const identityKey = (issue.data?.audit as { identityKey?: string } | undefined)?.identityKey;
      if (issue.source === 'CRAWLER' && identityKey) {
        byIdentity.set(identityKey, issue);
      }
    }

    // Rules that produced at least one failed finding in this run. Any rule NOT
    // in this set passed, so its open issues can move toward verification.
    const failedRuleKeys = new Set(findings.filter((finding) => !finding.passed).map((finding) => finding.ruleKey));

    let created = 0;
    let updated = 0;
    let moved = 0;

    for (const finding of actionable) {
      const identityKey = computeIdentityKey(finding);
      const existingIssue = byIdentity.get(identityKey);

      if (existingIssue && OPEN_ISSUE_STATUSES.includes(existingIssue.status)) {
        await this.operations.updateIssueDetection(existingIssue.id, {
          lastDetectedAt: new Date(),
          evidence: finding.evidence,
          reopen: existingIssue.status === 'FIXED' || existingIssue.status === 'VERIFYING',
        });
        updated += 1;
        continue;
      }

      if (!existingIssue) {
        const kind = CATEGORY_TO_ISSUE_KIND[finding.category] ?? 'ON_PAGE';
        await this.operations.createIssue(
          site.id,
          site.organizationId,
          {
            kind,
            severity: SEVERITY_MAP[finding.severity],
            title: `${finding.ruleKey}: ${finding.url}`,
            description: `Deterministic audit finding from the ${finding.category} rule registry.`,
            url: finding.url,
            source: 'CRAWLER',
            data: {
              ruleKey: finding.ruleKey,
              category: finding.category,
              evidence: finding.evidence,
              audit: {
                identityKey,
                ruleKey: finding.ruleKey,
                category: finding.category,
                normalizedUrl: normalizeUrl(finding.url!),
                evidence: finding.evidence,
              },
            },
          },
          {},
        );
        created += 1;
        continue;
      }
      // RESOLVED / IGNORED: manually acted on — do not create a duplicate and
      // do not touch it.
    }

    // Pass reconciliation: an open issue whose rule no longer fails in the
    // latest completed audit is moved to verification (never auto-resolved;
    // a human confirms the fix). RESOLVED / IGNORED are never touched.
    for (const issue of byIdentity.values()) {
      if (!VERIFICATION_ELIGIBLE.includes(issue.status)) continue;
      const audit = issue.data?.audit as { ruleKey?: string } | undefined;
      if (!audit?.ruleKey) continue;
      if (failedRuleKeys.has(audit.ruleKey)) continue;
      await this.operations.updateIssueStatus(issue.id, {
        status: 'VERIFYING',
        note: 'Latest completed audit passed this rule — awaiting final verification.',
      });
      moved += 1;
    }

    return { issuesCreated: created, issuesUpdated: updated, issuesMovedToVerification: moved };
  }

  private async saveChunked<T extends { id?: string }>(repository: Repository<T>, rows: T[]): Promise<void> {
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await repository.save(rows.slice(i, i + CHUNK));
    }
  }
}

/**
 * Deterministic material finding identity. Most rules identify a finding by
 * (rule, URL); rules that can fire multiple times per URL carry a distinguishing
 * evidence field (e.g. the broken target).
 */
function materialIdentity(finding: AuditFinding): string {
  const evidence = finding.evidence;
  if (typeof evidence.targetUrl === 'string') return `target:${normalizeUrl(evidence.targetUrl)}`;
  if (typeof evidence.canonicalTarget === 'string') return `canonical:${normalizeUrl(evidence.canonicalTarget)}`;
  if (typeof evidence.title === 'string') return `title:${evidence.title}`;
  if (typeof evidence.description === 'string') return `description:${evidence.description}`;
  return '';
}

export function computeIdentityKey(finding: AuditFinding): string {
  const url = normalizeUrl(finding.url ?? '');
  const hash = createHash('sha256').update(`${finding.ruleKey}|${url}|${materialIdentity(finding)}`).digest('hex');
  return hash.slice(0, 32);
}

function toPageSignal(page: CrawlPage): AuditPageSignal {
  return {
    url: page.url,
    httpStatus: page.httpStatus,
    depth: page.depth,
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.h1,
    headings: page.headings,
    canonical: page.canonical,
    metaRobots: page.metaRobots,
    indexable: page.indexable,
    language: page.language,
    wordCount: page.wordCount,
    schemaJson: page.schemaJson ?? [],
    schemaBlocks: page.schemaBlocks,
    schemaErrors: page.schemaErrors,
    images: page.images,
    redirectChain: page.redirectChain,
    redirectLoop: page.redirectLoop,
  };
}

function toLinkSignal(link: CrawlLink): AuditLinkSignal {
  return {
    sourceUrl: link.sourceUrl,
    targetUrl: link.targetUrl,
    anchorText: link.anchorText,
    rel: link.rel,
    internal: link.internal,
    nofollow: link.nofollow,
    statusCodeWhenKnown: link.statusCodeWhenKnown,
  };
}

function toErrorSignal(error: CrawlError): AuditErrorSignal {
  return {
    url: error.url,
    errorType: error.errorType,
    message: error.message,
    statusCode: error.statusCode,
  };
}

function toRunDto(run: CrawlRun): CrawlRunDto {
  return {
    id: run.id,
    siteId: run.siteId,
    organizationId: run.organizationId,
    status: run.status as CrawlRunDto['status'],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    seedUrl: run.seedUrl,
    userAgent: run.userAgent,
    maxPages: run.maxPages,
    pagesDiscovered: run.pagesDiscovered,
    pagesCrawled: run.pagesCrawled,
    pagesFailed: run.pagesFailed,
    robotsStatus: run.robotsStatus as CrawlRunDto['robotsStatus'],
    sitemapStatus: run.sitemapStatus as CrawlRunDto['sitemapStatus'],
    renderedPages: run.renderedPages,
    sitemapUrls: run.sitemapUrls,
    error: run.error,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
  };
}

function toAuditRunDto(run: AuditRun): AuditRunDto {
  return {
    id: run.id,
    siteId: run.siteId,
    crawlRunId: run.crawlRunId,
    type: run.type,
    status: run.status as AuditRunDto['status'],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    scoreVersion: run.scoreVersion,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
  };
}

function toResultDto(result: AuditResult): AuditResultDto {
  return {
    id: result.id,
    auditRunId: result.auditRunId,
    siteId: result.siteId,
    crawlPageId: result.crawlPageId,
    url: result.url,
    ruleKey: result.ruleKey,
    ruleVersion: result.ruleVersion,
    category: result.category,
    severity: result.severity as AuditResultDto['severity'],
    passed: result.passed,
    evidence: result.evidence,
    createdAt: result.createdAt.toISOString(),
  };
}
