import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ActivationStepDto, SiteActivationDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { KpiCard } from '@/components/shared/kpi-card';
import { AlertTriangle, CheckCircle2, Play, Rocket, Settings } from 'lucide-react';

export function ActivationTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
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

  const canReport = hasPermission('reporting:manage');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const stepMap = new Map(data.steps.map((s) => [s.key, s]));

  const websiteCheck = stepMap.get('verify-domain');
  const crawlStep = stepMap.get('crawl-website');
  const gscStep = stepMap.get('connect-gsc');
  const wpStep = stepMap.get('connect-wordpress');
  const gaStep = stepMap.get('build-keyword-url-mapping');

  const hasCrawl = crawlStep?.status === 'COMPLETED';

  return (
    <div className="space-y-6">
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
              <KpiCard label={t('activation.kpis.recommendations')} value={data.summary.recommendations} />
            </div>
            {canReport ? (
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => generateReport.mutate()} disabled={generateReport.isPending}>
                  {generateReport.isPending ? <Spinner /> : <Rocket />}
                  {data.summary.initialReportExists ? t('activation.regenerateInitial') : t('activation.generateInitial')}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('activation.stages')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CapabilityRow
            label={t('setupCap.website')}
            status={websiteCheck?.status === 'COMPLETED' ? 'ready' : 'needs_setup'}
            detail={websiteCheck?.message ?? t('setupCap.websiteDetail')}
            actionUrl={`/sites/${siteId}?tab=crawler`}
            actionLabel={t('setupCap.viewCrawler')}
          />
          <CapabilityRow
            label={t('setupCap.crawlAndAudit')}
            status={hasCrawl ? 'ready' : 'available'}
            detail={hasCrawl
              ? t('setupCap.crawlComplete', { count: data.summary.pagesCrawled })
              : t('setupCap.crawlDetail')
            }
            actionUrl={`/sites/${siteId}?tab=crawler`}
            actionLabel={hasCrawl ? t('setupCap.viewCrawl') : t('setupCap.runCrawl')}
            onRun={hasCrawl ? undefined : () => runStep.mutate('crawl-website')}
            isRunning={runStep.isPending}
          />
          <CapabilityRow
            label={t('setupCap.ai')}
            status={data.summary.recommendations > 0 ? 'ready' : 'needs_setup'}
            detail={t('setupCap.aiDetail')}
            actionUrl={`/sites/${siteId}?tab=settings`}
            actionLabel={t('setupCap.configureAi')}
          />
          <CapabilityRow
            label={t('setupCap.searchConsole')}
            status={gscStep?.status === 'COMPLETED' ? 'ready' : 'optional'}
            detail={t('setupCap.searchConsoleDetail')}
            actionUrl={`/sites/${siteId}?tab=settings`}
            actionLabel={gscStep?.status === 'COMPLETED' ? t('setupCap.viewSearchConsole') : t('setupCap.connectSearchConsole')}
          />
          <CapabilityRow
            label={t('setupCap.wordpress')}
            status={wpStep?.status === 'COMPLETED' ? 'ready' : 'optional'}
            detail={t('setupCap.wordpressDetail')}
            actionUrl={`/sites/${siteId}?tab=settings`}
            actionLabel={wpStep?.status === 'COMPLETED' ? t('setupCap.viewWordPress') : t('setupCap.connectWordPress')}
          />
          <CapabilityRow
            label={t('setupCap.googleAds')}
            status={gaStep?.status === 'COMPLETED' ? 'ready' : 'optional'}
            detail={t('setupCap.googleAdsDetail')}
            actionUrl={`/sites/${siteId}?tab=settings`}
            actionLabel={gaStep?.status === 'COMPLETED' ? t('setupCap.viewGoogleAds') : t('setupCap.connectGoogleAds')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CapabilityRow({
  label,
  status,
  detail,
  actionUrl,
  actionLabel,
  onRun,
  isRunning,
}: {
  label: string;
  status: 'ready' | 'available' | 'needs_setup' | 'optional';
  detail: string;
  actionUrl?: string;
  actionLabel?: string;
  onRun?: () => void;
  isRunning?: boolean;
}) {
  const statusColors = {
    ready: 'bg-emerald-100 text-emerald-700',
    available: 'bg-primary/10 text-primary',
    needs_setup: 'bg-amber-100 text-amber-700',
    optional: 'bg-muted text-muted-foreground',
  };

  const statusLabels = {
    ready: 'Ready',
    available: 'Available',
    needs_setup: 'Needs setup',
    optional: 'Optional',
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {status === 'ready' ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
        ) : status === 'available' ? (
          <Play className="size-5 shrink-0 text-primary" />
        ) : status === 'needs_setup' ? (
          <Settings className="size-5 shrink-0 text-amber-600" />
        ) : (
          <Settings className="size-5 shrink-0 text-muted-foreground" />
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{label}</span>
            <Badge variant="outline" className={statusColors[status]}>
              {statusLabels[status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="shrink-0">
        {onRun ? (
          <Button size="sm" onClick={onRun} disabled={isRunning}>
            {isRunning ? <Spinner /> : <Play />}
            {actionLabel}
          </Button>
        ) : actionUrl && actionLabel ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={actionUrl}>{actionLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatScore(score: number | null): string {
  return score === null || Number.isNaN(score) ? '—' : String(score);
}
