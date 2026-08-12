import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Globe } from 'lucide-react';
import type { ClientSiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';

export function ClientPortalPage() {
  const { t } = useTranslation();
  const sitesQuery = useQuery({
    queryKey: ['client-sites'],
    queryFn: () => api.get<ClientSiteDto[]>('/client/sites'),
  });
  const sites = sitesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('client.title')} description={t('client.subtitle')} />
      {sites.length === 0 ? (
        <EmptyState message={t('client.noSites')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" />
                  {site.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{site.domain}</p>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/client/sites/${site.id}`}>
                    {t('common.open')}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
