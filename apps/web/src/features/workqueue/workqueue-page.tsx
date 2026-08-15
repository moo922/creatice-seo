import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  WorkBulkActionDto,
  WorkFilterCriteriaDto,
  WorkFilterDto,
  WorkItemDto,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
  WorkQueueResponseDto,
  WorkQueueSummaryDto,
} from '@creative-seo/types';
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES, WORK_ITEM_TYPES } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

const PER_PAGE = 25;

const TYPE_LABELS: Record<string, string> = {
  critical_issue: 'Critical issue',
  recommendation: 'Recommendation',
  overdue_task: 'Overdue task',
  content_approval: 'Content approval',
  pending_review: 'Pending review',
  failed_job: 'Failed job',
  report_due: 'Report due',
  visibility_loss: 'Visibility loss',
  integration_problem: 'Integration problem',
};

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: 'border-destructive/50 bg-destructive/10 text-destructive',
  HIGH: 'border-orange-500/50 bg-orange-500/10 text-orange-600',
  MEDIUM: 'border-amber-500/50 bg-amber-500/10 text-amber-600',
  LOW: 'border-muted bg-muted text-muted-foreground',
};

export function WorkQueuePage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<WorkFilterCriteriaDto>({});
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingFilter, setSavingFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');

  const canManage = hasPermission('workqueue:manage');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.types?.length) params.set('types', filters.types.join(','));
    if (filters.statuses?.length) params.set('statuses', filters.statuses.join(','));
    if (filters.priorities?.length) params.set('priorities', filters.priorities.join(','));
    if (filters.sources?.length) params.set('sources', filters.sources.join(','));
    if (filters.sites?.length) params.set('sites', filters.sites.join(','));
    if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
    if (filters.overdue) params.set('overdue', 'true');
    if (filters.search) params.set('search', filters.search);
    params.set('page', String(page));
    params.set('perPage', String(PER_PAGE));
    return params.toString();
  }, [filters, page]);

  const workQuery = useQuery({
    queryKey: ['workqueue', queryString],
    queryFn: () => api.get<WorkQueueResponseDto>(`/work?${queryString}`),
  });

  const filtersQuery = useQuery({
    queryKey: ['workqueue-filters'],
    queryFn: () => api.get<WorkFilterDto[]>('/work/filters'),
  });

  const bulkMutation = useMutation({
    mutationFn: (body: WorkBulkActionDto) => api.post<{ applied: number; skipped: string[] }>('/work/bulk', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workqueue'] });
      setSelected(new Set());
      setShowTaskForm(false);
    },
  });

  const saveFilterMutation = useMutation({
    mutationFn: (body: { name: string; criteria: WorkFilterCriteriaDto }) => api.post<WorkFilterDto>('/work/filters', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workqueue-filters'] });
      setSavingFilter(false);
      setNewFilterName('');
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/work/filters/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workqueue-filters'] }),
  });

  const summary = workQuery.data?.summary;
  const items = workQuery.data?.items ?? [];
  const pagination = workQuery.data?.pagination;

  const applyFilters = (criteria: WorkFilterCriteriaDto, filterId: string | null = null) => {
    setFilters(criteria);
    setActiveFilterId(filterId);
    setPage(1);
    setSelected(new Set());
  };

  const clearFilters = () => {
    setFilters({});
    setActiveFilterId(null);
    setPage(1);
    setSelected(new Set());
  };

  const toggleSelect = (itemKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(item.itemKey));
  const togglePageSelection = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        items.forEach((item) => next.delete(item.itemKey));
      } else {
        items.forEach((item) => next.add(item.itemKey));
      }
      return next;
    });
  };

  const runBulk = (body: Omit<WorkBulkActionDto, 'itemKeys'>) => {
    if (selected.size === 0) return;
    bulkMutation.mutate({ ...body, itemKeys: [...selected] });
  };

  const summaryCards: Array<{ key: keyof WorkQueueSummaryDto; label: string; criteria: WorkFilterCriteriaDto }> = [
    { key: 'myWork', label: t('work.myWork'), criteria: { assignedTo: 'me' } },
    { key: 'critical', label: t('work.critical'), criteria: { types: ['critical_issue'], priorities: ['CRITICAL'] } },
    { key: 'contentApprovals', label: t('work.contentApprovals'), criteria: { types: ['content_approval'] } },
    { key: 'pendingReviews', label: t('work.pendingReviews'), criteria: { types: ['pending_review'] } },
    { key: 'reportsDue', label: t('work.reportsDue'), criteria: { types: ['report_due'] } },
    { key: 'failedJobs', label: t('work.failedJobs'), criteria: { types: ['failed_job'] } },
    { key: 'visibilityLoss', label: t('work.visibilityLoss'), criteria: { types: ['visibility_loss'] } },
    { key: 'integrationProblems', label: t('work.integrationProblems'), criteria: { types: ['integration_problem'] } },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('work.title')} description={t('work.subtitle')} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {summaryCards.map((card) => {
          const active = JSON.stringify(filters) === JSON.stringify(card.criteria);
          return (
            <button key={card.key} type="button" onClick={() => applyFilters(active ? {} : card.criteria)} className="text-start">
              <Card className={cn('h-full transition-colors', active && 'border-primary ring-1 ring-primary')}>
                <CardContent className="pt-4">
                  <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">{card.label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{summary?.[card.key] ?? '—'}</div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t('work.savedFilters')}</CardTitle>
            <CardDescription>{filtersQuery.data?.length ?? 0}</CardDescription>
          </div>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setSavingFilter((value) => !value)}>
              {t('work.saveCurrent')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {filtersQuery.data?.map((filter) => {
            const isActive = activeFilterId === filter.id;
            return (
              <Badge
                key={filter.id}
                variant={isActive ? 'default' : 'outline'}
                className={cn('cursor-pointer gap-2 py-1 pe-1 ps-3', !isActive && 'hover:bg-accent')}
              >
                <button type="button" onClick={() => applyFilters(filter.criteria, filter.id)}>
                  {filter.name}
                </button>
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`${t('work.deleteFilter')} ${filter.name}`}
                    className="rounded-sm px-1 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteFilterMutation.mutate(filter.id)}
                  >
                    ×
                  </button>
                ) : null}
              </Badge>
            );
          })}
          {savingFilter && canManage ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newFilterName.trim()) return;
                saveFilterMutation.mutate({ name: newFilterName.trim(), criteria: filters });
              }}
            >
              <Input
                value={newFilterName}
                onChange={(event) => setNewFilterName(event.target.value)}
                placeholder={t('work.filterName')}
                className="w-48"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={!newFilterName.trim()}>
                {t('work.saveFilter')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSavingFilter(false)}>
                {t('common.cancel')}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <SiteSelector
            value={filters.sites?.[0]}
            onChange={(siteId) => applyFilters({ ...filters, sites: siteId ? [siteId] : undefined })}
          />
          <FilterSelect
            label={t('work.allTypes')}
            value={filters.types?.[0] ?? ''}
            onChange={(value) => applyFilters({ ...filters, types: value ? [value as WorkItemType] : undefined })}
            options={WORK_ITEM_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] ?? type }))}
          />
          <FilterSelect
            label={t('work.allStatuses')}
            value={filters.statuses?.[0] ?? ''}
            onChange={(value) => applyFilters({ ...filters, statuses: value ? [value as WorkItemStatus] : undefined })}
            options={WORK_ITEM_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <FilterSelect
            label={t('work.allPriorities')}
            value={filters.priorities?.[0] ?? ''}
            onChange={(value) => applyFilters({ ...filters, priorities: value ? [value as WorkItemPriority] : undefined })}
            options={WORK_ITEM_PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
          />
          <FilterSelect
            label={t('work.assignee')}
            value={filters.assignedTo ?? ''}
            onChange={(value) =>
              applyFilters({ ...filters, assignedTo: value === '' ? undefined : (value as 'me' | 'unassigned') })
            }
            options={[
              { value: 'me', label: t('work.assignedToMe') },
              { value: 'unassigned', label: t('work.unassigned') },
            ]}
          />
          <div className="flex items-end gap-3 lg:col-span-3">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(filters.overdue)}
                onChange={(event) => applyFilters({ ...filters, overdue: event.target.checked || undefined })}
                className="size-4 rounded border-input"
              />
              {t('work.overdueOnly')}
            </label>
            <Input
              value={filters.search ?? ''}
              onChange={(event) => applyFilters({ ...filters, search: event.target.value || undefined })}
              placeholder={t('work.searchPlaceholder')}
              className="flex-1"
            />
            <Button variant="ghost" onClick={clearFilters}>
              {t('work.clearFilters')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {canManage && selected.size > 0 ? (
        <BulkActionBar
          count={selected.size}
          busy={bulkMutation.isPending}
          showTaskForm={showTaskForm}
          taskTitle={taskTitle}
          taskDeadline={taskDeadline}
          onTaskTitleChange={setTaskTitle}
          onTaskDeadlineChange={setTaskDeadline}
          onToggleTaskForm={() => {
            setShowTaskForm((value) => !value);
            setTaskTitle('');
            setTaskDeadline('');
          }}
          onAssignToMe={() => runBulk({ action: 'assign', assignedToUserId: user?.id ?? null })}
          onUnassign={() => runBulk({ action: 'assign', assignedToUserId: null })}
          onPriority={(priority) => runBulk({ action: 'change_priority', priority: priority as WorkItemPriority })}
          onMarkReviewed={() => runBulk({ action: 'mark_reviewed' })}
          onIgnore={() => runBulk({ action: 'ignore' })}
          onCreateTasks={() =>
            runBulk({
              action: 'create_tasks',
              taskTitle: taskTitle.trim() || undefined,
              taskDeadline: taskDeadline || null,
            })
          }
        />
      ) : null}

      <Card>
        <CardContent className="p-0">
          {workQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState message={t('work.noItems')} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label={t('work.selectAll')}
                        checked={allOnPageSelected}
                        onChange={togglePageSelection}
                        className="size-4 rounded border-input"
                      />
                    </TableHead>
                    <TableHead>{t('work.item')}</TableHead>
                    <TableHead>{t('work.site')}</TableHead>
                    <TableHead>{t('common.type')}</TableHead>
                    <TableHead>{t('work.allPriorities')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('work.assignee')}</TableHead>
                    <TableHead>{t('work.due')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <WorkItemRow
                      key={item.itemKey}
                      item={item}
                      checked={selected.has(item.itemKey)}
                      onToggle={() => toggleSelect(item.itemKey)}
                    />
                  ))}
                </TableBody>
              </Table>
              {pagination && pagination.totalPages > 1 ? (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                  <span>
                    {pagination.page} {t('work.pageOf')} {pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                      ←
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      →
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function WorkItemRow({
  item,
  checked,
  onToggle,
}: {
  item: WorkItemDto;
  checked: boolean;
  onToggle: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('workqueue:manage');
  return (
    <TableRow>
      <TableCell>
        {canManage ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="size-4 rounded border-input"
          />
        ) : null}
      </TableCell>
      <TableCell className="max-w-sm">
        <a href={item.url} className="block">
          <div className="font-medium hover:underline">{item.reason}</div>
          <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
        </a>
      </TableCell>
      <TableCell>
        {item.site ? (
          <a href={`/sites/${item.site.siteId}`} className="text-sm text-muted-foreground hover:underline">
            {item.site.name}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{TYPE_LABELS[item.type] ?? item.type}</Badge>
      </TableCell>
      <TableCell>
        <Badge className={PRIORITY_TONE[item.priority] ?? ''}>{item.priority}</Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.assignedTo ? item.assignedTo.fullName : '—'}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '—'}
      </TableCell>
    </TableRow>
  );
}

function BulkActionBar({
  count,
  busy,
  showTaskForm,
  taskTitle,
  taskDeadline,
  onTaskTitleChange,
  onTaskDeadlineChange,
  onToggleTaskForm,
  onAssignToMe,
  onUnassign,
  onPriority,
  onMarkReviewed,
  onIgnore,
  onCreateTasks,
}: {
  count: number;
  busy: boolean;
  showTaskForm: boolean;
  taskTitle: string;
  taskDeadline: string;
  onTaskTitleChange: (value: string) => void;
  onTaskDeadlineChange: (value: string) => void;
  onToggleTaskForm: () => void;
  onAssignToMe: () => void;
  onUnassign: () => void;
  onPriority: (priority: string) => void;
  onMarkReviewed: () => void;
  onIgnore: () => void;
  onCreateTasks: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="sticky top-20 z-20">
      <CardContent className="flex flex-wrap items-center gap-2 pt-5">
        <span className="me-2 text-sm font-medium">
          {count} {t('work.selected')}
        </span>
        <Button variant="outline" size="sm" onClick={onAssignToMe} disabled={busy}>
          {t('work.assignToMe')}
        </Button>
        <Button variant="outline" size="sm" onClick={onUnassign} disabled={busy}>
          {t('work.unassign')}
        </Button>
        <Select className="w-36" value="" onChange={(event) => event.target.value && onPriority(event.target.value)}>
          <option value="">{t('work.allPriorities')}</option>
          {WORK_ITEM_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={onMarkReviewed} disabled={busy}>
          {t('work.markReviewed')}
        </Button>
        <Button variant="outline" size="sm" onClick={onIgnore} disabled={busy}>
          {t('work.ignore')}
        </Button>
        <Button variant="outline" size="sm" onClick={onToggleTaskForm} disabled={busy}>
          {t('work.createTasks')}
        </Button>
        {showTaskForm ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3">
            <Input value={taskTitle} onChange={(event) => onTaskTitleChange(event.target.value)} placeholder={t('work.taskTitle')} className="w-64" />
            <Input type="date" value={taskDeadline} onChange={(event) => onTaskDeadlineChange(event.target.value)} placeholder={t('work.taskDeadline')} className="w-44" />
            <Button size="sm" onClick={onCreateTasks} disabled={busy}>
              {t('work.createTasksConfirm')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
