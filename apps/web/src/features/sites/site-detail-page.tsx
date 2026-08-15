import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Globe } from 'lucide-react';
import type { OrganizationDto, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline'> = {
  ACTIVE: 'default',
  PAUSED: 'secondary',
  ARCHIVED: 'outline',
};

export function SiteDetailPage() {
  const { siteId = '' } = useParams();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'overview';

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<SiteDto>(`/sites/${siteId}`),
  });

  const site = siteQuery.data;

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    enabled: Boolean(site?.organizationId),
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const client = site?.organizationId
    ? organizationsQuery.data?.find((org) => org.id === site.organizationId)
    : undefined;

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
