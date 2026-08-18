import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import type {
  AeoSiteAuditDto,
  AeoAuditHistoryEntryDto,
  AeoQuestionGapDto,
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

export function AeoTab({ siteId }: { siteId: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('sites:manage');
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const auditQuery = useQuery({
    queryKey: ['aeo-audit', siteId],
    queryFn: () => api.get<AeoSiteAuditDto>(`/sites/${siteId}/audits/aeo`),
  });
  const audit = auditQuery.data;

  const historyQuery = useQuery({
    queryKey: ['aeo-history', siteId],
    queryFn: () => api.get<AeoAuditHistoryEntryDto[]>(`/sites/${siteId}/audits/aeo/history`),
  });
  const history = historyQuery.data ?? [];

  const gapsQuery = useQuery({
    queryKey: ['aeo-gaps', siteId],
    queryFn: () => api.get<AeoQuestionGapDto[]>(`/sites/${siteId}/audits/aeo/question-gaps`),
  });
  const gaps = gapsQuery.data ?? [];

  const runAudit = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/audits/aeo`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aeo-audit', siteId] });
      queryClient.invalidateQueries({ queryKey: ['aeo-history', siteId] });
      queryClient.invalidateQueries({ queryKey: ['aeo-gaps', siteId] });
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
          <h2 className="text-lg font-semibold">AEO Audit</h2>
          <p className="text-sm text-muted-foreground">Answer Engine Optimization readiness</p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => runAudit.mutate()}
            disabled={runAudit.isPending}
          >
            {runAudit.isPending ? <Spinner className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
            Run AEO Audit
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="gaps">Question Gaps</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {!audit ? (
            <EmptyState message="No AEO audit found. Run one to get started." />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="AEO Readiness" value={audit.score.overall ?? '--'} />
                <KpiCard label="Data Quality" value={audit.dataQuality} />
                <KpiCard label="Pages Measured" value={`${audit.pagesMeasured}/${audit.pagesMeasured + audit.pagesExcluded + audit.pagesInsufficient}`} />
                <KpiCard label="Question Coverage" value={`${audit.questionCoverage.answered}/${audit.questionCoverage.total}`} />
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
            <EmptyState message="No page-level AEO data." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead>Direct Answer</TableHead>
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
                          <TableCell><Badge variant="outline">{page.intentAlignment.rating}</Badge></TableCell>
                          <TableCell><Badge variant="outline">{page.directAnswer.rating}</Badge></TableCell>
                          <TableCell>{dataQualityBadge(page.dataQuality)}</TableCell>
                        </TableRow>
                        {expandedPage === page.id && (
                          <TableRow key={`${page.id}-detail`}>
                            <TableCell colSpan={5}>
                              <div className="grid gap-2 text-sm">
                                <div><strong>AI Provider:</strong> {page.aiProvider ?? 'deterministic only'}</div>
                                <div><strong>AI Model:</strong> {page.aiModel ?? '-'}</div>
                                <div><strong>Intent Rating:</strong> {page.intentAlignment.rating} — {page.intentAlignment.reason}</div>
                                <div><strong>Direct Answer:</strong> {page.directAnswer.rating} — {page.directAnswer.evidence}</div>
                                <div><strong>Factual Grounding:</strong> {JSON.stringify(page.factualGrounding)}</div>
                                <div><strong>Semantic Completeness:</strong> {JSON.stringify(page.semanticCompleteness)}</div>
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

        <TabsContent value="gaps" className="space-y-4">
          {gaps.length === 0 ? (
            <EmptyState message="No question gaps found." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Target Page</TableHead>
                      <TableHead>Missing Topic</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gaps.map((gap, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{gap.query}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{gap.targetPage}</TableCell>
                        <TableCell>{gap.missingTopic}</TableCell>
                        <TableCell><Badge variant="outline">{gap.category}</Badge></TableCell>
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
