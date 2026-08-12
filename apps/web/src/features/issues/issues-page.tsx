import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { IssueDto } from '@creative-seo/types';
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

const ISSUE_STATUSES = ['DETECTED', 'REVIEWED', 'APPROVED', 'IN_PROGRESS', 'FIXED', 'VERIFYING', 'RESOLVED', 'IGNORED'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const KINDS = ['TRAFFIC_DROP', 'CTR_DROP', 'POSITION_DECLINE', 'CRITICAL_TECHNICAL', 'GSC_FAILURE', 'WORDPRESS_FAILURE', 'CONTENT_DECAY', 'CANNIBALIZATION', 'ON_PAGE', 'ORCHESTRATION', 'MANUAL'];

export function IssuesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const issuesQuery = useQuery({
    queryKey: ['issues', { siteId, status }],
    queryFn: () => api.get<IssueDto[]>(`/operations/issues${qs({ siteId, status })}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: { siteId: string; kind: string; severity: string; title: string; description?: string }) =>
      api.post<IssueDto>(`/sites/${body.siteId}/operations/issues`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      setShowCreate(false);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, status: next, siteId: s }: { id: string; status: string; siteId: string }) =>
      api.put<IssueDto>(`/sites/${s}/operations/issues/${id}`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues'] }),
  });

  const issues = issuesQuery.data ?? [];
  const canManage = hasPermission('operations:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('issues.title')}
        description={t('issues.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="size-4" />
              {t('issues.newIssue')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64">
          <SiteSelector value={siteId} onChange={setSiteId} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-status">{t('issues.status')}</Label>
          <Select id="issue-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.allSites')}</option>
            {ISSUE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showCreate && canManage && (
        <CreateIssueForm submitting={createMutation.isPending} error={createMutation.isError ? t('common.error') : null} onSubmit={(body) => createMutation.mutate(body)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('issues.title')}</CardTitle>
          <CardDescription>{issues.length} · {t('issues.open')}: {issues.filter((i) => !['RESOLVED', 'IGNORED'].includes(i.status)).length}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {issuesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : issues.length === 0 ? (
            <EmptyState message={t('issues.title')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('issues.titleField')}</TableHead>
                  <TableHead>{t('issues.kind')}</TableHead>
                  <TableHead>{t('issues.severity')}</TableHead>
                  <TableHead>{t('issues.status')}</TableHead>
                  <TableHead>{t('issues.detected')}</TableHead>
                  {canManage ? <TableHead className="text-end">{t('issues.transition')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.title}</TableCell>
                    <TableCell className="text-muted-foreground">{issue.kind}</TableCell>
                    <TableCell>
                      <StatusBadge status={issue.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={issue.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(issue.detectedAt).toLocaleDateString()}</TableCell>
                    {canManage ? (
                      <TableCell className="text-end">
                        <Select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              transitionMutation.mutate({ id: issue.id, status: e.target.value, siteId: issue.siteId });
                            }
                          }}
                          className="w-36"
                        >
                          <option value="">{t('issues.transition')}</option>
                          {ISSUE_STATUSES.filter((item) => item !== issue.status).map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                    ) : null}
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

function CreateIssueForm({ submitting, error, onSubmit }: { submitting: boolean; error: string | null; onSubmit: (body: { siteId: string; kind: string; severity: string; title: string; description?: string }) => void }) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState('');
  const [kind, setKind] = useState('MANUAL');
  const [severity, setSeverity] = useState('HIGH');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('issues.createTitle')}</CardTitle>
        <CardDescription>{t('issues.createDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siteId || !title) return;
            onSubmit({ siteId, kind, severity, title, description: description || undefined });
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('sites.title')}</Label>
            <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-kind">{t('issues.kind')}</Label>
            <Select id="issue-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-severity">{t('issues.severity')}</Label>
            <Select id="issue-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-title">{t('issues.titleField')}</Label>
            <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="issue-description">{t('issues.description')}</Label>
            <Input id="issue-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={submitting || !siteId || !title} className="sm:col-span-2">
            {t('issues.newIssue')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function qs(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const result = query.toString();
  return result ? `?${result}` : '';
}
