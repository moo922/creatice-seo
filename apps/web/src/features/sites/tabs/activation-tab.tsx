import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivationStepDto, SiteActivationDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { KpiCard } from '@/components/shared/kpi-card';
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Play, RefreshCw, Rocket } from 'lucide-react';

type StepStatus = ActivationStepDto['status'];

const STATUS_META: Record<StepStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: 'Not started', className: 'bg-muted text-muted-foreground' },
  READY: { label: 'Ready', className: 'bg-primary/10 text-primary' },
  RUNNING: { label: 'Running', className: 'bg-primary/10 text-primary' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
  WARNING: { label: 'Warning', className: 'bg-amber-100 text-amber-700' },
  FAILED: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
  NOT_IMPLEMENTED: { label: 'Not implemented', className: 'bg-muted text-muted-foreground' },
};

export function ActivationTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['activation', siteId],
    queryFn: () => api.get<SiteActivationDto>(`/sites/${siteId}/activation`),
    refetchInterval: (query) => (query.state.data?.steps.some((step) => step.status === 'RUNNING') ? 2000 : false),
  });

  const runStep = useMutation({
    mutationFn: (stepKey: string) => api.post<ActivationStepDto>(`/sites/${siteId}/activation/steps/run`, { stepKey }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['activation', siteId] });
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const generateReport = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/reporting/reports`, { type: 'INITIAL' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activation', siteId] }),
    onError: (error: Error) => setActionError(error.message),
  });

  const canManage = hasPermission('operations:manage');
  const canReport = hasPermission('reporting:manage');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const running = data.steps.find((step) => step.status === 'RUNNING');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="size-4 text-primary" />
                {t('activation.title')}
              </CardTitle>
              <CardDescription className="mt-1">
                {t('activation.subtitle', { domain: data.siteDomain })}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? <Spinner /> : <RefreshCw />}
              {t('common.refresh')}
            </Button>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                {data.ready ? t('activation.ready') : t('activation.progress')}
              </span>
              <span className="text-muted-foreground">
                {data.completedSteps}/{data.totalSteps} · {data.progress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.progress}%` }} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {actionError ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {actionError}
          </CardContent>
        </Card>
      ) : null}

      {data.ready ? (
        <Card className="border-emerald-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-5" />
              {t('activation.siteReady')}
            </CardTitle>
            <CardDescription>{t('activation.siteReadyHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label={t('activation.kpis.pagesImported')} value={data.summary.pagesImported} />
              <KpiCard label={t('activation.kpis.pagesCrawled')} value={data.summary.pagesCrawled} />
              <KpiCard label={t('activation.kpis.issuesFound')} value={data.summary.issuesFound} />
              <KpiCard label={t('activation.kpis.criticalIssues')} value={data.summary.criticalIssues} />
              <KpiCard label={t('activation.kpis.seoHealth')} value={formatScore(data.summary.seoHealth)} />
              <KpiCard label={t('activation.kpis.aeoReadiness')} value={formatScore(data.summary.aeoReadiness)} />
              <KpiCard label={t('activation.kpis.geoReadiness')} value={formatScore(data.summary.geoReadiness)} />
              <KpiCard label={t('activation.kpis.searchQueries')} value={data.summary.searchQueriesImported} />
              <KpiCard label={t('activation.kpis.keywords')} value={data.summary.keywordOpportunities} />
              <KpiCard label={t('activation.kpis.cannibalization')} value={data.summary.cannibalizationCases} />
              <KpiCard label={t('activation.kpis.recommendations')} value={data.summary.recommendations} />
              <KpiCard
                label={t('activation.kpis.baselineDate')}
                value={data.summary.baselineDate ? new Date(data.summary.baselineDate).toLocaleDateString() : '—'}
              />
            </div>
            {canReport ? (
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
                  {generateReport.isPending ? <Spinner /> : <Rocket />}
                  {data.summary.initialReportExists ? t('activation.regenerateInitial') : t('activation.generateInitial')}
                </Button>
                <Button variant="outline" onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
                  {t('activation.createActionPlan')}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('activation.stages')}</CardTitle>
          {running ? (
            <CardDescription className="flex items-center gap-2">
              <Spinner />
              {t('activation.runningHint', { step: running.label })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {data.steps.map((step, index) => (
              <StepRow
                key={step.key}
                index={index}
                step={step}
                canManage={canManage}
                running={runStep.isPending}
                onRun={() => runStep.mutate(step.key)}
              />
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function StepRow({
  index,
  step,
  canManage,
  running,
  onRun,
}: {
  index: number;
  step: ActivationStepDto;
  canManage: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const meta = STATUS_META[step.status];
  const Icon =
    step.status === 'COMPLETED' ? CheckCircle2 : step.status === 'FAILED' ? AlertTriangle : step.status === 'RUNNING' ? Spinner : CircleDashed;

  const oauthUrl =
    step.detail && typeof step.detail === 'object' && 'authorizationUrl' in step.detail
      ? String(step.detail.authorizationUrl)
      : null;

  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{step.label}</span>
          <Badge variant="outline" className={meta.className}>
            {step.status === 'RUNNING' ? <Spinner className="size-3" /> : <Icon className="size-3" />}
            {t(`activation.status.${step.status}`)}
          </Badge>
          {step.expensive ? <span className="text-xs text-muted-foreground">{t('activation.notAutoRepeated')}</span> : null}
          {step.requiresManualAction ? <span className="text-xs text-primary">{t('activation.manualStep')}</span> : null}
        </div>
        {step.message ? <p className="mt-1 text-sm text-muted-foreground">{step.message}</p> : null}
        {step.status === 'FAILED' && step.detail ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
            {JSON.stringify(step.detail, null, 2)}
          </pre>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {oauthUrl && step.status !== 'COMPLETED' ? (
          <Button size="sm" variant="outline" asChild>
            <a href={oauthUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('activation.connect')}
            </a>
          </Button>
        ) : null}
        {step.status === 'COMPLETED' ? null : canManage ? (
          <Button size="sm" onClick={onRun} disabled={running || !step.runnable}>
            {running ? <Spinner /> : <Play />}
            {t('activation.run')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function formatScore(score: number | null): string {
  return score === null || Number.isNaN(score) ? '—' : String(score);
}
