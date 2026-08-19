import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, CheckCircle2, RefreshCw } from 'lucide-react';
import type {
  Paginated,
  WordPressCheckResultDto,
  WordPressIntegrationSummaryDto,
  WordPressSyncResultDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<
  WordPressIntegrationSummaryDto['integration']['status'],
  'default' | 'secondary' | 'outline' | 'paused' | 'archived'
> = {
  CONNECTED: 'default',
  PENDING: 'secondary',
  FAILED: 'outline',
  DISCONNECTED: 'archived',
};

export function WordPressPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [lastResult, setLastResult] = useState<
    { siteId: string; result: WordPressCheckResultDto | WordPressSyncResultDto } | null
  >(null);

  const integrationsQuery = useQuery({
    queryKey: ['wordpress-integrations'],
    queryFn: () => api.get<Paginated<WordPressIntegrationSummaryDto>>('/wordpress/integrations?perPage=50'),
  });

  const checkMutation = useMutation({
    mutationFn: (siteId: string) =>
      api.post<WordPressCheckResultDto>(`/sites/${siteId}/wordpress/check`),
    onSuccess: (result) => {
      setLastResult({ siteId: result.integration.siteId, result });
      queryClient.invalidateQueries({ queryKey: ['wordpress-integrations'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (siteId: string) =>
      api.post<WordPressSyncResultDto>(`/sites/${siteId}/wordpress/sync`),
    onSuccess: (result) => {
      setLastResult({ siteId: result.siteId, result });
      queryClient.invalidateQueries({ queryKey: ['wordpress-integrations'] });
    },
  });

  const integrations = integrationsQuery.data?.data ?? [];
  const canManage = hasPermission('wordpress:manage');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('wordpress.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {integrationsQuery.data?.meta.total ?? 0} · {t('wordpress.subtitle')}
        </p>
      </div>

      {lastResult && <LastResultView lastResult={lastResult} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('wordpress.integrations')}</CardTitle>
          <CardDescription>{t('wordpress.integrationsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {integrationsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : integrations.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('wordpress.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('wordpress.site')}</TableHead>
                  <TableHead>{t('wordpress.status')}</TableHead>
                  <TableHead>{t('wordpress.rankMath')}</TableHead>
                  <TableHead>{t('wordpress.lastCheck')}</TableHead>
                  <TableHead>{t('wordpress.lastSync')}</TableHead>
                  <TableHead>{t('wordpress.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map(({ integration, site }) => (
                  <TableRow key={integration.id}>
                    <TableCell>
                      <div className="font-medium">{site.name}</div>
                      <div className="text-xs text-muted-foreground">{site.domain}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[integration.status]}>{integration.status}</Badge>
                      {integration.lastError && (
                        <div className="mt-1 max-w-[220px] truncate text-xs text-destructive" title={integration.lastError}>
                          {integration.lastError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {integration.rankMathDetected ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                          {integration.rankMathVersion ?? t('wordpress.detected')}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t('wordpress.notDetected')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {integration.lastCheckedAt ? formatDate(integration.lastCheckedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {integration.lastSyncSummary ? (
                        <span>
                          {t('wordpress.created')} {integration.lastSyncSummary.created} ·{' '}
                          {t('wordpress.updated')} {integration.lastSyncSummary.updated} ·{' '}
                          {t('wordpress.unchanged')} {integration.lastSyncSummary.unchanged}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canManage || checkMutation.isPending}
                          onClick={() => checkMutation.mutate(site.id)}
                        >
                          <RefreshCw className="size-3.5" />
                          {t('wordpress.check')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canManage || syncMutation.isPending}
                          onClick={() => syncMutation.mutate(site.id)}
                        >
                          {t('wordpress.sync')}
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/sites/${site.id}`}>
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LastResultView({
  lastResult,
}: {
  lastResult: { siteId: string; result: WordPressCheckResultDto | WordPressSyncResultDto };
}) {
  const { t } = useTranslation();
  if ('steps' in lastResult.result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('wordpress.checkResult')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {lastResult.result.steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2">
                <span
                  className={
                    step.status === 'ok'
                      ? 'text-emerald-500'
                      : step.status === 'failed'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }
                >
                  {step.status === 'ok' ? '✓' : step.status === 'failed' ? '✕' : '—'}
                </span>
                <span className="font-medium">{t(`wordpress.steps.${step.key}`)}</span>
                <span className="text-muted-foreground">{step.message}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('wordpress.syncResult')}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {t('wordpress.created')} {lastResult.result.created} · {t('wordpress.updated')} {lastResult.result.updated} ·{' '}
        {t('wordpress.unchanged')} {lastResult.result.unchanged} · {t('wordpress.failed')} {lastResult.result.failed} ·{' '}
        {t('wordpress.total')} {lastResult.result.total}
      </CardContent>
    </Card>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
