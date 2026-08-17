import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OperationsAlert } from '@creative-seo/database';
import type {
  AlertDto,
  AlertEvalResultDto,
  AlertStatus,
  EvaluateAlertsRequest,
  OperationsQuery,
} from '@creative-seo/types';
import { Repository } from 'typeorm';
import { evaluateAlerts, type DetectedAlert, type AlertRuleInput } from './alerts';
import { OperationsService } from './operations.service';

/**
 * Alert handling. Alerts are detected deterministically, deduplicated (one OPEN
 * alert per kind), and then create an issue + a recommendation with metrics
 * derived deterministically from the alert evidence. Alerts never modify a live
 * site directly.
 */
@Injectable()
export class AlertService {
  constructor(
    @InjectRepository(OperationsAlert) private readonly alerts: Repository<OperationsAlert>,
    private readonly operations: OperationsService,
  ) {}

  async evaluate(
    siteId: string,
    organizationId: string | null,
    input: EvaluateAlertsRequest,
    options: { withRecommendations?: boolean } = {},
  ): Promise<AlertEvalResultDto[]> {
    const withRecommendations = options.withRecommendations ?? true;
    const ruleInput: AlertRuleInput = {
      gscHealthy: input.gscHealthy ?? true,
      wordpressHealthy: input.wordpressHealthy ?? true,
      traffic: input.traffic,
      ctr: input.ctr,
      position: input.position,
      criticalTechnicalIssueCount: input.criticalTechnicalIssueCount,
      contentDecay: input.contentDecay,
      cannibalization: input.cannibalization,
    };

    const detected = evaluateAlerts(ruleInput);
    const results: AlertEvalResultDto[] = [];

    for (const signal of detected) {
      const existing = await this.alerts.findOne({ where: { siteId, kind: signal.kind, status: 'OPEN' } });
      if (existing) {
        results.push({ alert: this.toDto(existing), issueId: existing.issueId, skipped: true });
        continue;
      }

      const alert = await this.alerts.save(
        this.alerts.create({
          siteId,
          organizationId,
          kind: signal.kind,
          severity: signal.severity,
          title: signal.title,
          description: signal.description,
          data: signal.data,
          status: 'OPEN',
          issueId: null,
          detectedAt: new Date(),
        }),
      );

      const issue = await this.operations.createIssue(
        siteId,
        organizationId,
        {
          kind: issueKindFromAlert(signal.kind),
          severity: signal.severity,
          title: signal.title,
          description: signal.description,
          url: signal.data.page ? String(signal.data.page) : null,
          data: signal.data,
        },
        { source: 'ALERT', alertId: alert.id },
      );

      const metrics = metricsFromAlert(signal);
      const recommendation = withRecommendations
        ? await this.operations.createRecommendation(siteId, organizationId, {
            issueId: issue.id,
            title: `Address: ${signal.title}`,
            evidence: JSON.stringify(signal.data),
            impact: metrics.impact,
            confidence: metrics.confidence,
            effort: metrics.effort,
            aiExplain: true,
          })
        : null;

      alert.issueId = issue.id;
      await this.alerts.save(alert);

      results.push({ alert: this.toDto(alert), issueId: issue.id, skipped: false });
      void recommendation;
    }

    return results;
  }

  async listAlerts(siteId: string, query: OperationsQuery = {}): Promise<AlertDto[]> {
    const builder = this.alerts
      .createQueryBuilder('alert')
      .where('alert.site_id = :siteId', { siteId })
      .orderBy('alert.detected_at', 'DESC')
      .limit(Math.min(query.limit ?? 50, 200))
      .offset(query.offset ?? 0);
    if (query.status) builder.andWhere('alert.status = :status', { status: query.status });
    if (query.kind) builder.andWhere('alert.kind = :kind', { kind: query.kind });
    const rows = await builder.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async updateAlertStatus(id: string, status: AlertStatus): Promise<AlertDto> {
    const row = await this.alerts.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Alert not found');
    }
    row.status = status;
    await this.alerts.save(row);
    return this.toDto(row);
  }

  private toDto(row: OperationsAlert): AlertDto {
    return {
      id: row.id,
      siteId: row.siteId,
      organizationId: row.organizationId,
      kind: row.kind as AlertDto['kind'],
      severity: row.severity as AlertDto['severity'],
      title: row.title,
      description: row.description,
      data: row.data,
      status: row.status as AlertDto['status'],
      issueId: row.issueId,
      detectedAt: row.detectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function issueKindFromAlert(kind: DetectedAlert['kind']): 'CANNIBALIZATION' | 'CRITICAL_TECHNICAL' | 'TRAFFIC_DROP' | 'CTR_DROP' | 'POSITION_DECLINE' | 'GSC_FAILURE' | 'WORDPRESS_FAILURE' | 'CONTENT_DECAY' | 'IMPRESSION_DECLINE' | 'QUERY_VISIBILITY_LOSS' | 'ON_PAGE' {
  switch (kind) {
    case 'NEW_CANNIBALIZATION':
      return 'CANNIBALIZATION';
    case 'CRITICAL_TECHNICAL_ISSUE':
      return 'CRITICAL_TECHNICAL';
    case 'IMPRESSION_DECLINE':
      return 'IMPRESSION_DECLINE';
    case 'QUERY_VISIBILITY_LOSS':
      return 'QUERY_VISIBILITY_LOSS';
    case 'NEW_HIGH_IMPRESSION_QUERY':
    case 'POSITION_4_10_OPPORTUNITY':
    case 'POSITION_11_20_OPPORTUNITY':
      return 'ON_PAGE';
    default:
      return kind;
  }
}

/** Deterministic metric estimates derived from alert evidence (never AI-invented). */
function metricsFromAlert(signal: DetectedAlert): { impact: number; confidence: number; effort: number } {
  const dropPct = Number(signal.data.dropPct ?? 0);
  switch (signal.kind) {
    case 'TRAFFIC_DROP':
    case 'CONTENT_DECAY':
      return { impact: clamp(dropPct * 150), confidence: 80, effort: 40 };
    case 'CTR_DROP':
      return { impact: clamp(dropPct * 200), confidence: 80, effort: 40 };
    case 'POSITION_DECLINE':
      return { impact: 60, confidence: 70, effort: 30 };
    case 'CRITICAL_TECHNICAL_ISSUE':
      return { impact: 90, confidence: 85, effort: 60 };
    case 'GSC_FAILURE':
    case 'WORDPRESS_FAILURE':
      return { impact: 70, confidence: 95, effort: 20 };
    case 'NEW_CANNIBALIZATION':
      return { impact: 65, confidence: 75, effort: 50 };
    case 'IMPRESSION_DECLINE':
      return { impact: clamp(dropPct * 150), confidence: 75, effort: 35 };
    case 'QUERY_VISIBILITY_LOSS':
      return { impact: clamp(dropPct * 200), confidence: 80, effort: 45 };
    case 'NEW_HIGH_IMPRESSION_QUERY':
      return { impact: 55, confidence: 70, effort: 30 };
    case 'POSITION_4_10_OPPORTUNITY':
      return { impact: 50, confidence: 75, effort: 35 };
    case 'POSITION_11_20_OPPORTUNITY':
      return { impact: 40, confidence: 70, effort: 30 };
    default:
      return { impact: 50, confidence: 60, effort: 40 };
  }
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
