import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { LinkAnalysisDto, LinkAnalysisReportDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';

export function AuditTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const analysesQuery = useQuery({
    queryKey: ['link-analyses', siteId],
    queryFn: () => api.get<LinkAnalysisDto[]>(`/sites/${siteId}/links/analyses`),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post<LinkAnalysisReportDto>(`/sites/${siteId}/links/analyses`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['link-analyses'] }),
  });

  const canManage = hasPermission('links:manage');
  const analyses = analysesQuery.data ?? [];

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="flex items-center gap-2">
          <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
            <Play className="size-4" />
            {t('common.run')} audit
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('siteDetail.audit')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {analyses.length === 0 ? (
            <EmptyState message="No link analyses yet. Run an audit to detect orphans, weak targets, broken links and opportunities." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>Orphans</TableHead>
                  <TableHead>Weak</TableHead>
                  <TableHead>Broken</TableHead>
                  <TableHead>Opportunities</TableHead>
                  <TableHead>Overused</TableHead>
                  <TableHead>Conflicts</TableHead>
                  <TableHead>Suggestions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(analysis.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{analysis.stats.orphanPages}</TableCell>
                    <TableCell>{analysis.stats.weakTargets}</TableCell>
                    <TableCell>{analysis.stats.brokenLinks}</TableCell>
                    <TableCell>{analysis.stats.opportunities}</TableCell>
                    <TableCell>{analysis.stats.overusedAnchors}</TableCell>
                    <TableCell>{analysis.stats.conflictingLinks}</TableCell>
                    <TableCell>{analysis.suggestionsCreated}</TableCell>
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
