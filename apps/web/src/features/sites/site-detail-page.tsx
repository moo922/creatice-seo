import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe } from 'lucide-react';
import type { SiteDto, SiteMembershipDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline'> = {
  ACTIVE: 'default',
  PAUSED: 'secondary',
  ARCHIVED: 'outline',
};

export function SiteDetailPage() {
  const { siteId = '' } = useParams();
  const { t } = useTranslation();

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<SiteDto>(`/sites/${siteId}`),
  });

  const membersQuery = useQuery({
    queryKey: ['site', siteId, 'members'],
    enabled: Boolean(siteId),
    queryFn: () => api.get<SiteMembershipDto[]>(`/sites/${siteId}/members`),
  });

  const site = siteQuery.data;

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
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="size-3.5" />
            <span>{site?.domain ?? '…'}</span>
          </div>
        </div>
      </div>

      {siteQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('siteDetail.error')}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto justify-start gap-1">
            <TabsTrigger value="overview">{t('sites.overview')}</TabsTrigger>
            <TabsTrigger value="crawler">{t('siteDetail.crawler')}</TabsTrigger>
            <TabsTrigger value="audit">{t('siteDetail.audit')}</TabsTrigger>
            <TabsTrigger value="keywords">{t('siteDetail.keywords')}</TabsTrigger>
            <TabsTrigger value="content">{t('siteDetail.content')}</TabsTrigger>
            <TabsTrigger value="links">{t('siteDetail.links')}</TabsTrigger>
            <TabsTrigger value="reports">{t('siteDetail.reports')}</TabsTrigger>
            <TabsTrigger value="settings">{t('nav.settings')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t('sites.overview')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <MetaRow label={t('sites.organization')} value={site?.organizationId ?? '…'} />
                  <MetaRow label={t('sites.locale')} value={site?.locale ?? '—'} />
                  <MetaRow label={t('sites.language')} value={site?.language ?? '—'} />
                  <MetaRow label={t('sites.country')} value={site?.country ?? '—'} />
                  <MetaRow label={t('sites.createdAt')} value={site ? new Date(site.createdAt).toLocaleDateString() : '—'} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('sites.members')}</CardTitle>
                  <CardDescription>
                    {(membersQuery.data ?? []).length}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {membersQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (membersQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    (membersQuery.data ?? []).map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">{member.userId}</span>
                        <Badge variant="secondary">{member.siteRole}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="crawler">
            <ModulePlaceholder name={t('siteDetail.crawler')} />
          </TabsContent>
          <TabsContent value="audit">
            <ModulePlaceholder name={t('siteDetail.audit')} />
          </TabsContent>
          <TabsContent value="keywords">
            <ModulePlaceholder name={t('siteDetail.keywords')} />
          </TabsContent>
          <TabsContent value="content">
            <ModulePlaceholder name={t('siteDetail.content')} />
          </TabsContent>
          <TabsContent value="links">
            <ModulePlaceholder name={t('siteDetail.links')} />
          </TabsContent>
          <TabsContent value="reports">
            <ModulePlaceholder name={t('siteDetail.reports')} />
          </TabsContent>
          <TabsContent value="settings">
            <ModulePlaceholder name={t('nav.settings')} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
