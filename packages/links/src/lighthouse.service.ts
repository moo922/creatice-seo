import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LighthouseRun } from '@creative-seo/database';
import type { LighthouseRunDto, RunLighthouseRequest } from '@creative-seo/types';
import { Repository } from 'typeorm';

type LighthouseFn = (url: string, options: Record<string, unknown>) => Promise<{ lhr?: { categories?: Record<string, { score?: number }> } }>;
type ChromeLauncher = { launch: (opts: Record<string, unknown>) => Promise<{ port: number; kill: () => Promise<void> }> };

/**
 * Local Lighthouse capability for representative URLs. Runs a headless-Chrome
 * audit on demand (never on every crawl page). Scores are stored separately
 * from the Internal Platform Health Score and are never mixed into it without
 * an explicit, documented weighting. If Chrome / the lighthouse package is not
 * available on the server, the run fails gracefully with a clear message.
 */
@Injectable()
export class LighthouseService {
  constructor(
    @InjectRepository(LighthouseRun) private readonly runs: Repository<LighthouseRun>,
  ) {}

  async run(siteId: string, input: RunLighthouseRequest, createdBy: string | null): Promise<LighthouseRunDto> {
    const run = await this.runs.save(
      this.runs.create({ siteId, url: input.url, status: 'RUNNING', scores: {}, error: null, createdBy }),
    );

    try {
      const lighthouse = await this.loadLighthouse();
      const chrome = await this.launchChrome();
      try {
        const result = await lighthouse(input.url, {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        });
        const categories = result?.lhr?.categories ?? {};
        run.scores = {
          performance: toScore(categories.performance?.score),
          accessibility: toScore(categories.accessibility?.score),
          bestPractices: toScore(categories['best-practices']?.score),
          seo: toScore(categories.seo?.score),
        };
        run.status = 'COMPLETED';
      } finally {
        await chrome.kill().catch(() => undefined);
      }
    } catch (error) {
      run.status = 'FAILED';
      run.error = error instanceof Error ? error.message.slice(0, 1000) : 'Lighthouse run failed';
    }

    const saved = await this.runs.save(run);
    return toDto(saved);
  }

  async list(siteId: string): Promise<LighthouseRunDto[]> {
    const rows = await this.runs.find({ where: { siteId }, order: { createdAt: 'DESC' } });
    return rows.map(toDto);
  }

  private async loadLighthouse(): Promise<LighthouseFn> {
    try {
      const mod = await import('lighthouse');
      const fn = (mod.default ?? mod) as unknown;
      if (typeof fn === 'function') return fn as LighthouseFn;
    } catch {
      // fall through to the friendly error below
    }
    throw new Error('Lighthouse is not installed on this server (npm install lighthouse chrome-launcher)');
  }

  private async launchChrome(): Promise<{ port: number; kill: () => Promise<void> }> {
    try {
      const mod = await import('chrome-launcher');
      const launcher = (mod.default ?? mod) as ChromeLauncher;
      return launcher.launch({
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      });
    } catch {
      throw new Error('Lighthouse is not installed on this server (npm install lighthouse chrome-launcher)');
    }
  }
}

function toScore(value: number | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function toDto(run: LighthouseRun): LighthouseRunDto {
  return {
    id: run.id,
    siteId: run.siteId,
    url: run.url,
    status: run.status as LighthouseRunDto['status'],
    scores: {
      performance: run.scores.performance ?? null,
      accessibility: run.scores.accessibility ?? null,
      bestPractices: run.scores.bestPractices ?? null,
      seo: run.scores.seo ?? null,
    },
    error: run.error,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
  };
}
