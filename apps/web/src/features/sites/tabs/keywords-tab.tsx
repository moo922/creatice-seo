import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Play, Plus } from 'lucide-react';
import type { ClusterDto, KeywordPipelineResultDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

export function KeywordsTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [pipelineKeywords, setPipelineKeywords] = useState('seo services, keyword research');
  const [discoverFromGsc, setDiscoverFromGsc] = useState(false);

  const clustersQuery = useQuery({
    queryKey: ['clusters', siteId],
    queryFn: () => api.get<ClusterDto[]>(`/sites/${siteId}/keywords/clusters`),
  });

  const seedMutation = useMutation({
    mutationFn: (kw: string) => api.post<{ id: string }>(`/sites/${siteId}/keywords/seed`, { keyword: kw }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
      setKeyword('');
    },
  });

  const pipelineMutation = useMutation({
    mutationFn: () =>
      api.post<KeywordPipelineResultDto>(`/sites/${siteId}/keywords/pipeline`, {
        keywords: pipelineKeywords.split(',').map((item) => item.trim()).filter(Boolean),
        discoverFromGsc,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (clusterId: string) => api.post<ClusterDto>(`/sites/${siteId}/keywords/clusters/${clusterId}/approve`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clusters'] }),
  });

  const canManage = hasPermission('keywords:manage');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Keyword pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="kw-seed">Seed a keyword</Label>
              <div className="flex gap-2">
                <Input id="kw-seed" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. seo services" />
                <Button variant="outline" onClick={() => seedMutation.mutate(keyword)} disabled={!keyword || seedMutation.isPending}>
                  <Plus className="size-4" />
                  Seed
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="kw-pipeline">Run pipeline (discover → cluster → map)</Label>
            <Input id="kw-pipeline" value={pipelineKeywords} onChange={(e) => setPipelineKeywords(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={discoverFromGsc} onChange={(e) => setDiscoverFromGsc(e.target.checked)} />
              Discover from GSC queries
            </label>
            <Button onClick={() => pipelineMutation.mutate()} disabled={!canManage || pipelineMutation.isPending}>
              <Play className="size-4" />
              {t('common.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clusters</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(clustersQuery.data ?? []).length === 0 ? (
            <EmptyState message="No clusters yet. Run the pipeline." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Primary keyword</TableHead>
                  <TableHead>{t('issues.status')}</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(clustersQuery.data ?? []).map((cluster) => (
                  <TableRow key={cluster.id}>
                    <TableCell className="font-medium">{cluster.name}</TableCell>
                    <TableCell className="text-muted-foreground">{cluster.primaryKeyword}</TableCell>
                    <TableCell>
                      <StatusBadge status={cluster.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cluster.targetUrl ?? '—'}</TableCell>
                    <TableCell className="text-end">
                      {canManage && cluster.status !== 'APPROVED' ? (
                        <Button variant="outline" size="sm" onClick={() => approveMutation.mutate(cluster.id)}>
                          <Check className="size-3.5" />
                          {t('common.approve')}
                        </Button>
                      ) : null}
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
