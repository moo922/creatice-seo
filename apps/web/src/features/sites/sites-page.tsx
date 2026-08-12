import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Plus } from 'lucide-react';
import type { CreateSiteRequest, OrganizationDto, Paginated, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline'> = {
  ACTIVE: 'default',
  PAUSED: 'secondary',
  ARCHIVED: 'outline',
};

export function SitesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Paginated<SiteDto>>('/sites?perPage=50'),
  });

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateSiteRequest) => api.post<SiteDto>('/sites', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  });

  const sites = sitesQuery.data?.data ?? [];
  const canCreate = hasPermission('sites:create');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sites.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {sitesQuery.data?.meta.total ?? 0} ·{' '}
            <Link to="/" className="underline-offset-2 hover:underline">
              {t('nav.portfolio')}
            </Link>
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => document.getElementById('create-site')?.scrollIntoView({ behavior: 'smooth' })}>
            <Plus className="size-4" />
            {t('sites.newSite')}
          </Button>
        )}
      </div>

      {canCreate && (
        <CreateSiteForm
          organizations={organizationsQuery.data ?? []}
          submitting={createMutation.isPending}
          error={createMutation.isError ? t('sites.error') : null}
          onSubmit={(body) => createMutation.mutate(body)}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {sitesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sites.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('sites.empty')}</p>
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
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell className="text-muted-foreground">{site.domain}</TableCell>
                    <TableCell className="text-muted-foreground">{site.organizationId}</TableCell>
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

function CreateSiteForm({
  organizations,
  submitting,
  error,
  onSubmit,
}: {
  organizations: OrganizationDto[];
  submitting: boolean;
  error: string | null;
  onSubmit: (body: CreateSiteRequest) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!organizationId) return;
    onSubmit({ name, domain, organizationId });
  };

  return (
    <Card id="create-site">
      <CardHeader>
        <CardTitle>{t('sites.createTitle')}</CardTitle>
        <CardDescription>{t('sites.createDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="site-name">{t('sites.name')}</Label>
            <Input
              id="site-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-domain">{t('sites.domain')}</Label>
            <Input
              id="site-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-organization">{t('sites.organization')}</Label>
            <Select
              id="site-organization"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              required
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={submitting || organizations.length === 0}>
              {submitting ? t('common.loading') : t('sites.create')}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive sm:col-span-4">{error}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
