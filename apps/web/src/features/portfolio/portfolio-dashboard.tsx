import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Play, RefreshCw } from 'lucide-react';
import type { PortfolioDashboardDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KpiCard } from '@/components/shared/kpi-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

const FILTERS = ['', 'healthy', 'needs_attention', 'critical', 'growing', 'declining', 'integration_error', 'audit_overdue', 'report_due'];
const PAGE_SIZE = 10;

export function PortfolioDashboard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('siteName');
  const [page, setPage] = useState(0);

  const dashboardQuery = useQuery({
    queryKey: ['portfolio-dashboard'],
    queryFn: () => api.get<PortfolioDashboardDto>('/dashboard'),
  });

  const dashboard = dashboardQuery.data;
  const canCreateSite = hasPermission('sites:create');
  const canManage = hasPermission('operations:manage');

  const attentionSiteIds = useMemo(() => new Set((dashboard?.needsAttention ?? []).map((item) => item.siteId)), [dashboard]);

  const rows = useMemo(() => {
    let list = dashboard?.sites ?? [];
    if (search.trim()) {
      const needle = search.toLowerCase();
      list = list.filter((site) => site.siteName.toLowerCase().includes(needle) || site.domain.toLowerCase().includes(needle));
    }
    if (filter) {
      list = list.filter((site) => {
        switch (filter) {
          case 'healthy': return site.integrationHealth === 'healthy';
          case 'needs_attention': return attentionSiteIds.has(site.siteId);
          case 'critical': return site.openCriticalIssues > 0;
          case 'growing': return site.clicksChange !== null && site.clicksChange > 0;
          case 'declining': return site.clicksChange !== null && site.clicksChange < 0;
          case 'integration_error': return site.integrationHealth === 'error';
          case 'audit_overdue': return site.lastAudit === null;
          case 'report_due': return site.nextReport !== null;
          default: return true;
        }
      });
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sort as keyof typeof a];
      const bv = b[sort as keyof typeof b];
      if (typeof av === 'number' && typeof bv === 'number') return (bv ?? 0) - (av ?? 0);
      return String(av ?? '').localeCompare(String(bv ?? ''));
    });
    return sorted;
  }, [dashboard, search, filter, sort, attentionSiteIds]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (dashboardQuery.isLoading) {
    return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-4"><KpiCard label="…" value="…" /></div><EmptyState message="Loading…" /></div>;
  }

  if (!dashboard || dashboard.summary.totalSites === 0) {
    return (
      <div className="space-y-6">
        <PageTitle title={t('portfolio.title')} description={t('portfolio.description')} />
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-lg font-medium">Add your first website to start.</p>
            <p className="mt-1 text-sm text-muted-foreground">Register a domain, then connect WordPress, crawl, build a baseline and connect Search Console to fill this dashboard.</p>
            {canCreateSite ? (
              <Button asChild className="mt-4">
                <Link to="/sites">Add Website</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = dashboard.summary;

  return (
    <div className="space-y-6">
      <PageTitle title={t('portfolio.title')} description={t('portfolio.description')} />

      <div className="flex flex-wrap gap-2">
        {canCreateSite ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/sites">
              <PlusIcon /> Add Website
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          <RefreshCw className="size-4" /> {t('common.refresh')}
        </Button>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => void runPortfolioHealth(sites(dashboard))}>
            <Play className="size-4" /> Run Portfolio Health Check
          </Button>
        ) : null}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Sites" value={summary.totalSites} />
        <KpiCard label="Active Sites" value={summary.activeSites} />
        <KpiCard label="Integration Problems" value={summary.sitesWithIntegrationProblems} />
        <KpiCard label="Sites Requiring Attention" value={summary.sitesRequiringAttention} />
        <KpiCard label="Open Issues" value={summary.openIssues} />
        <KpiCard label="Critical / High Issues" value={`${summary.criticalIssues} / ${summary.highPriorityIssues}`} />
        <KpiCard label="Open Recommendations" value={summary.openRecommendations} />
        <KpiCard label="High Priority Recs" value={summary.highPriorityRecommendations} />
        <KpiCard label="Open Tasks" value={summary.openTasks} />
        <KpiCard label="Overdue Tasks" value={summary.overdueTasks} />
        <KpiCard label="Content Awaiting Review" value={summary.contentAwaitingReview} />
        <KpiCard label="Published This Month" value={summary.publishedContentThisMonth} />
        <KpiCard label="Reports This Month" value={summary.reportsGeneratedThisMonth} />
        <KpiCard label="Reports Due" value={summary.reportsDue} />
        <KpiCard label="Sites Growing" value={summary.sitesGrowing} trend={summary.sitesGrowing > 0 ? 'up' : undefined} />
        <KpiCard label="Sites Declining" value={summary.sitesDeclining} trend={summary.sitesDeclining > 0 ? 'down' : undefined} />
        <KpiCard label="SEO Health Avg" value={summary.seoHealthAverage ?? '—'} />
        <KpiCard label="AEO Readiness Avg" value={summary.aeoReadinessAverage ?? '—'} />
        <KpiCard label="GEO Readiness Avg" value={summary.geoReadinessAverage ?? '—'} />
        <KpiCard label="AI Jobs This Month" value={summary.aiJobsThisMonth} />
        <KpiCard label="AI Cost This Month" value={`$${summary.aiEstimatedCostThisMonth.toFixed(2)}`} />
        <KpiCard label="Crawler Jobs Running" value={summary.crawlerJobsRunning} />
        <KpiCard label="Failed Automation Jobs" value={summary.failedAutomationJobs} />
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle>Needs Attention</CardTitle>
          <CardDescription>Prioritized operational feed across your sites</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {dashboard.needsAttention.length === 0 ? (
            <EmptyState message="No issues requiring attention." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Next action</TableHead>
                  <TableHead className="text-end">{t('common.open')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.needsAttention.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.siteName}</TableCell>
                    <TableCell>{item.problem}</TableCell>
                    <TableCell><StatusBadge status={item.severity} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(item.detectedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{item.nextAction}</TableCell>
                    <TableCell className="text-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={item.deepLink}><ArrowUpRight className="size-3.5" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sites table */}
      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>{rows.length} site(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Label htmlFor="site-search">{t('common.search')}</Label>
              <Input id="site-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search sites…" />
            </div>
            <div className="w-56">
              <Label htmlFor="site-filter">Filter</Label>
              <Select id="site-filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
                {FILTERS.map((item) => (
                  <option key={item} value={item}>{item === '' ? 'All' : item.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Label htmlFor="site-sort">Sort</Label>
              <Select id="site-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                {['siteName', 'clicks', 'impressions', 'openIssues', 'openTasks', 'seoHealth'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </div>
          </div>

          {pageRows.length === 0 ? (
            <EmptyState message="No sites match this filter." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SEO</TableHead>
                  <TableHead>AEO</TableHead>
                  <TableHead>GEO</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Δ</TableHead>
                  <TableHead>Impr.</TableHead>
                  <TableHead>Crit</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Crawl</TableHead>
                  <TableHead>GSC Sync</TableHead>
                  <TableHead>Integ.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((site) => (
                  <TableRow key={site.siteId}>
                    <TableCell>
                      <Link to={`/sites/${site.siteId}`} className="font-medium underline-offset-2 hover:underline">{site.siteName}</Link>
                      <div className="text-xs text-muted-foreground">{site.domain}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={site.status} /></TableCell>
                    <TableCell>{site.seoHealth ?? '—'}</TableCell>
                    <TableCell>{site.aeoReadiness ?? '—'}</TableCell>
                    <TableCell>{site.geoReadiness ?? '—'}</TableCell>
                    <TableCell>{site.clicks}</TableCell>
                    <TableCell className={site.clicksChange !== null && site.clicksChange > 0 ? 'text-emerald-600' : site.clicksChange !== null && site.clicksChange < 0 ? 'text-destructive' : ''}>
                      {site.clicksChange === null ? '—' : `${site.clicksChange > 0 ? '+' : ''}${site.clicksChange}%`}
                    </TableCell>
                    <TableCell>{site.impressions}</TableCell>
                    <TableCell>{site.openCriticalIssues}</TableCell>
                    <TableCell>{site.openIssues}</TableCell>
                    <TableCell>{site.openTasks}</TableCell>
                    <TableCell>{site.contentPending}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{site.lastCrawl ? shortDate(site.lastCrawl) : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{site.lastGscSync ? shortDate(site.lastGscSync) : '—'}</TableCell>
                    <TableCell><StatusBadge status={site.integrationHealth} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function PlusIcon() {
  return <span className="text-sm leading-none">+</span>;
}

function sites(dashboard: PortfolioDashboardDto) {
  return dashboard.sites;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

async function runPortfolioHealth(siteRows: PortfolioDashboardDto['sites']): Promise<void> {
  await Promise.all(
    siteRows.map(async (site) => {
      const connected = site.integrationHealth === 'healthy' || site.integrationHealth === 'warning';
      await api.post(`/sites/${site.siteId}/monitoring/alerts/evaluate`, { gscHealthy: connected, wordpressHealthy: connected, traffic: site.clicksChange !== null && site.clicksChange < 0 ? { clicks: site.clicks, prevClicks: Math.max(1, Math.round(site.clicks / (1 + site.clicksChange / 100))) } : undefined }).catch(() => undefined);
    }),
  );
}
