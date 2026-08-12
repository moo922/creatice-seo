import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, Plus } from 'lucide-react';
import type { ReportDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

const REPORT_TYPES = ['INITIAL', 'MONTHLY', 'EXECUTIVE', 'SEO', 'AEO', 'GEO', 'TECHNICAL', 'CONTENT', 'ISSUES', 'WORK_COMPLETED'];

export function ReportsTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState('MONTHLY');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [html, setHtml] = useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ['site-reports', siteId],
    queryFn: () => api.get<ReportDto[]>(`/sites/${siteId}/reporting/reports`),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post<ReportDto>(`/sites/${siteId}/reporting/reports`, { type, periodStart: periodStart || null, periodEnd: periodEnd || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-reports'] }),
  });

  const canManage = hasPermission('reports:manage');
  const reports = reportsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('reports.newReport')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="r-type">{t('reports.type')}</Label>
                <Select id="r-type" value={type} onChange={(e) => setType(e.target.value)}>
                  {REPORT_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-start">{t('reports.periodStart')}</Label>
                <Input id="r-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-end">{t('reports.periodEnd')}</Label>
                <Input id="r-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                <Plus className="size-4" />
                {t('reports.generate')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.title')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <EmptyState message="No reports yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.type')}</TableHead>
                  <TableHead>{t('reports.version')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-end">{t('reports.view')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.type}</TableCell>
                    <TableCell>v{report.version}</TableCell>
                    <TableCell>
                      <StatusBadge status={report.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void api.get<string>(`/sites/${siteId}/reporting/reports/${report.id}/html`).then(setHtml).catch(() => undefined);
                        }}
                      >
                        <Eye className="size-3.5" />
                        {t('reports.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {html ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHtml(null)}>
          <div className="h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-medium">{t('reports.title')}</span>
              <Button variant="ghost" size="sm" onClick={() => setHtml(null)}>
                Close
              </Button>
            </div>
            <iframe title="report" className="h-[calc(90vh-44px)] w-full" srcDoc={html} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
