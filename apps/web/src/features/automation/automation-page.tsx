import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { OrchestrationJobDto } from '@creative-seo/types';
import { ORCHESTRATION_WORKFLOWS } from '@creative-seo/types';
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
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

export function AutomationPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [showDispatch, setShowDispatch] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ['orchestration-jobs', { siteId }],
    queryFn: () => api.get<OrchestrationJobDto[]>(`/orchestration/jobs${siteId ? `?siteId=${siteId}` : ''}`),
  });

  const dispatchMutation = useMutation({
    mutationFn: (body: { siteId: string; workflow: string; idempotencyKey?: string; payload?: Record<string, unknown> }) =>
      api.post<OrchestrationJobDto>(`/sites/${body.siteId}/orchestration/jobs`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration-jobs'] });
      setShowDispatch(false);
    },
  });

  const jobs = jobsQuery.data ?? [];
  const canManage = hasPermission('orchestration:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('automation.title')}
        description={t('automation.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setShowDispatch((v) => !v)}>
              <Play className="size-4" />
              {t('automation.dispatch')}
            </Button>
          ) : undefined
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={setSiteId} />
      </div>

      {showDispatch && canManage && (
        <DispatchForm submitting={dispatchMutation.isPending} error={dispatchMutation.isError ? t('common.error') : null} onSubmit={(body) => dispatchMutation.mutate(body)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('automation.title')}</CardTitle>
          <CardDescription>{jobs.length}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {jobsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState message="No orchestration jobs yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('automation.workflow')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('automation.attempts')}</TableHead>
                  <TableHead>{t('automation.maxAttempts')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.workflow}</TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell>{job.attempts}</TableCell>
                    <TableCell>{job.maxAttempts}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-destructive" title={job.error ?? ''}>
                      {job.error ?? '—'}
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

function DispatchForm({ submitting, error, onSubmit }: { submitting: boolean; error: string | null; onSubmit: (body: { siteId: string; workflow: string; idempotencyKey?: string; payload?: Record<string, unknown> }) => void }) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState('');
  const [workflow, setWorkflow] = useState('gsc-sync');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [payload, setPayload] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('automation.runWorkflow')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siteId || !workflow) return;
            let parsed: Record<string, unknown> | undefined;
            if (payload.trim()) {
              try {
                parsed = JSON.parse(payload);
              } catch {
                return;
              }
            }
            onSubmit({ siteId, workflow, idempotencyKey: idempotencyKey || undefined, payload: parsed });
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('sites.title')}</Label>
            <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wf">{t('automation.selectWorkflow')}</Label>
            <Select id="wf" value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
              {ORCHESTRATION_WORKFLOWS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idem">{t('automation.idempotencyKey')}</Label>
            <Input id="idem" value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payload">{t('automation.payload')}</Label>
            <Input id="payload" value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="{}" />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={submitting || !siteId} className="sm:col-span-2">
            {t('automation.dispatch')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
