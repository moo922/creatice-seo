import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, CheckCircle2, Play, Plus, RefreshCw } from 'lucide-react';
import type {
  CannibalizationCaseDto,
  ClusterDto,
  GoogleAdsIntegrationDto,
  KeywordDto,
  KeywordExplorerSummaryDto,
  KeywordOpportunityDto,
  KeywordPipelineResultDto,
  UrlMappingDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

/**
 * Keyword Explorer (Sections 68-73): summary, keyword table, clusters, URL map,
 * cannibalization, opportunities and Google Ads integration.
 */
export function KeywordsTab({ siteId }: { siteId: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('keywords:manage');

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="keywords">Keywords</TabsTrigger>
        <TabsTrigger value="clusters">Clusters</TabsTrigger>
        <TabsTrigger value="url-map">URL Map</TabsTrigger>
        <TabsTrigger value="cannibalization">Cannibalization</TabsTrigger>
        <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
        <TabsTrigger value="google-ads">Google Ads</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="keywords">
        <KeywordsTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="clusters">
        <ClustersTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="url-map">
        <UrlMapTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="cannibalization">
        <CannibalizationTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="opportunities">
        <OpportunitiesTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
      <TabsContent value="google-ads">
        <GoogleAdsTabSection siteId={siteId} canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}

function OverviewTab({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [seeds, setSeeds] = useState('');
  const [discoverFromGsc, setDiscoverFromGsc] = useState(false);
  const [discoverFromSite, setDiscoverFromSite] = useState(false);

  const summary = useQuery({
    queryKey: ['keyword-summary', siteId],
    queryFn: () => api.get<KeywordExplorerSummaryDto>(`/sites/${siteId}/keywords/explorer/summary`),
  });

  const discoveryMutation = useMutation({
    mutationFn: () =>
      api.post(`/sites/${siteId}/keywords/discovery`, {
        keywords: seeds.split(',').map((s) => s.trim()).filter(Boolean),
        discoverFromGsc,
        discoverFromSite,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyword-summary'] });
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
      setSeeds('');
    },
  });

  const pipelineMutation = useMutation({
    mutationFn: () =>
      api.post<KeywordPipelineResultDto>(`/sites/${siteId}/keywords/pipeline`, {
        keywords: seeds.split(',').map((s) => s.trim()).filter(Boolean),
        discoverFromGsc,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyword-summary'] });
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['cannibalization'] });
    },
  });

  const data = summary.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Keyword discovery</CardTitle>
          <CardDescription>Seed keywords, discover from GSC and site content, then cluster and score opportunities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kw-seeds">Seed keywords (comma separated)</Label>
            <Input id="kw-seeds" value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="e.g. seo services, keyword research" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={discoverFromGsc} onChange={(e) => setDiscoverFromGsc(e.target.checked)} />
              Discover from GSC
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={discoverFromSite} onChange={(e) => setDiscoverFromSite(e.target.checked)} />
              Discover from site content
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => discoveryMutation.mutate()} disabled={!canManage || discoveryMutation.isPending}>
              <Plus className="size-4" />
              Discover
            </Button>
            <Button variant="outline" onClick={() => pipelineMutation.mutate()} disabled={!canManage || pipelineMutation.isPending}>
              <Play className="size-4" />
              Run full pipeline
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('sites.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Total keywords" value={data?.totalKeywords} />
          <Stat label="GSC queries" value={data?.gscQueries} />
          <Stat label="Google Ads keywords" value={data?.googleAdsKeywords} />
          <Stat label="Unclustered" value={data?.unclustered} />
          <Stat label="Clusters" value={data?.clusters} />
          <Stat label="Mapped" value={data?.mapped} />
          <Stat label="Unmapped" value={data?.unmapped} />
          <Stat label="Cannibalization cases" value={data?.cannibalizationCases} />
          <Stat label="Content opportunities" value={data?.contentOpportunities} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value ?? '—'}</div>
    </div>
  );
}

function KeywordsTabSection({ siteId, canManage: _canManage }: { siteId: string; canManage: boolean }) {
  const keywords = useQuery({
    queryKey: ['keywords', siteId],
    queryFn: () => api.get<KeywordDto[]>(`/sites/${siteId}/keywords`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keywords</CardTitle>
        <CardDescription>Source metrics are kept separate: GSC impressions/clicks vs Google Ads search volume.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {(keywords.data ?? []).length === 0 ? (
          <EmptyState message="No keywords yet. Run discovery." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Search vol</TableHead>
                <TableHead>GSC imps</TableHead>
                <TableHead>GSC clicks</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>{'Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keywords.data ?? []).map((kw) => (
                <TableRow key={kw.id}>
                  <TableCell className="font-medium">{kw.keyword}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{kw.sources.join(', ')}</TableCell>
                  <TableCell>{kw.metrics.monthlySearchVolume ?? '—'}</TableCell>
                  <TableCell>{kw.metrics.impressions}</TableCell>
                  <TableCell>{kw.metrics.clicks}</TableCell>
                  <TableCell>{kw.metrics.avgPosition != null ? kw.metrics.avgPosition.toFixed(1) : '—'}</TableCell>
                  <TableCell className="text-xs">{kw.intent}</TableCell>
                  <TableCell>
                    <StatusBadge status={kw.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ClustersTabSection({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clusters = useQuery({
    queryKey: ['clusters', siteId],
    queryFn: () => api.get<ClusterDto[]>(`/sites/${siteId}/keywords/clusters`),
  });
  const approveMutation = useMutation({
    mutationFn: (clusterId: string) => api.post<ClusterDto>(`/sites/${siteId}/keywords/clusters/${clusterId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      queryClient.invalidateQueries({ queryKey: ['url-mappings'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clusters</CardTitle>
        <CardDescription>Each cluster = one search intent = one target URL.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {(clusters.data ?? []).length === 0 ? (
          <EmptyState message="No clusters yet. Run discovery + clustering." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cluster</TableHead>
                <TableHead>Primary keyword</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Page type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>{'Status'}</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clusters.data ?? []).map((cluster) => (
                <TableRow key={cluster.id}>
                  <TableCell className="font-medium">{cluster.name}</TableCell>
                  <TableCell className="text-muted-foreground">{cluster.primaryKeyword}</TableCell>
                  <TableCell className="text-xs">{cluster.intent}</TableCell>
                  <TableCell className="text-xs">{cluster.pageType}</TableCell>
                  <TableCell className="text-xs">{cluster.recommendedAction}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{cluster.targetUrl ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={cluster.status} />
                  </TableCell>
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
  );
}

function UrlMapTabSection({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const mappings = useQuery({
    queryKey: ['url-mappings', siteId],
    queryFn: () => api.get<UrlMappingDto[]>(`/sites/${siteId}/keywords/url-mappings`),
  });
  const matchMutation = useMutation({
    mutationFn: () => api.post<{ matched: number }>(`/sites/${siteId}/keywords/url-mappings/match`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['url-mappings'] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>URL Map</CardTitle>
        <CardDescription>One intent → one target URL. Approved mappings are protected.</CardDescription>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={() => matchMutation.mutate()} disabled={matchMutation.isPending}>
            <RefreshCw className="size-3.5" />
            Match existing URLs
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {(mappings.data ?? []).length === 0 ? (
          <EmptyState message="No URL mappings yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>{'Status'}</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(mappings.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs font-medium">{m.url}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.clusterId ?? '—'}</TableCell>
                  <TableCell className="text-xs">{m.mappingType}</TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="text-xs">{m.confidence != null ? Math.round(m.confidence * 100) + '%' : '—'}</TableCell>
                  <TableCell className="text-xs">{m.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CannibalizationTabSection({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const cases = useQuery({
    queryKey: ['cannibalization', siteId],
    queryFn: () => api.get<CannibalizationCaseDto[]>(`/sites/${siteId}/keywords/cannibalization`),
  });
  const analyzeMutation = useMutation({
    mutationFn: () => api.post<CannibalizationCaseDto[]>(`/sites/${siteId}/keywords/cannibalization/analyze`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cannibalization'] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cannibalization</CardTitle>
        <CardDescription>Query-page evidence: one query ranking on multiple competing URLs.</CardDescription>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
            <RefreshCw className="size-3.5" />
            Run analysis
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {(cases.data ?? []).length === 0 ? (
          <EmptyState message="No cannibalization cases detected." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead>
                <TableHead>Competing URLs</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cases.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.query}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.urls.length} URL(s)</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <AlertTriangle className="size-3 text-destructive" />
                      {c.classification}
                    </span>
                  </TableCell>
                  <TableCell>{Math.round(c.score * 100)}</TableCell>
                  <TableCell className="text-xs">{c.recommendation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OpportunitiesTabSection({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const opportunities = useQuery({
    queryKey: ['opportunities', siteId],
    queryFn: () => api.get<KeywordOpportunityDto[]>(`/sites/${siteId}/keywords/opportunities`),
  });
  const refreshMutation = useMutation({
    mutationFn: () => api.post<KeywordOpportunityDto[]>(`/sites/${siteId}/keywords/opportunities/refresh`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
  const decideMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'ignore' }) =>
      api.post<KeywordOpportunityDto>(`/sites/${siteId}/keywords/opportunities/${id}/${action}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
  const createContentMutation = useMutation({
    mutationFn: (id: string) => api.post(`/sites/${siteId}/keywords/opportunities/${id}/create-content`, {}),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opportunities</CardTitle>
        <CardDescription>Deterministic, versioned scoring — AI explains, never sets priority.</CardDescription>
        {canManage ? (
          <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className="size-3.5" />
            Refresh scores
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {(opportunities.data ?? []).length === 0 ? (
          <EmptyState message="No opportunities yet. Run the pipeline." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opportunity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cluster</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Effort</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>{'Status'}</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(opportunities.data ?? []).map((op) => (
                <TableRow key={op.id}>
                  <TableCell className="font-medium">{op.keyword ?? op.clusterName ?? op.type}</TableCell>
                  <TableCell className="text-xs">{op.type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{op.clusterName ?? '—'}</TableCell>
                  <TableCell className="text-xs">{op.impact}</TableCell>
                  <TableCell className="text-xs">{op.effort}</TableCell>
                  <TableCell className="font-semibold">{op.priorityScore}</TableCell>
                  <TableCell>
                    <StatusBadge status={op.status} />
                  </TableCell>
                  <TableCell className="text-end">
                    {canManage && op.status === 'OPEN' ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => decideMutation.mutate({ id: op.id, action: 'approve' })}>
                          <Check className="size-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => decideMutation.mutate({ id: op.id, action: 'ignore' })}>
                          Ignore
                        </Button>
                      </div>
                    ) : null}
                    {canManage && op.status === 'APPROVED' ? (
                      <Button size="sm" variant="outline" onClick={() => createContentMutation.mutate(op.id)}>
                        <CheckCircle2 className="size-3.5" />
                        Create Content
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
  );
}

function GoogleAdsTabSection({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const integration = useQuery({
    queryKey: ['google-ads', siteId],
    queryFn: () => api.get<GoogleAdsIntegrationDto>(`/sites/${siteId}/google-ads`),
  });
  const [customerId, setCustomerId] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [seeds, setSeeds] = useState('');

  const configureMutation = useMutation({
    mutationFn: () =>
      api.post<GoogleAdsIntegrationDto>(`/sites/${siteId}/google-ads/configure`, {
        customerId,
        developerToken,
        refreshToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-ads'] });
      setDeveloperToken('');
      setRefreshToken('');
    },
  });
  const testMutation = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/google-ads/test`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-ads'] }),
  });
  const plannerMutation = useMutation({
    mutationFn: () =>
      api.post(`/sites/${siteId}/google-ads/planner`, {
        seeds: seeds.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-ads'] });
      queryClient.invalidateQueries({ queryKey: ['keywords'] });
      setSeeds('');
    },
  });

  const data = integration.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Ads integration</CardTitle>
          <CardDescription>Keyword Planner search volume — separate from GSC performance metrics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <StatusBadge status={data?.status ?? 'NOT_CONFIGURED'} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Customer ID</div>
              <div>{data?.customerId ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Language target</div>
              <div>{data?.languageTarget ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last keyword sync</div>
              <div>{data?.lastKeywordSyncAt ? new Date(data.lastKeywordSyncAt).toLocaleString() : '—'}</div>
            </div>
          </div>
          {data?.lastError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Error: {data.lastError} ({data.lastErrorCode ?? 'UNKNOWN'})
            </div>
          ) : null}

          {canManage ? (
            <div className="space-y-3 border-t pt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Customer ID</Label>
                  <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="123-456-7890" />
                </div>
                <div className="space-y-1.5">
                  <Label>Developer token</Label>
                  <Input type="password" value={developerToken} onChange={(e) => setDeveloperToken(e.target.value)} placeholder="••••••••" />
                </div>
                <div className="space-y-1.5">
                  <Label>Refresh token</Label>
                  <Input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="••••••••" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => configureMutation.mutate()} disabled={!customerId || configureMutation.isPending}>
                  Configure
                </Button>
                <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                  Test connection
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Keyword Planner</CardTitle>
            <CardDescription>Generate keyword ideas from seeds. Refresh monthly or manually — not daily.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Seed keywords</Label>
              <Input value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="seo services, keyword research" />
            </div>
            <Button onClick={() => plannerMutation.mutate()} disabled={!seeds || plannerMutation.isPending}>
              <Play className="size-4" />
              Run Keyword Planner
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}