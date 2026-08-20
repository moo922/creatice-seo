import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Play, Zap } from 'lucide-react';
import type { SiteDashboardDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/shared/kpi-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

export function SiteDashboard({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['site-dashboard', siteId],
    queryFn: () => api.get<SiteDashboardDto>(`/sites/${siteId}/dashboard`),
  });

  const run = useMutation({
    mutationFn: (body: { url: string; method?: 'post'; payload?: unknown }) =>
      api.post(body.url, body.payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-dashboard', siteId] }),
  });

  const canManage = hasPermission('sites:update') || hasPermission('content:manage') || hasPermission('operations:manage') || hasPermission('links:manage');

  const d = dashboardQuery.data;

  if (dashboardQuery.isLoading) {
    return <Card><CardContent className="py-10"><EmptyState message="Loading…" /></CardContent></Card>;
  }
  if (!d) {
    return <Card><CardContent className="py-10"><EmptyState message={t('common.error')} /></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      {/* Next Best Action */}
      {d.nextBestAction ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="font-medium">{d.nextBestAction.message}</p>
                <p className="text-sm text-muted-foreground">{d.nextBestAction.detail}</p>
              </div>
            </div>
            <Button asChild size="sm">
              <Link to={d.nextBestAction.actionUrl}>
                {d.nextBestAction.actionLabel} <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Site readiness */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.siteReadiness')}</CardTitle>
          <CardDescription>{t('dashboard.siteReadinessDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {d.siteReadiness.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {item.status === 'ready' ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : item.status === 'optional' ? (
                    <span className="size-4 rounded-full border border-muted-foreground/30" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-500" />
                  )}
                  <span className="font-medium">{item.label}</span>
                  {item.detail ? <span className="text-muted-foreground">— {item.detail}</span> : null}
                </div>
                {item.deepLink ? (
                  <Link to={item.deepLink} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    {item.status === 'ready' ? t('dashboard.view') : t('dashboard.setup')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Main metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('dashboard.seoHealth')} value={d.main.seoHealth ?? '—'} />
        <KpiCard label={t('dashboard.aeoReadiness')} value={d.main.aeoReadiness !== null ? d.main.aeoReadiness : t('dashboard.notMeasured')} />
        <KpiCard label={t('dashboard.geoReadiness')} value={d.main.geoReadiness !== null ? d.main.geoReadiness : t('dashboard.notMeasured')} />
        <KpiCard label={t('dashboard.openIssues')} value={d.issues.open} />
        <KpiCard label={t('dashboard.criticalIssues')} value={d.issues.critical} />
        <KpiCard label={t('dashboard.recommendations')} value={d.issues.recommendations} />
        <KpiCard label={t('dashboard.openTasks')} value={d.issues.openTasks} />
        <KpiCard label={t('dashboard.contentPublished')} value={d.content.published} />
      </div>

      {/* Performance */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.performance')}</CardTitle>
          <CardDescription>{t('dashboard.performanceDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!d.performance.hasGsc ? (
            <EmptyState
              message={t('dashboard.connectGscForPerformance')}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <PerfBlock label={t('dashboard.current28d')} clicks={d.performance.current.clicks} impressions={d.performance.current.impressions} ctr={d.performance.current.ctr} position={d.performance.current.avgPosition} />
              <PerfBlock label={t('dashboard.previous28d')} clicks={d.performance.previous.clicks} impressions={d.performance.previous.impressions} ctr={d.performance.previous.ctr} position={d.performance.previous.avgPosition} />
              <PerfBlock label={t('dashboard.baseline')} clicks={d.performance.baseline?.clicks ?? null} impressions={d.performance.baseline?.impressions ?? null} ctr={d.performance.baseline?.ctr ?? null} position={d.performance.baseline?.avgPosition ?? null} />
            </div>
          )}
          {d.performance.currentVsPrevious.clicksPct !== null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('dashboard.clicksChange', { pct: d.performance.currentVsPrevious.clicksPct })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Baseline progress */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.baselineProgress')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!d.baselineProgress.exists ? (
            <div className="space-y-3">
              <EmptyState message={t('dashboard.noBaseline')} />
              {canManage ? (
                <Button size="sm" variant="outline" onClick={() => run.mutate({ url: `/sites/${siteId}/baseline`, payload: {} })}>
                  <Play className="size-3.5" /> {t('dashboard.createBaseline')}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {d.baselineProgress.metrics.map((metric) => (
                <div key={metric.key} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{metric.label}</div>
                  {metric.status === 'not_measured' ? (
                    <div className="text-lg font-semibold text-muted-foreground">{t('dashboard.notMeasured')}</div>
                  ) : (
                    <>
                      <div className="text-lg font-semibold">
                        {metric.initial ?? '—'} → {metric.current ?? '—'}
                      </div>
                      <div className={metric.change !== null && metric.change > 0 ? 'text-emerald-600' : metric.change !== null && metric.change < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                        {metric.change === null ? '—' : `${metric.change > 0 ? '+' : ''}${metric.change}`}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issue summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.issueSummary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <IssueSummaryTable summary={d.issueSummary} siteId={siteId} />
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recommendations')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.recommendations.length === 0 ? (
            <EmptyState message={t('dashboard.noRecommendations')} />
          ) : (
            <ul className="divide-y">
              {d.recommendations.map((rec) => (
                <li key={rec.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{rec.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('dashboard.impactConfidenceEffort', { impact: rec.impact, confidence: rec.confidence, effort: rec.effort })}
                    </div>
                  </div>
                  <StatusBadge status={rec.priority} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Content pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.contentPipeline')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.contentPipeline.length === 0 ? (
            <EmptyState message={t('dashboard.noContent')} />
          ) : (
            <ul className="divide-y">
              {d.contentPipeline.map((stage) => (
                <li key={stage.stage} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-medium">{stage.stage}</span>
                  <span className="text-muted-foreground">{stage.count}{stage.latestAt ? ` · ${new Date(stage.latestAt).toLocaleDateString()}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Integration health */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.integrationHealth')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {d.integrationHealth.map((item) => (
              <li key={item.component} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="font-medium">{item.component}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {item.detail ?? ''}
                  <StatusBadge status={item.status.replace('_', ' ')} />
                  {item.deepLink ? (
                    <Link to={item.deepLink} className="text-xs underline-offset-2 hover:underline">{t('dashboard.open')}</Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.recentActivity.length === 0 ? (
            <EmptyState message={t('dashboard.noActivity')} />
          ) : (
            <ul className="divide-y">
              {d.recentActivity.map((activity, index) => (
                <li key={index} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{activity.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PerfBlock({ label, clicks, impressions, ctr, position }: { label: string; clicks: number | null; impressions: number | null; ctr: number | null; position: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 space-y-1 text-sm">
        <div>{t('dashboard.clicks')}: <strong>{clicks !== null ? clicks : '—'}</strong></div>
        <div>{t('dashboard.impressions')}: <strong>{impressions !== null ? impressions : '—'}</strong></div>
        <div>{t('dashboard.ctr')}: <strong>{ctr !== null ? ctr.toFixed(3) : '—'}</strong></div>
        <div>{t('dashboard.avgPosition')}: <strong>{position ?? '—'}</strong></div>
      </div>
    </div>
  );
}

function IssueSummaryTable({ summary, siteId }: { summary: SiteDashboardDto['issueSummary']; siteId: string }) {
  const { t } = useTranslation();
  const rows = [
    { key: 'critical', label: t('issues.severity.critical') },
    { key: 'high', label: t('issues.severity.high') },
    { key: 'medium', label: t('issues.severity.medium') },
    { key: 'low', label: t('issues.severity.low') },
  ] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">{t('dashboard.severity')}</th>
            <th>{t('dashboard.open')}</th>
            <th>{t('dashboard.inProgress')}</th>
            <th>{t('dashboard.resolvedThisMonth')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <td className="py-2 font-medium">{row.label}</td>
              <td><Link to={`/sites/${siteId}?tab=issues&status=${row.label.toUpperCase()}`} className="underline-offset-2 hover:underline">{summary[row.key].open}</Link></td>
              <td>{summary[row.key].inProgress}</td>
              <td>{summary[row.key].resolvedThisMonth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
