import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { BaselineMetricsDto, BaselineSnapshotDto, ProgressDashboardDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { SiteSelector } from '@/components/shared/site-selector';
import { MetricTable, type MetricTableRow } from '@/components/shared/metric-table';
import { EmptyState } from '@/components/shared/empty-state';

export function MonitoringPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState('');
  const [showSnapshot, setShowSnapshot] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['monitoring-dashboard', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ProgressDashboardDto>(`/sites/${siteId}/monitoring/dashboard`),
  });

  const snapshotsQuery = useQuery({
    queryKey: ['monitoring-snapshots', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<BaselineSnapshotDto[]>(`/sites/${siteId}/monitoring/snapshots`),
  });

  const createMutation = useMutation({
    mutationFn: (body: { type: string; metrics: BaselineMetricsDto }) => api.post<BaselineSnapshotDto>(`/sites/${siteId}/monitoring/snapshots`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-snapshots'] });
      setShowSnapshot(false);
    },
  });

  const dashboard = dashboardQuery.data;
  const canManage = hasPermission('operations:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('monitoring.title')}
        description={t('monitoring.subtitle')}
        actions={
          canManage && siteId ? (
            <Button onClick={() => setShowSnapshot((v) => !v)}>
              <Plus className="size-4" />
              {t('monitoring.createSnapshot')}
            </Button>
          ) : undefined
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
      </div>

      {!siteId ? (
        <EmptyState message="Select a site to view its progress dashboard." />
      ) : (
        <>
          {showSnapshot && canManage && (
            <SnapshotForm submitting={createMutation.isPending} error={createMutation.isError ? t('common.error') : null} onSubmit={(body) => createMutation.mutate(body)} />
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('monitoring.dashboard')}</CardTitle>
              <CardDescription>
                {t('monitoring.baselineToCurrent')} · {t('monitoring.previousToCurrent')} · {t('monitoring.monthToMonth')} · {t('monitoring.quarterToQuarter')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {dashboardQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
              {dashboard && (
                <>
                  <Comparison title={t('monitoring.baselineToCurrent')} comparison={dashboard.baselineToCurrent} t={t} />
                  <Comparison title={t('monitoring.previousToCurrent')} comparison={dashboard.previousToCurrent} t={t} />
                  <Comparison title={t('monitoring.monthToMonth')} comparison={dashboard.monthToMonth} t={t} />
                  <Comparison title={t('monitoring.quarterToQuarter')} comparison={dashboard.quarterToQuarter} t={t} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('monitoring.snapshots')}</CardTitle>
              <CardDescription>{snapshotsQuery.data?.length ?? 0}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {snapshotsQuery.isLoading ? (
                <Skeleton className="m-4 h-20" />
              ) : (snapshotsQuery.data ?? []).length === 0 ? (
                <EmptyState message="No snapshots yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('monitoring.snapshotType')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>Baseline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(snapshotsQuery.data ?? []).map((snapshot) => (
                      <TableRow key={snapshot.id}>
                        <TableCell className="font-medium">{snapshot.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(snapshot.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>{snapshot.isBaseline ? 'Yes' : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Comparison({ title, comparison, t }: { title: string; comparison: { metrics: import('@creative-seo/types').MetricComparisonDto[]; issueProgression?: import('@creative-seo/types').IssueProgressionDto } | null; t: (key: string) => string }) {
  if (!comparison) return null;
  const rows: MetricTableRow[] = comparison.metrics.map((metric) => ({
    label: humanizeKey(metric.key),
    previous: metric.prev === null ? '—' : String(metric.prev),
    current: String(metric.curr),
    delta: metric.deltaPct === null ? '—' : `${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct.toFixed(1)}%`,
    direction: metric.direction,
  }));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <MetricTable rows={rows} />
      {comparison.issueProgression ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{t('monitoring.initial')}: {comparison.issueProgression.initial}</span>
          <span>{t('monitoring.new')}: {comparison.issueProgression.new}</span>
          <span>{t('monitoring.resolved')}: {comparison.issueProgression.resolved}</span>
          <span>{t('monitoring.remaining')}: {comparison.issueProgression.remaining}</span>
          <span>{t('monitoring.regressed')}: {comparison.issueProgression.regressed}</span>
        </div>
      ) : null}
    </div>
  );
}

function SnapshotForm({ submitting, error, onSubmit }: { submitting: boolean; error: string | null; onSubmit: (body: { type: string; metrics: BaselineMetricsDto }) => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState('PERIODIC');
  const [crawlHealth, setCrawlHealth] = useState('80');
  const [technicalIssues, setTechnicalIssues] = useState('0');
  const [onPageHealth, setOnPageHealth] = useState('60');
  const [contentHealth, setContentHealth] = useState('50');
  const [aeoReadiness, setAeoReadiness] = useState('40');
  const [geoReadiness, setGeoReadiness] = useState('35');
  const [keywordVisibility, setKeywordVisibility] = useState('20');
  const [internalLinkHealth, setInternalLinkHealth] = useState('55');

  const num = (value: string) => Number(value) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('monitoring.createSnapshot')}</CardTitle>
        <CardDescription>{t('monitoring.createDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              type,
              metrics: {
                crawlHealth: num(crawlHealth),
                technicalIssues: num(technicalIssues),
                onPageHealth: num(onPageHealth),
                contentHealth: num(contentHealth),
                aeoReadiness: num(aeoReadiness),
                geoReadiness: num(geoReadiness),
                gscMetrics: { clicks: 0, impressions: 0, ctr: 0, avgPosition: null },
                keywordVisibility: num(keywordVisibility),
                internalLinkHealth: num(internalLinkHealth),
              },
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="snap-type">{t('monitoring.snapshotType')}</Label>
            <Select id="snap-type" value={type} onChange={(e) => setType(e.target.value)}>
              {['BASELINE', 'PERIODIC', 'MONTHLY', 'QUARTERLY'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <NumberField label="Crawl health" value={crawlHealth} onChange={setCrawlHealth} />
          <NumberField label="Technical issues" value={technicalIssues} onChange={setTechnicalIssues} />
          <NumberField label="On-page health" value={onPageHealth} onChange={setOnPageHealth} />
          <NumberField label="Content health" value={contentHealth} onChange={setContentHealth} />
          <NumberField label="AEO readiness" value={aeoReadiness} onChange={setAeoReadiness} />
          <NumberField label="GEO readiness" value={geoReadiness} onChange={setGeoReadiness} />
          <NumberField label="Keyword visibility" value={keywordVisibility} onChange={setKeywordVisibility} />
          <NumberField label="Internal-link health" value={internalLinkHealth} onChange={setInternalLinkHealth} />
          {error ? <p className="text-sm text-destructive sm:col-span-4">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="sm:col-span-4">
            {t('monitoring.createSnapshot')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
