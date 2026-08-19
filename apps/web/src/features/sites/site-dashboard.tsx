import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, RefreshCw } from 'lucide-react';
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

  const primaryKeyword = d.main.topKeywords[0]?.keyword;

  const quickActions: Array<{ label: string; url: string; payload?: unknown; disabled?: boolean }> = [
    { label: 'Run Crawl', url: `/sites/${siteId}/orchestration/jobs`, payload: { workflow: 'crawl-audit' } },
    { label: 'Run Full Audit', url: `/sites/${siteId}/audit`, payload: {} },
    { label: 'Create Baseline', url: `/sites/${siteId}/baseline`, payload: {} },
    { label: 'Sync Search Console', url: `/sites/${siteId}/gsc/sync`, payload: {} },
    { label: 'Discover Keywords', url: `/sites/${siteId}/keywords/pipeline`, payload: { discoverFromGsc: true } },
    { label: 'Generate Content', url: `/sites/${siteId}/content/pipeline`, payload: { primaryKeyword: primaryKeyword ?? '' }, disabled: !primaryKeyword },
    { label: 'Create Report', url: `/sites/${siteId}/reporting/reports`, payload: { type: 'MONTHLY' } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{d.site.name}</h2>
            <StatusBadge status={d.site.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {d.site.domain} · {d.header.market ?? '—'} · {d.header.language} · Integration: <StatusBadge status={d.header.integrationHealth} />
            {d.header.lastSync ? <> · Last sync {new Date(d.header.lastSync).toLocaleDateString()}</> : null}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          <RefreshCw className="size-4" /> {t('common.refresh')}
        </Button>
      </div>

      {/* Empty states */}
      {d.emptyStates.needsAi ? (
        <InfoCard message="Configure at least one AI provider." detail="Add an API key in Settings → AI provider routing." action={{ label: 'Configure AI', to: `/sites/${siteId}?tab=settings` }} />
      ) : null}
      {d.emptyStates.needsCrawl ? (
        <InfoCard message="Run the initial site crawl." detail="The site has no crawled pages yet. Use the crawler tab or Run Crawl." />
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button key={action.label} size="sm" variant="outline" disabled={action.disabled || run.isPending} onClick={() => run.mutate({ url: action.url, payload: action.payload })}>
                <Play className="size-3.5" />
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Main metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="SEO Health" value={d.main.seoHealth ?? '—'} />
        <KpiCard label="AEO Readiness" value={d.main.aeoReadiness ?? '—'} />
        <KpiCard label="GEO Readiness" value={d.main.geoReadiness ?? '—'} />
        <KpiCard label="Open Issues" value={d.issues.open} />
        <KpiCard label="Critical Issues" value={d.issues.critical} />
        <KpiCard label="Recommendations" value={d.issues.recommendations} />
        <KpiCard label="Open Tasks" value={d.issues.openTasks} />
        <KpiCard label="Content Published" value={d.content.published} />
      </div>

      {/* Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>Current 28 days vs previous 28 days vs baseline</CardDescription>
        </CardHeader>
        <CardContent>
          {!d.performance.hasGsc ? (
            <EmptyState message="Connect Google Search Console to begin performance tracking." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <PerfBlock label="Current (28d)" clicks={d.performance.current.clicks} impressions={d.performance.current.impressions} ctr={d.performance.current.ctr} position={d.performance.current.avgPosition} />
              <PerfBlock label="Previous (28d)" clicks={d.performance.previous.clicks} impressions={d.performance.previous.impressions} ctr={d.performance.previous.ctr} position={d.performance.previous.avgPosition} />
              <PerfBlock label="Baseline" clicks={d.performance.baseline?.clicks ?? 0} impressions={d.performance.baseline?.impressions ?? 0} ctr={d.performance.baseline?.ctr ?? 0} position={d.performance.baseline?.avgPosition ?? null} />
            </div>
          )}
          {d.performance.currentVsPrevious.clicksPct !== null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Clicks {d.performance.currentVsPrevious.clicksPct > 0 ? '+' : ''}{d.performance.currentVsPrevious.clicksPct}% vs previous period.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Baseline progress */}
      <Card>
        <CardHeader>
          <CardTitle>Baseline Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {!d.baselineProgress.exists ? (
            <div>
              <EmptyState message="Initial baseline has not been created." />
              {canManage ? (
                <Button size="sm" variant="outline" onClick={() => run.mutate({ url: `/sites/${siteId}/baseline`, payload: {} })}>
                  <Play className="size-3.5" /> Run Initial Audit
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {d.baselineProgress.metrics.map((metric) => (
                <div key={metric.key} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{metric.label}</div>
                  <div className="text-lg font-semibold">
                    {metric.initial === null ? '—' : metric.initial} → {metric.current === null ? '—' : metric.current}
                  </div>
                  <div className={metric.change !== null && metric.change > 0 ? 'text-emerald-600' : metric.change !== null && metric.change < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                    {metric.change === null ? '—' : `${metric.change > 0 ? '+' : ''}${metric.change}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issue summary */}
      <Card>
        <CardHeader>
          <CardTitle>Issue Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <IssueSummaryTable summary={d.issueSummary} siteId={siteId} />
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.recommendations.length === 0 ? (
            <EmptyState message="No recommendations yet." />
          ) : (
            <ul className="divide-y">
              {d.recommendations.map((rec) => (
                <li key={rec.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{rec.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Impact {rec.impact} · Confidence {rec.confidence} · Effort {rec.effort}
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
          <CardTitle>Content Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {d.contentPipeline.map((stage) => (
              <li key={stage.stage} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">{stage.stage}</span>
                <span className="text-muted-foreground">{stage.count}{stage.latestAt ? ` · ${new Date(stage.latestAt).toLocaleDateString()}` : ''}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Integration health */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Health</CardTitle>
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
                    <Link to={item.deepLink} className="text-xs underline-offset-2 hover:underline">open</Link>
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
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.recentActivity.length === 0 ? (
            <EmptyState message="No activity yet." />
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

function InfoCard({ message, detail, action }: { message: string; detail?: string; action?: { label: string; to: string } }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <p className="font-medium">{message}</p>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        {action ? (
          <Button asChild size="sm" variant="outline">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PerfBlock({ label, clicks, impressions, ctr, position }: { label: string; clicks: number; impressions: number; ctr: number; position: number | null }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 space-y-1 text-sm">
        <div>Clicks: <strong>{clicks}</strong></div>
        <div>Impressions: <strong>{impressions}</strong></div>
        <div>CTR: <strong>{ctr.toFixed(3)}</strong></div>
        <div>Avg position: <strong>{position ?? '—'}</strong></div>
      </div>
    </div>
  );
}

function IssueSummaryTable({ summary, siteId }: { summary: SiteDashboardDto['issueSummary']; siteId: string }) {
  const rows = [
    { key: 'critical', label: 'Critical' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
  ] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">Severity</th>
            <th>Open</th>
            <th>In Progress</th>
            <th>Resolved This Month</th>
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


