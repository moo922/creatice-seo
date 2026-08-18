/**
 * Cost budget enforcement (GC06 Section 52). Checks monthly observation budget
 * before executing runs. Supports hard budget (blocks) and soft budget (warns).
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiVisibilityBudget } from '@creative-seo/database';
import { AiVisibilityObservationV2 } from '@creative-seo/database';

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  spent: number;
  budget: number;
  withinBudget: boolean;
  hardLimit: boolean;
  warning: string | null;
}

export interface BudgetConfig {
  monthlyObservationBudgetUsd: number;
  maxTestsPerRun: number;
  repeatCount: number;
  enabledProviders: string[];
  priorityPromptOnly: boolean;
  hardBudget: boolean;
}

@Injectable()
export class CostBudgetService {
  private readonly logger = new Logger(CostBudgetService.name);

  constructor(
    @InjectRepository(AiVisibilityBudget)
    private readonly budgets: Repository<AiVisibilityBudget>,
    @InjectRepository(AiVisibilityObservationV2)
    private readonly observations: Repository<AiVisibilityObservationV2>,
  ) {}

  async getBudget(siteId: string): Promise<BudgetConfig | null> {
    const row = await this.budgets.findOne({ where: { siteId } });
    if (!row) return null;
    return {
      monthlyObservationBudgetUsd: Number(row.monthlyObservationBudgetUsd),
      maxTestsPerRun: row.maxTestsPerRun,
      repeatCount: row.repeatCount,
      enabledProviders: row.enabledProviders,
      priorityPromptOnly: row.priorityPromptOnly,
      hardBudget: row.hardBudget,
    };
  }

  async upsertBudget(siteId: string, config: Partial<BudgetConfig>): Promise<BudgetConfig> {
    let row = await this.budgets.findOne({ where: { siteId } });
    if (!row) {
      row = this.budgets.create({ siteId });
    }
    if (config.monthlyObservationBudgetUsd !== undefined) row.monthlyObservationBudgetUsd = config.monthlyObservationBudgetUsd;
    if (config.maxTestsPerRun !== undefined) row.maxTestsPerRun = config.maxTestsPerRun;
    if (config.repeatCount !== undefined) row.repeatCount = config.repeatCount;
    if (config.enabledProviders !== undefined) row.enabledProviders = config.enabledProviders;
    if (config.priorityPromptOnly !== undefined) row.priorityPromptOnly = config.priorityPromptOnly;
    if (config.hardBudget !== undefined) row.hardBudget = config.hardBudget;
    const saved = await this.budgets.save(row);
    return this.getBudget(siteId) as Promise<BudgetConfig>;
  }

  async checkBudget(siteId: string): Promise<BudgetCheckResult> {
    const config = await this.getBudget(siteId);
    if (!config) {
      return {
        allowed: true,
        remaining: 10,
        spent: 0,
        budget: 10,
        withinBudget: true,
        hardLimit: true,
        warning: null,
      };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const result = await this.observations
      .createQueryBuilder('obs')
      .select('COALESCE(SUM(obs.cost_usd), 0)', 'total')
      .where('obs.site_id = :siteId', { siteId })
      .andWhere('obs.observed_at >= :monthStart', { monthStart })
      .andWhere('obs.observed_at <= :monthEnd', { monthEnd })
      .andWhere('obs.status != :failed', { failed: 'FAILED' })
      .getRawOne();

    const spent = Number(result?.total ?? 0);
    const budget = config.monthlyObservationBudgetUsd;
    const remaining = Math.max(0, budget - spent);
    const withinBudget = spent < budget;

    let warning: string | null = null;
    if (!withinBudget) {
      warning = config.hardBudget
        ? `Monthly budget of $${budget} exceeded ($${spent} spent). Run blocked.`
        : `Monthly budget of $${budget} exceeded ($${spent} spent). Run proceeding (soft limit).`;
      this.logger.warn(warning);
    } else if (remaining < budget * 0.1) {
      warning = `Monthly budget running low: $${remaining.toFixed(4)} remaining of $${budget}`;
    }

    return {
      allowed: config.hardBudget ? withinBudget : true,
      remaining,
      spent,
      budget,
      withinBudget,
      hardLimit: config.hardBudget,
      warning,
    };
  }

  async estimateCost(
    siteId: string,
    promptCount: number,
    repeatCount: number,
  ): Promise<{ estimatedCostUsd: number; withinBudget: boolean }> {
    const config = await this.getBudget(siteId);
    if (!config) return { estimatedCostUsd: 0, withinBudget: true };

    const avgCostPerPrompt = 0.001;
    const estimatedCostUsd = promptCount * repeatCount * avgCostPerPrompt;

    const check = await this.checkBudget(siteId);
    return {
      estimatedCostUsd,
      withinBudget: check.remaining >= estimatedCostUsd || !config.hardBudget,
    };
  }
}
