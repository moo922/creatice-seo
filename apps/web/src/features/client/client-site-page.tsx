import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import type {
  ClientIssuesDto,
  ClientOverviewDto,
  ClientPerformanceDto,
  ClientProgressDto,
  ClientRecommendationsDto,
  ClientWorkDto,
  ReportDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricTable, type MetricTableRow } from '@/components/shared/metric-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

export function ClientSitePage() {
  const { siteId = '' } = useParams();
  const { t } = useTranslation();

  const overviewQuery = useQuery({
    queryKey: ['client', siteId, 'overview'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientOverviewDto>(`/sites/${siteId}/client/overview`),
  });
  const progressQuery = useQuery({
    queryKey: ['client', siteId, 'progress'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientProgressDto>(`/sites/${siteId}/client/progress`),
  });
  const performanceQuery = useQuery({
    queryKey: ['client', siteId, 'performance'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientPerformanceDto>(`/sites/${siteId}/client/performance`),
  });
  const workQuery = useQuery({
    queryKey: ['client', siteId, 'work'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientWorkDto>(`/sites/${siteId}/client/work`),
  });
  const issuesQuery = useQuery({
    queryKey: ['client', siteId, 'issues'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientIssuesDto>(`/sites/${siteId}/client/issues`),
  });
  const recommendationsQuery = useQuery({
    queryKey: ['client', siteId, 'recommendations'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ClientRecommendationsDto>(`/sites/${siteId}/client/recommendations`),
  });
  const reportsQuery = useQuery({
    queryKey: ['client', siteId, 'reports'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ReportDto[]>(`/sites/${siteId}/client/reports`),
  });

  const overview = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/client" aria-label={t('common.back')}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{overview?.site.name ?? '…'}</h1>
          <p className="text-sm text-muted-foreground">{overview?.site.domain ?? ''}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">{t('client.overview')}</TabsTrigger>
          <TabsTrigger value="progress">{t('client.progress')}</TabsTrigger>
          <TabsTrigger value="performance">{t('client.performance')}</TabsTrigger>
          <TabsTrigger value="work">{t('client.work')}</TabsTrigger>
          <TabsTrigger value="issues">{t('client.issues')}</TabsTrigger>
          <TabsTrigger value="recommendations">{t('client.recommendations')}</TabsTrigger>
          <TabsTrigger value="reports">{t('client.reports')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {overviewQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : overview ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label={t('client.openIssues')} value={overview.openIssues} />
              <Stat label={t('client.majorIssues')} value={overview.majorIssues} />
              <Stat label={t('client.workCompleted')} value={overview.workCompleted} />
              <Stat label="Status" value={overview.status} />
            </div>
          ) : (
            <EmptyState message={t('common.error')} />
          )}
        </TabsContent>

        <TabsContent value="progress">
          {progressQuery.isLoading ? <Skeleton className="h-32" /> : <ProgressView data={progressQuery.data} />}
        </TabsContent>

        <TabsContent value="performance">
          {performanceQuery.isLoading ? <Skeleton className="h-32" /> : <PerformanceView data={performanceQuery.data} />}
        </TabsContent>

        <TabsContent value="work">
          {workQuery.isLoading ? <Skeleton className="h-32" /> : <WorkView data={workQuery.data} />}
        </TabsContent>

        <TabsContent value="issues">
          {issuesQuery.isLoading ? <Skeleton className="h-32" /> : <IssuesView data={issuesQuery.data} />}
        </TabsContent>

        <TabsContent value="recommendations">
          {recommendationsQuery.isLoading ? <Skeleton className="h-32" /> : <RecommendationsView data={recommendationsQuery.data} />}
        </TabsContent>

        <TabsContent value="reports">
          {reportsQuery.isLoading ? <Skeleton className="h-32" /> : <ReportsView data={reportsQuery.data} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function ProgressView({ data }: { data: ClientProgressDto | undefined }) {
  const { t } = useTranslation();
  if (!data) return <EmptyState message="No data" />;
  const sections: Array<{ title: string; comparison: ClientProgressDto['baselineToCurrent'] }> = [
    { title: t('monitoring.baselineToCurrent'), comparison: data.baselineToCurrent },
    { title: t('monitoring.previousToCurrent'), comparison: data.previousToCurrent },
  ];
  return (
    <div className="space-y-6">
      {sections.map((section) =>
        section.comparison ? (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricTable rows={toRows(section.comparison.metrics)} />
            </CardContent>
          </Card>
        ) : null,
      )}
      {!sections.some((section) => section.comparison) ? <EmptyState message="No comparisons yet." /> : null}
    </div>
  );
}

function PerformanceView({ data }: { data: ClientPerformanceDto | undefined }) {
  if (!data) return <EmptyState message="No data" />;
  const rows = toRows(data.metrics);
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <MetricTable rows={rows} />
        {data.visibility ? (
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{data.visibility.label}</p>
            <div className="grid gap-3 sm:grid-cols-5">
              <Mini label="Brand mention" value={pct(data.visibility.brandMentionRate)} />
              <Mini label="Citation" value={pct(data.visibility.citationRate)} />
              <Mini label="Source coverage" value={pct(data.visibility.sourceCoverage)} />
              <Mini label="Competitor inclusion" value={pct(data.visibility.competitorInclusion)} />
              <Mini label="Share of voice" value={pct(data.visibility.shareOfVoice.brand)} />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WorkView({ data }: { data: ClientWorkDto | undefined }) {
  if (!data) return <EmptyState message="No data" />;
  if (data.items.length === 0) return <EmptyState message="No completed work yet." />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ul className="space-y-2">
          {data.items.map((item, index) => (
            <li key={index} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{item.kind}</span>
              <span className="text-muted-foreground">{item.pageUrl ?? item.label}</span>
              <span className="text-xs text-muted-foreground">{item.changedAt}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function IssuesView({ data }: { data: ClientIssuesDto | undefined }) {
  if (!data) return <EmptyState message="No data" />;
  if (data.items.length === 0) return <EmptyState message="No major issues." />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ul className="space-y-2">
          {data.items.map((issue) => (
            <li key={issue.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{issue.title}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">{issue.kind}</span>
                <StatusBadge status={issue.severity} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RecommendationsView({ data }: { data: ClientRecommendationsDto | undefined }) {
  if (!data) return <EmptyState message="No data" />;
  if (data.items.length === 0) return <EmptyState message="No approved recommendations." />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ul className="space-y-2">
          {data.items.map((recommendation) => (
            <li key={recommendation.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{recommendation.title}</span>
                <StatusBadge status={recommendation.priority} />
              </div>
              {recommendation.suggestedAction ? <p className="mt-1 text-muted-foreground">{recommendation.suggestedAction}</p> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReportsView({ data }: { data: ReportDto[] | undefined }) {
  if (!data) return <EmptyState message="No data" />;
  if (data.length === 0) return <EmptyState message="No reports yet." />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ul className="space-y-2">
          {data.map((report) => (
            <li key={report.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{report.type}</span>
              <span className="text-muted-foreground">v{report.version} · {new Date(report.createdAt).toLocaleDateString()}</span>
              <StatusBadge status={report.status} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function toRows(metrics: import('@creative-seo/types').MetricComparisonDto[]): MetricTableRow[] {
  return metrics.map((metric) => ({
    label: humanizeKey(metric.key),
    previous: metric.prev === null ? '—' : String(metric.prev),
    current: String(metric.curr),
    delta: metric.deltaPct === null ? '—' : `${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct.toFixed(1)}%`,
    direction: metric.direction,
  }));
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
