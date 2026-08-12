import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, Eye, Plus } from 'lucide-react';
import type { ReportDto } from '@creative-seo/types';
import { api, getAccessToken } from '@/lib/api';
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

const REPORT_TYPES = ['INITIAL', 'MONTHLY', 'EXECUTIVE', 'SEO', 'AEO', 'GEO', 'TECHNICAL', 'CONTENT', 'ISSUES', 'WORK_COMPLETED'];

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export function ReportsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; siteId: string; html: string } | null>(null);

  const reportsQuery = useQuery({
    queryKey: ['reports', { siteId }],
    queryFn: () => api.get<ReportDto[]>(`/reports${siteId ? `?siteId=${siteId}` : ''}`),
  });

  const generateMutation = useMutation({
    mutationFn: (body: { siteId: string; type: string; periodStart?: string; periodEnd?: string }) =>
      api.post<ReportDto>(`/sites/${body.siteId}/reporting/reports`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setShowGenerate(false);
    },
  });

  const reports = reportsQuery.data ?? [];
  const canManage = hasPermission('reports:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        description={t('reports.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setShowGenerate((v) => !v)}>
              <Plus className="size-4" />
              {t('reports.newReport')}
            </Button>
          ) : undefined
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={setSiteId} />
      </div>

      {showGenerate && canManage && (
        <GenerateForm submitting={generateMutation.isPending} error={generateMutation.isError ? t('common.error') : null} onSubmit={(body) => generateMutation.mutate(body)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.title')}</CardTitle>
          <CardDescription>{reports.length}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {reportsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : reports.length === 0 ? (
            <EmptyState message="No reports yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.type')}</TableHead>
                  <TableHead>{t('reports.version')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('reports.period')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {report.periodStart ?? report.periodEnd ? `${report.periodStart ?? '…'} → ${report.periodEnd ?? '…'}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void viewReport(report)}>
                          <Eye className="size-3.5" />
                          {t('reports.view')}
                        </Button>
                        {report.pdfPath ? (
                          <Button variant="ghost" size="sm" onClick={() => downloadPdf(report)}>
                            <Download className="size-3.5" />
                            {t('reports.pdf')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {viewing ? <ReportViewer report={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );

  async function viewReport(report: ReportDto): Promise<void> {
    try {
      const html = await api.get<string>(`/sites/${report.siteId}/reporting/reports/${report.id}/html`);
      setViewing({ id: report.id, siteId: report.siteId, html });
    } catch {
      // ignore
    }
  }
}

function GenerateForm({ submitting, error, onSubmit }: { submitting: boolean; error: string | null; onSubmit: (body: { siteId: string; type: string; periodStart?: string; periodEnd?: string }) => void }) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState('MONTHLY');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reports.newReport')}</CardTitle>
        <CardDescription>{t('reports.period')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siteId) return;
            onSubmit({ siteId, type, periodStart: periodStart || undefined, periodEnd: periodEnd || undefined });
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('sites.title')}</Label>
            <SiteSelector value={siteId} onChange={(v) => setSiteId(v ?? '')} allowAll={false} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-type">{t('reports.type')}</Label>
            <Select id="report-type" value={type} onChange={(e) => setType(e.target.value)}>
              {REPORT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`reports.${item.toLowerCase() === 'work_completed' ? 'workCompleted' : item.toLowerCase()}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-start">{t('reports.periodStart')}</Label>
            <Input id="report-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-end">{t('reports.periodEnd')}</Label>
            <Input id="report-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={submitting || !siteId} className="sm:col-span-2">
            {t('reports.generate')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReportViewer({ report, onClose }: { report: { id: string; html: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">Report</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <iframe title="report" className="h-[calc(90vh-44px)] w-full" srcDoc={report.html} />
      </div>
    </div>
  );
}

function downloadPdf(report: ReportDto): void {
  const token = getAccessToken();
  void fetch(`${API_BASE}/sites/${report.siteId}/reporting/reports/${report.id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((response) => {
      if (!response.ok) throw new Error('pdf failed');
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report.type}-v${report.version}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => undefined);
}
