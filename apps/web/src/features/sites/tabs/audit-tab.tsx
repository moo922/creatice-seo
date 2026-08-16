import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Play, RefreshCw } from 'lucide-react';
import type {
  AuditOverviewDto,
  AuditResultDto,
  AuditRunHistoryEntryDto,
  CrawlPageDto,
  CrawlRunDetailDto,
  LinkAnalysisDto,
  PageInspectionDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { KpiCard } from '@/components/shared/kpi-card';

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  critical: 'default',
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

export function AuditTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('operations:manage');

  const overviewQuery = useQuery({
    queryKey: ['audit-overview', siteId],
    queryFn: () => api.get<AuditOverviewDto>(`/sites/${siteId}/audit/summary`),
  });
  const overview = overviewQuery.data;

  const historyQuery = useQuery({
    queryKey: ['audit-history', siteId],
    queryFn: () => api.get<AuditRunHistoryEntryDto[]>(`/sites/${siteId}/audit/history`),
  });
  const history = historyQuery.data ?? [];

  const auditRunId = overview?.auditRun?.id;
  const resultsQuery = useQuery({
    queryKey: ['audit-results', siteId, auditRunId],
    enabled: Boolean(auditRunId),
    queryFn: () => api.get<{ run: unknown; results: AuditResultDto[] }>(`/sites/${siteId}/audit/runs/${auditRunId}`),
  });
  const results = resultsQuery.data?.results ?? [];

  const crawlRunId = overview?.crawlRun?.id;
  const crawlQuery = useQuery({
    queryKey: ['crawl-run-detail', siteId, crawlRunId],
    enabled: Boolean(crawlRunId),
    queryFn: () => api.get<CrawlRunDetailDto>(`/sites/${siteId}/links/crawls/${crawlRunId}`),
  });

  const analysesQuery = useQuery({
    queryKey: ['link-analyses', siteId],
    queryFn: () => api.get<LinkAnalysisDto[]>(`/sites/${siteId}/links/analyses`),
  });

  const runAudit = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/audit`, { persist: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-overview', siteId] });
      queryClient.invalidateQueries({ queryKey: ['audit-history', siteId] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('siteDetail.audit')}</h2>
          <p className="text-sm text-muted-foreground">
            Deterministic audit over the latest crawl run. Scores are an Internal Platform Health Score — not a Google score.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void overviewQuery.refetch()} disabled={overviewQuery.isFetching}>
            <RefreshCw className="size-4" /> {t('common.refresh')}
          </Button>
          {canManage ? (
            <Button size="sm" onClick={() => runAudit.mutate()} disabled={runAudit.isPending}>
              {runAudit.isPending ? <Spinner /> : <Play className="size-4" />} Run audit
            </Button>
          ) : null}
        </div>
      </div>

      <OverviewTab overview={overview} isLoading={overviewQuery.isLoading} />

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
          <TabsTrigger value="on-page">On-Page</TabsTrigger>
          <TabsTrigger value="indexability">Indexability</TabsTrigger>
          <TabsTrigger value="structured-data">Structured Data</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="history">Audit History</TabsTrigger>
          <TabsTrigger value="internal-links">Internal Links</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProblemAreas overview={overview} results={results} />
        </TabsContent>
        <TabsContent value="technical">
          <RuleGroupTab siteId={siteId} results={results} category="technical" />
        </TabsContent>
        <TabsContent value="on-page">
          <RuleGroupTab siteId={siteId} results={results} category="on-page" />
        </TabsContent>
        <TabsContent value="indexability">
          <IndexabilityTab overview={overview} results={results} />
        </TabsContent>
        <TabsContent value="structured-data">
          <RuleGroupTab siteId={siteId} results={results} category="content" />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab siteId={siteId} crawl={crawlQuery.data} isLoading={crawlQuery.isLoading} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab history={history} isLoading={historyQuery.isLoading} />
        </TabsContent>
        <TabsContent value="internal-links">
          <InternalLinksTab analyses={analysesQuery.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ overview, isLoading }: { overview: AuditOverviewDto | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <div className="grid gap-3 sm:grid-cols-4"><KpiCard label="…" value="…" /></div>;
  }
  if (!overview) return null;

  const counts = overview.counts;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Overall Internal Health" value={overview.scores?.seoHealth ?? 'Not measured'} />
        <KpiCard label="Technical Health" value={overview.scores?.technicalHealth ?? 'Not measured'} />
        <KpiCard label="On-Page Health" value={overview.scores?.onPageHealth ?? 'Not measured'} />
        <KpiCard label="Internal Linking Health" value={overview.scores?.internalLinkingHealth ?? 'Not measured'} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <KpiCard label="Pages Crawled" value={overview.pagesCrawled} />
        <KpiCard label="Indexable URLs" value={overview.pagesIndexable} />
        <KpiCard label="Noindex URLs" value={overview.pagesNoindex} />
        <KpiCard label="4xx" value={counts.http4xx} />
        <KpiCard label="5xx" value={counts.http5xx} />
        <KpiCard label="Redirects" value={counts.redirects} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Critical" value={overview.issues.critical} />
        <KpiCard label="High" value={overview.issues.high} />
        <KpiCard label="Medium" value={overview.issues.medium} />
        <KpiCard label="Low" value={overview.issues.low} />
      </div>

      {overview.sitemap ? (
        <Card>
          <CardHeader>
            <CardTitle>Sitemap</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <KpiCard label="URLs in sitemap" value={overview.sitemap.urlsInSitemap} />
            <KpiCard label="URLs crawled" value={overview.sitemap.urlsCrawled} />
            <KpiCard label="Sitemap URL errors" value={overview.sitemap.urlsFailed} />
            <KpiCard label="Status" value={overview.sitemap.status} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ProblemAreas({ overview, results }: { overview: AuditOverviewDto | undefined; results: AuditResultDto[] }) {
  const groups = useMemo(() => failedByRule(results), [results]);
  const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Problem areas</CardTitle>
        <CardDescription>
          {overview?.auditRun ? `From the latest audit run (${new Date(overview.auditRun.startedAt).toLocaleString()})` : 'Run an audit to see findings.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState message="No failed audit rules for the latest run." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Affected URLs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([ruleKey, findings]) => (
                <TableRow key={ruleKey}>
                  <TableCell className="font-medium">{ruleKey}</TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[findings[0]!.severity] ?? 'outline'}>{findings[0]!.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {findings.length} · {findings[0]!.url}
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

function RuleGroupTab({ siteId, results, category }: { siteId: string; results: AuditResultDto[]; category: string }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const groups = useMemo(
    () => [...failedByRule(results).entries()].filter(([, findings]) => findings[0]!.category === category),
    [results, category],
  );

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No failed {category} rules in the latest run.</CardContent></Card>
      ) : (
        groups.map(([ruleKey, findings]) => (
          <Card key={ruleKey}>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{ruleKey}</CardTitle>
                <Badge variant={SEVERITY_VARIANT[findings[0]!.severity] ?? 'outline'}>{findings[0]!.severity}</Badge>
              </div>
              <CardDescription>{findings.length} affected URL(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-48 divide-y overflow-auto">
                {findings.slice(0, 20).map((finding) => (
                  <li key={finding.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="truncate">{finding.url}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedUrl(finding.url)}>
                      Inspect
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
      {selectedUrl ? <PageInspector siteId={siteId} url={selectedUrl} onClose={() => setSelectedUrl(null)} /> : null}
    </div>
  );
}

function IndexabilityTab({ overview, results }: { overview: AuditOverviewDto | undefined; results: AuditResultDto[] }) {
  const rules = ['NOINDEX_PAGE', 'ROBOTS_BLOCKED_PAGE', 'CANONICAL_MISSING', 'CANONICAL_INVALID', 'CANONICAL_CONFLICT', 'INDEXABLE_URL_NOT_IN_SITEMAP', 'SITEMAP_URL_NOT_CRAWLABLE'];
  const groups = failedByRule(results);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <KpiCard label="Indexable URLs" value={overview?.pagesIndexable ?? 'Not measured'} />
      <KpiCard label="Noindex URLs" value={overview?.pagesNoindex ?? 'Not measured'} />
      <KpiCard label="Canonical problems" value={overview?.counts.canonicalProblems ?? 'Not measured'} />
      {rules.map((ruleKey) => {
        const findings = groups.get(ruleKey);
        return (
          <Card key={ruleKey}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{ruleKey}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {findings ? `${findings.length} affected URL(s)` : 'No issues'}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PagesTab({ siteId, crawl, isLoading }: { siteId: string; crawl: CrawlRunDetailDto | undefined; isLoading: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (isLoading) return <Card><CardContent className="py-10 text-center"><Spinner /></CardContent></Card>;
  const pages = crawl?.pages ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Latest crawl pages</CardTitle>
          <CardDescription>{pages.length} page(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pages.length === 0 ? (
            <EmptyState message="Run a crawl to inspect pages." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Depth</TableHead>
                  <TableHead>Indexable</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="max-w-[300px]">
                      <div className="truncate font-medium">{page.url}</div>
                      <div className="text-xs text-muted-foreground">{page.title ?? '—'}</div>
                    </TableCell>
                    <TableCell>{page.httpStatus ?? '—'}</TableCell>
                    <TableCell>{page.depth}</TableCell>
                    <TableCell>{page.indexable ? 'yes' : 'no'}</TableCell>
                    <TableCell>{page.wordCount}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(selected === page.url ? null : page.url)}>
                        {selected === page.url ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {selected ? <PageInspector siteId={siteId} url={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function PageInspector({ siteId, url, onClose }: { siteId: string; url: string; onClose: () => void }) {
  const inspection = useQuery({
    queryKey: ['page-inspection', siteId, url],
    queryFn: () => api.get<PageInspectionDto>(`/sites/${siteId}/audit/pages?url=${encodeURIComponent(url)}`),
  });
  const data = inspection.data;
  return (
    <Card className="border-primary/40">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-sm">{url}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {inspection.isLoading || !data ? (
          <EmptyState message="Loading…" />
        ) : data.current ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="HTTP status" value={data.current.httpStatus ?? '—'} />
              <KpiCard label="Final URL" value={data.current.finalUrl ? 'redirected' : 'direct'} />
              <KpiCard label="Depth" value={data.current.depth} />
              <KpiCard label="Indexable" value={data.current.indexable ? 'yes' : 'no'} />
              <KpiCard label="Word count" value={data.current.wordCount} />
            </div>
            <SignalList title="Signals" items={[
              ['Title', data.current.title],
              ['Meta description', data.current.metaDescription],
              ['H1', data.current.h1],
              ['Canonical', data.current.canonical],
              ['Meta robots', data.current.metaRobots.join(', ') || 'none'],
              ['Language', data.current.language],
              ['Schema blocks', `${data.current.schemaBlocks} valid · ${data.current.schemaErrors.length} errors`],
              ['Redirect chain', data.current.redirectChain.length > 1 ? data.current.redirectChain.join(' → ') : 'none'],
            ]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <LinkList title={`Internal incoming (${data.inLinks.length})`} links={data.inLinks.map((link) => ({ url: link.sourceUrl, note: link.anchorText }))} />
              <LinkList title={`Internal outgoing (${data.outLinks.length})`} links={data.outLinks.map((link) => ({ url: link.targetUrl, note: link.anchorText }))} />
            </div>
            {data.findings.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-medium">Audit findings</h4>
                <ul className="space-y-1">
                  {data.findings.map((finding) => (
                    <li key={finding.id} className="flex items-center gap-2 text-sm">
                      <Badge variant={SEVERITY_VARIANT[finding.severity] ?? 'outline'}>{finding.severity}</Badge>
                      <span>{finding.ruleKey}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No failed audit findings for this URL.</p>
            )}
            <div>
              <h4 className="mb-2 text-sm font-medium">Crawl history ({data.history.length})</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crawl</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Words</TableHead>
                    <TableHead>Title</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((page: CrawlPageDto) => (
                    <TableRow key={page.id}>
                      <TableCell className="text-sm text-muted-foreground">{new Date(page.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{page.httpStatus ?? '—'}</TableCell>
                      <TableCell>{page.wordCount}</TableCell>
                      <TableCell className="text-sm">{page.title ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState message="This URL has not been crawled yet." />
        )}
      </CardContent>
    </Card>
  );
}

function SignalList({ title, items }: { title: string; items: Array<[string, string | null | undefined]> }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate" title={value ?? undefined}>{value ?? 'Unknown'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LinkList({ title, links }: { title: string; links: Array<{ url: string; note: string }> }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {links.slice(0, 50).map((link, index) => (
            <li key={index} className="truncate" title={link.url}>
              {link.url} {link.note ? <span className="text-muted-foreground">· {link.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({ history, isLoading }: { history: AuditRunHistoryEntryDto[]; isLoading: boolean }) {
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  if (isLoading) return <Card><CardContent className="py-10 text-center"><Spinner /></CardContent></Card>;

  const a = history.find((entry) => entry.run.id === compareA);
  const b = history.find((entry) => entry.run.id === compareB);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>Every audit run is persisted — audits are never overwritten.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <EmptyState message="No audit runs yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead>High</TableHead>
                  <TableHead>Medium</TableHead>
                  <TableHead>Low</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry.run.id}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(entry.run.startedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{entry.run.type}</TableCell>
                    <TableCell>{entry.pagesCrawled}</TableCell>
                    <TableCell className="font-medium">{entry.scores?.seoHealth ?? '—'}</TableCell>
                    <TableCell>{entry.issues.critical}</TableCell>
                    <TableCell>{entry.issues.high}</TableCell>
                    <TableCell>{entry.issues.medium}</TableCell>
                    <TableCell>{entry.issues.low}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.durationSeconds !== null ? `${entry.durationSeconds}s` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Compare audit runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64">
                <label className="mb-1 block text-sm">Audit A</label>
                <Select value={compareA} onChange={(event) => setCompareA(event.target.value)}>
                  <option value="">Select…</option>
                  {history.map((entry) => (
                    <option key={entry.run.id} value={entry.run.id}>{new Date(entry.run.startedAt).toLocaleString()}</option>
                  ))}
                </Select>
              </div>
              <div className="w-64">
                <label className="mb-1 block text-sm">Audit B</label>
                <Select value={compareB} onChange={(event) => setCompareB(event.target.value)}>
                  <option value="">Select…</option>
                  {history.map((entry) => (
                    <option key={entry.run.id} value={entry.run.id}>{new Date(entry.run.startedAt).toLocaleString()}</option>
                  ))}
                </Select>
              </div>
            </div>
            {a && b ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>A</TableHead>
                    <TableHead>B</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CompareRow label="SEO Health" a={a.scores?.seoHealth} b={b.scores?.seoHealth} />
                  <CompareRow label="Technical Health" a={a.scores?.technicalHealth} b={b.scores?.technicalHealth} />
                  <CompareRow label="On-Page Health" a={a.scores?.onPageHealth} b={b.scores?.onPageHealth} />
                  <CompareRow label="Internal Linking Health" a={a.scores?.internalLinkingHealth} b={b.scores?.internalLinkingHealth} />
                  <CompareRow label="Critical" a={a.issues.critical} b={b.issues.critical} />
                  <CompareRow label="High" a={a.issues.high} b={b.issues.high} />
                  <CompareRow label="Medium" a={a.issues.medium} b={b.issues.medium} />
                  <CompareRow label="Low" a={a.issues.low} b={b.issues.low} />
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: number | null | undefined; b: number | null | undefined }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className={deltaClass(a, b)}>{a ?? '—'}</TableCell>
      <TableCell className={deltaClass(b, a)}>{b ?? '—'}</TableCell>
    </TableRow>
  );
}

function deltaClass(current: number | null | undefined, other: number | null | undefined): string {
  if (current === null || current === undefined || other === null || other === undefined) return '';
  if (current > other) return 'text-emerald-600 font-medium';
  if (current < other) return 'text-destructive';
  return '';
}

function InternalLinksTab({ analyses }: { analyses: LinkAnalysisDto[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal Links</CardTitle>
        <CardDescription>Link-graph analysis and suggestions — separate from the technical audit.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {analyses.length === 0 ? (
          <EmptyState message="No link analyses yet. Run one to detect orphans, weak targets, broken links and opportunities." />
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
  );
}

function failedByRule(results: AuditResultDto[]): Map<string, AuditResultDto[]> {
  const map = new Map<string, AuditResultDto[]>();
  for (const result of results) {
    if (result.passed) continue;
    const list = map.get(result.ruleKey) ?? [];
    list.push(result);
    map.set(result.ruleKey, list);
  }
  return map;
}
