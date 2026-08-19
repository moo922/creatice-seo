import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Archive, Building2, Globe, Pause, Play, RotateCcw } from 'lucide-react';
import type { OrganizationDto, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteDashboard } from './site-dashboard';
import { CrawlerTab } from './tabs/crawler-tab';
import { AuditTab } from './tabs/audit-tab';
import { ActivationTab } from './tabs/activation-tab';
import { KeywordsTab } from './tabs/keywords-tab';
import { ContentTab } from './tabs/content-tab';
import { LinksTab } from './tabs/links-tab';
import { ReportsTab } from './tabs/reports-tab';
import { SettingsTab } from './tabs/settings-tab';
import { AeoTab } from './tabs/aeo-tab';
import { GeoTab } from './tabs/geo-tab';

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline' | 'paused' | 'archived'> = {
  ACTIVE: 'default',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
};

export function SiteDetailPage() {
  const { siteId = '' } = useParams();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'overview';
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<SiteDto>(`/sites/${siteId}`),
  });

  const site = siteQuery.data;

  const invalidateSite = () => queryClient.invalidateQueries({ queryKey: ['site', siteId] });

  const statusMutation = useMutation({
    mutationFn: (status: SiteDto['status']) => api.patch<SiteDto>(`/sites/${siteId}`, { status }),
    onSuccess: () => {
      invalidateSite();
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    enabled: Boolean(site?.organizationId),
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const client = site?.organizationId
    ? organizationsQuery.data?.find((org) => org.id === site.organizationId)
    : undefined;

  const canUpdate = hasPermission('sites:update');
  const canDelete = hasPermission('sites:delete');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/sites" aria-label={t('common.back')}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          {site ? (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
              <Badge variant={STATUS_VARIANT[site.status]}>{site.status}</Badge>
            </div>
          ) : (
            <Skeleton className="h-8 w-56" />
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Globe className="size-3.5" />
              {site?.domain ?? '…'}
            </span>
            {client ? (
              <Link
                to={`/clients?id=${client.id}`}
                className="flex items-center gap-1.5 hover:text-foreground hover:underline"
              >
                <Building2 className="size-3.5" />
                {client.name}
              </Link>
            ) : null}
          </div>
        </div>
        {site && (
          <div className="flex items-center gap-2">
            {canUpdate && site.status === 'ACTIVE' && (
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate('PAUSED')} disabled={statusMutation.isPending}>
                <Pause className="size-4" />
                {t('sites.pause', 'Pause Site')}
              </Button>
            )}
            {canUpdate && site.status === 'PAUSED' && (
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate('ACTIVE')} disabled={statusMutation.isPending}>
                <Play className="size-4" />
                {t('sites.resume', 'Resume Site')}
              </Button>
            )}
            {canDelete && site.status === 'ARCHIVED' && (
              <Button variant="outline" size="sm" onClick={() => statusMutation.mutate('ACTIVE')} disabled={statusMutation.isPending}>
                <RotateCcw className="size-4" />
                {t('sites.restore', 'Restore Site')}
              </Button>
            )}
            {canDelete && site.status !== 'ARCHIVED' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setArchiveConfirmOpen(true)}>
                  <Archive className="size-4" />
                  {t('sites.archive', 'Archive')}
                </Button>
                {archiveConfirmOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Card className="w-full max-w-sm mx-4">
                      <CardHeader>
                        <CardTitle>{t('sites.archiveConfirmTitle', 'Archive this site?')}</CardTitle>
                        <CardDescription>
                          {t('sites.archiveConfirmDescription', 'The site will be deactivated but can be restored later.')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setArchiveConfirmOpen(false)}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={statusMutation.isPending}
                          onClick={() => {
                            statusMutation.mutate('ARCHIVED');
                            setArchiveConfirmOpen(false);
                          }}
                        >
                          {t('sites.archive', 'Archive')}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {siteQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('siteDetail.error')}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={initialTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">{t('sites.overview')}</TabsTrigger>
            <TabsTrigger value="crawler">{t('siteDetail.crawler')}</TabsTrigger>
            <TabsTrigger value="audit">{t('siteDetail.audit')}</TabsTrigger>
            <TabsTrigger value="activation">{t('siteDetail.activation')}</TabsTrigger>
            <TabsTrigger value="keywords">{t('siteDetail.keywords')}</TabsTrigger>
            <TabsTrigger value="content">{t('siteDetail.content')}</TabsTrigger>
            <TabsTrigger value="links">{t('siteDetail.links')}</TabsTrigger>
            <TabsTrigger value="aeo">AEO</TabsTrigger>
            <TabsTrigger value="geo">GEO</TabsTrigger>
            <TabsTrigger value="reports">{t('siteDetail.reports')}</TabsTrigger>
            <TabsTrigger value="settings">{t('nav.settings')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <SiteDashboard siteId={siteId} />
          </TabsContent>

          <TabsContent value="crawler">
            <CrawlerTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="activation">
            <ActivationTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="keywords">
            <KeywordsTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="content">
            <ContentTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="links">
            <LinksTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="aeo">
            <AeoTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="geo">
            <GeoTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab siteId={siteId} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab siteId={siteId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
