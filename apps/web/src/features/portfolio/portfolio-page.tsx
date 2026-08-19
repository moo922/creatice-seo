import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Globe } from 'lucide-react';
import type { OrganizationDto, Paginated, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline' | 'paused' | 'archived'> = {
  ACTIVE: 'default',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
};

export function PortfolioPage() {
  const { t } = useTranslation();
  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Paginated<SiteDto>>('/sites?perPage=50'),
  });

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const orgMap = useMemo(() => {
    const map = new Map<string, string>();
    organizationsQuery.data?.forEach((org) => map.set(org.id, org.name));
    return map;
  }, [organizationsQuery.data]);

  const sites = sitesQuery.data?.data ?? [];
  const total = sitesQuery.data?.meta.total ?? 0;
  const counts = {
    active: sites.filter((site) => site.status === 'ACTIVE').length,
    paused: sites.filter((site) => site.status === 'PAUSED').length,
    archived: sites.filter((site) => site.status === 'ARCHIVED').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('portfolio.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('portfolio.description')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('portfolio.totalSites')} value={total} />
        <StatCard label={t('portfolio.activeSites')} value={counts.active} />
        <StatCard label={t('portfolio.pausedSites')} value={counts.paused} />
        <StatCard label={t('portfolio.archivedSites')} value={counts.archived} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('portfolio.recentSites')}</CardTitle>
          <CardDescription>
            {t('sites.title')} · {total}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sitesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('portfolio.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sites.name')}</TableHead>
                  <TableHead>{t('sites.domain')}</TableHead>
                  <TableHead>{t('sites.organization')}</TableHead>
                  <TableHead>{t('sites.status')}</TableHead>
                  <TableHead className="text-end">{t('common.open')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.slice(0, 10).map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell className="text-muted-foreground">{site.domain}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {orgMap.get(site.organizationId) ?? site.organizationId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[site.status]}>{site.status}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/sites/${site.id}`}>
                          {t('common.open')}
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Button>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Globe className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
