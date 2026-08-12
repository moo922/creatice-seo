import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { VisibilityPromptSetDto, VisibilityRunDto, VisibilityTrendsDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import { SiteSelector } from '@/components/shared/site-selector';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

const METRIC_KEYS = ['brandMentionRate', 'citationRate', 'sourceCoverage', 'competitorInclusion'];

interface VisibilityObservation {
  id: string;
  category: string;
  prompt: string;
  response: string;
  brandMentioned: boolean;
  websiteCited: boolean;
  confidence: number;
}

export function VisibilityPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState('');
  const [selectedRun, setSelectedRun] = useState<string | undefined>(undefined);

  const promptSetQuery = useQuery({
    queryKey: ['visibility-prompt-set', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<VisibilityPromptSetDto>(`/sites/${siteId}/visibility/prompt-set`),
  });

  const runsQuery = useQuery({
    queryKey: ['visibility-runs', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<VisibilityRunDto[]>(`/sites/${siteId}/visibility/runs`),
  });

  const trendsQuery = useQuery({
    queryKey: ['visibility-trends', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<VisibilityTrendsDto>(`/sites/${siteId}/visibility/trends`),
  });

  const observationsQuery = useQuery({
    queryKey: ['visibility-observations', siteId, selectedRun],
    enabled: Boolean(siteId && selectedRun),
    queryFn: () => api.get<VisibilityObservation[]>(`/sites/${siteId}/visibility/runs/${selectedRun}/observations`),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post<VisibilityRunDto>(`/sites/${siteId}/visibility/runs`, {}),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['visibility-runs'] });
      queryClient.invalidateQueries({ queryKey: ['visibility-trends'] });
      setSelectedRun(run.id);
    },
  });

  const savePromptSetMutation = useMutation({
    mutationFn: (prompts: VisibilityPromptSetDto['prompts']) => api.put<VisibilityPromptSetDto>(`/sites/${siteId}/visibility/prompt-set`, { prompts }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visibility-prompt-set'] }),
  });

  const runs = runsQuery.data ?? [];
  const canManage = hasPermission('visibility:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('visibility.title')}
        description={t('visibility.subtitle')}
        actions={
          canManage && siteId ? (
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
              <Play className="size-4" />
              {t('visibility.run')}
            </Button>
          ) : undefined
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
      </div>

      {!siteId ? (
        <EmptyState message="Select a site." />
      ) : (
        <>
          {promptSetQuery.data ? (
            <PromptSetEditor
              prompts={promptSetQuery.data.prompts}
              onSave={savePromptSetMutation.mutate}
              canManage={Boolean(canManage)}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('visibility.runs')}</CardTitle>
              <CardDescription>{t('visibility.controlledLabel')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {runsQuery.isLoading ? (
                <Skeleton className="m-4 h-24" />
              ) : runs.length === 0 ? (
                <EmptyState message="No observation runs yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('visibility.category')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('visibility.provider')}</TableHead>
                      <TableHead>{t('visibility.model')}</TableHead>
                      <TableHead>{t('visibility.metrics')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow
                        key={run.id}
                        className={selectedRun === run.id ? 'bg-muted/40' : ''}
                        onClick={() => setSelectedRun(run.id === selectedRun ? undefined : run.id)}
                      >
                        <TableCell className="font-medium">Run</TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{run.provider ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{run.model ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{run.observationsCount} obs</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{run.observedAt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {runs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('visibility.metrics')}</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricSummary run={runs[0]} />
              </CardContent>
            </Card>
          ) : null}

          {trendsQuery.data?.latestVsPrevious ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('visibility.trends')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('visibility.metrics')}</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead>Delta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendsQuery.data.latestVsPrevious.deltas.map((delta) => (
                      <TableRow key={delta.key}>
                        <TableCell>{delta.label}</TableCell>
                        <TableCell>{pct(delta.previous)}</TableCell>
                        <TableCell>{pct(delta.latest)}</TableCell>
                        <TableCell className={delta.delta !== null && delta.delta > 0 ? 'text-emerald-600' : delta.delta !== null && delta.delta < 0 ? 'text-destructive' : ''}>
                          {delta.delta === null ? '—' : `${delta.delta > 0 ? '+' : ''}${pct(delta.delta)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {selectedRun && observationsQuery.data ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('visibility.observations')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {observationsQuery.data.map((obs) => (
                  <div key={obs.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{obs.category}</span>
                      <span>brand: {obs.brandMentioned ? 'yes' : 'no'}</span>
                      <span>cited: {obs.websiteCited ? 'yes' : 'no'}</span>
                      <span>{t('visibility.confidence')}: {obs.confidence}</span>
                    </div>
                    <p className="mt-1 text-sm">{obs.prompt}</p>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{obs.response || '—'}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function MetricSummary({ run }: { run: VisibilityRunDto }) {
  const { t } = useTranslation();
  if (!run.metrics) return <EmptyState message="No metrics yet." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {METRIC_KEYS.map((key) => (
        <div key={key} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{t(`visibility.${key}`)}</div>
          <div className="text-xl font-semibold">{pct(run.metrics![key as keyof typeof run.metrics] as number)}</div>
        </div>
      ))}
      <div className="rounded-md border p-3">
        <div className="text-xs text-muted-foreground">{t('visibility.shareOfVoice')}</div>
        <div className="text-xl font-semibold">{pct(run.metrics.shareOfVoice.brand)}</div>
      </div>
    </div>
  );
}

function PromptSetEditor({ prompts, onSave, canManage }: { prompts: VisibilityPromptSetDto['prompts']; onSave: (prompts: VisibilityPromptSetDto['prompts']) => void; canManage: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(prompts);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('visibility.promptSet')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.category} className="grid gap-2 sm:grid-cols-[140px_1fr]">
            <div className="text-sm font-medium pt-2">{item.category}</div>
            <Input
              value={items[index]?.prompt ?? ''}
              disabled={!canManage}
              onChange={(e) => setItems((prev) => prev.map((entry, i) => (i === index ? { ...entry, prompt: e.target.value } : entry)))}
            />
          </div>
        ))}
        {canManage ? (
          <Button onClick={() => onSave(items)}>
            {t('common.save')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}
