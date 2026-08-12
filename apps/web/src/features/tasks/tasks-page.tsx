import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { TaskDto } from '@creative-seo/types';
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

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

export function TasksPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['tasks', { siteId }],
    queryFn: () => api.get<TaskDto[]>(`/operations/tasks${siteId ? `?siteId=${siteId}` : ''}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: { siteId: string; title: string; url?: string; internalNotes?: string; clientNotes?: string }) =>
      api.post<TaskDto>(`/sites/${body.siteId}/operations/tasks`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, siteId: s }: { id: string; status: string; siteId: string }) =>
      api.put<TaskDto>(`/sites/${s}/operations/tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const tasks = tasksQuery.data ?? [];
  const canManage = hasPermission('operations:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tasks.title')}
        description={t('tasks.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="size-4" />
              {t('tasks.newTask')}
            </Button>
          ) : undefined
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={setSiteId} />
      </div>

      {showCreate && canManage && (
        <CreateTaskForm submitting={createMutation.isPending} error={createMutation.isError ? t('common.error') : null} onSubmit={(body) => createMutation.mutate(body)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('tasks.title')}</CardTitle>
          <CardDescription>{tasks.length}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {tasksQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState message="No tasks yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tasks.title')}</TableHead>
                  <TableHead>{t('tasks.assignee')}</TableHead>
                  <TableHead>{t('tasks.deadline')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  {canManage ? <TableHead className="text-end">{t('common.status')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.title}</div>
                      {task.url ? <div className="text-xs text-muted-foreground">{task.url}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{task.assigneeId ? shortId(task.assigneeId) : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-end">
                        <Select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) updateMutation.mutate({ id: task.id, status: e.target.value, siteId: task.siteId });
                          }}
                          className="w-32"
                        >
                          <option value="">{t('common.status')}</option>
                          {TASK_STATUSES.filter((item) => item !== task.status).map((item) => (
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

function CreateTaskForm({ submitting, error, onSubmit }: { submitting: boolean; error: string | null; onSubmit: (body: { siteId: string; title: string; url?: string; internalNotes?: string; clientNotes?: string }) => void }) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tasks.createTitle')}</CardTitle>
        <CardDescription>{t('tasks.createDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siteId || !title) return;
            onSubmit({ siteId, title, url: url || undefined, internalNotes: internalNotes || undefined, clientNotes: clientNotes || undefined });
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('sites.title')}</Label>
            <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">{t('tasks.title')}</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-url">URL</Label>
            <Input id="task-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-internal">{t('tasks.internalNotes')}</Label>
            <Input id="task-internal" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="task-client">{t('tasks.clientNotes')}</Label>
            <Input id="task-client" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={submitting || !siteId || !title} className="sm:col-span-2">
            {t('tasks.newTask')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
