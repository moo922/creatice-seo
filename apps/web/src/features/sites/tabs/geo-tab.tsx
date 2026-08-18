import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, AlertTriangle } from 'lucide-react';
import type {
  GeoSiteAuditDto,
  GeoAuditHistoryEntryDto,
  GeoGapDto,
  CrawlerPolicyResultDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { KpiCard } from '@/components/shared/kpi-card';

export function GeoTab({ siteId }: { siteId: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('sites:manage');
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const auditQuery = useQuery({
    queryKey: ['geo-audit', siteId],
    queryFn: () => api.get<GeoSiteAuditDto>(`/sites/${siteId}/audits/geo`),
  });
  const audit = auditQuery.data;

  const historyQuery = useQuery({
    queryKey: ['geo-history', siteId],
    queryFn: () => api.get<GeoAuditHistoryEntryDto[]>(`/sites/${siteId}/audits/geo/history`),
  });
  const history = historyQuery.data ?? [];

  const gapsQuery = useQuery({
    queryKey: ['geo-gaps', siteId],
    queryFn: () => api.get<GeoGapDto[]>(`/sites/${siteId}/audits/geo/gaps`),
  });
  const gaps = gapsQuery.data ?? [];

  const crawlerQuery = useQuery({
    queryKey: ['geo-crawlers', siteId],
    queryFn: () => api.get<CrawlerPolicyResultDto[]>(`/sites/${siteId}/audits/geo/crawlers`),
  });
  const crawlers = crawlerQuery.data ?? [];

  const runAudit = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/audits/geo`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo-audit', siteId] });
      queryClient.invalidateQueries({ queryKey: ['geo-history', siteId] });
      queryClient.invalidateQueries({ queryKey: ['geo-gaps', siteId] });
    },
  });

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const dataQualityBadge = (dq: string | null) => {
    if (dq === 'GOOD') return <Badge variant="default">Good</Badge>;
    if (dq === 'PARTIAL') return <Badge variant="secondary">Partial</Badge>;
    return <Badge variant="outline">Insufficient</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">GEO Audit</h2>
          <p className="text-sm text-muted-foreground">Generative Engine Optimization readiness</p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => runAudit.mutate()}
            disabled={runAudit.isPending}
          >
            {runAudit.isPending ? <Spinner className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
            Run GEO Audit
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="crawlers">AI Crawlers</TabsTrigger>
          <TabsTrigger value="gaps">Gaps</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {!audit ? (
            <EmptyState message="No GEO audit found. Run one to get started." />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="GEO Readiness" value={audit.score.overall ?? '--'} />
                <KpiCard label="Data Quality" value={audit.dataQuality} />
                <KpiCard label="Pages Measured" value={`${audit.pagesMeasured}/${audit.pagesMeasured + audit.pagesExcluded + audit.pagesInsufficient}`} />
                <KpiCard label="Brand Entity" value={audit.entitySummary.brand ?? '-'} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Score Components</CardTitle>
                  <CardDescription>Deterministic component scores (v{audit.score.scoreVersion})</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Weight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.score.components.map((comp) => (
                        <TableRow key={comp.id}>
                          <TableCell className="font-medium">{comp.label}</TableCell>
                          <TableCell className={scoreColor(comp.score)}>{comp.score}</TableCell>
                          <TableCell>{(comp.weight * 100).toFixed(0)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {audit.topGaps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Gaps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Finding</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Severity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {audit.topGaps.map((gap, i) => (
                          <TableRow key={i}>
                            <TableCell>{gap.findingType}</TableCell>
                            <TableCell className="max-w-xs truncate text-xs">{gap.url}</TableCell>
                            <TableCell>
                              <Badge variant={gap.severity === 'HIGH' ? 'default' : 'secondary'}>
                                {gap.severity}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          {!audit || audit.pages.length === 0 ? (
            <EmptyState message="No page-level GEO data." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Components</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.pages.map((page) => (
                      <>
                        <TableRow
                          key={page.id}
                          className="cursor-pointer"
                          onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                        >
                          <TableCell className="max-w-xs truncate font-medium">{page.url}</TableCell>
                          <TableCell className={scoreColor(page.overallScore)}>{page.overallScore}</TableCell>
                          <TableCell>{page.componentScores.length} evaluated</TableCell>
                          <TableCell>{dataQualityBadge(page.dataQuality)}</TableCell>
                        </TableRow>
                        {expandedPage === page.id && (
                          <TableRow key={`${page.id}-detail`}>
                            <TableCell colSpan={4}>
                              <div className="grid gap-2 text-sm">
                                <div><strong>AI Provider:</strong> {page.aiProvider ?? 'deterministic only'}</div>
                                <div><strong>AI Model:</strong> {page.aiModel ?? '-'}</div>
                                <div><strong>Entity Clarity:</strong> {JSON.stringify(page.entityClarity)}</div>
                                <div><strong>Claim Verification:</strong> {JSON.stringify(page.claimVerification)}</div>
                                <div><strong>Expert Attribution:</strong> {JSON.stringify(page.expertAttribution)}</div>
                                <div><strong>Machine Accessible:</strong> {JSON.stringify(page.machineAccessibility)}</div>
                                <div><strong>Citation Readiness:</strong> {JSON.stringify(page.citationReadiness)}</div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="entities" className="space-y-4">
          {!audit ? (
            <EmptyState message="No entity data." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-blue-500" />
                    Brand Entity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {audit.entitySummary.brand}</div>
                  <div><strong>Type:</strong> {audit.entitySummary.type}</div>
                  <div>
                    <strong>Locations:</strong>{' '}
                    {audit.entitySummary.locations.length > 0 ? audit.entitySummary.locations.join(', ') : '-'}
                  </div>
                  <div>
                    <strong>Services:</strong>{' '}
                    {audit.entitySummary.services.length > 0 ? audit.entitySummary.services.join(', ') : '-'}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-500" />
                    Entity Conflicts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {audit.entitySummary.conflicts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No conflicts detected.</p>
                  ) : (
                    <ul className="list-disc space-y-1 text-sm">
                      {audit.entitySummary.conflicts.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="crawlers" className="space-y-4">
          {crawlers.length === 0 ? (
            <EmptyState message="No AI crawler policy data." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crawler</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>robots.txt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Checked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crawlers.map((cr: CrawlerPolicyResultDto, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{cr.crawlerName}</TableCell>
                        <TableCell><Badge variant="outline">{cr.crawlerPurpose}</Badge></TableCell>
                        <TableCell>
                          {cr.accessResult === 'ALLOWED' ? (
                            <Badge variant="default">Allowed</Badge>
                          ) : cr.accessResult === 'BLOCKED' ? (
                            <Badge variant="outline">Blocked</Badge>
                          ) : (
                            <Badge variant="outline">{cr.accessResult}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{dataQualityBadge(cr.accessResult === 'ALLOWED' ? 'GOOD' : 'PARTIAL')}</TableCell>
                        <TableCell>{cr.checkedAt ? new Date(cr.checkedAt).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="gaps" className="space-y-4">
          {gaps.length === 0 ? (
            <EmptyState message="No GEO gaps found." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Finding</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gaps.map((gap, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge variant="outline">{gap.findingType}</Badge></TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{gap.url ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={gap.severity === 'HIGH' ? 'default' : 'secondary'}>
                            {gap.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-sm text-xs">{gap.recommendation ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <EmptyState message="No audit history." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Version</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => (
                      <TableRow key={entry.auditRun.id}>
                        <TableCell>{new Date(entry.auditRun.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={entry.auditRun.status === 'COMPLETED' ? 'default' : 'secondary'}>
                            {entry.auditRun.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.score ?? '-'}</TableCell>
                        <TableCell>{entry.pagesMeasured}</TableCell>
                        <TableCell>{entry.scoreVersion}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
