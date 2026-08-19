import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MoreHorizontal, Pause, Play, Plus, Power, PowerOff, Trash2, Unlink } from 'lucide-react';
import type { CreateSiteRequest, OrganizationDto, Paginated, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const STATUS_VARIANT: Record<SiteDto['status'], 'default' | 'secondary' | 'outline' | 'paused' | 'archived'> = {
  ACTIVE: 'default',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
};

export function SitesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const invalidateSites = () => queryClient.invalidateQueries({ queryKey: ['sites'] });

  const statusMutation = useMutation({
    mutationFn: ({ siteId, status }: { siteId: string; status: SiteDto['status'] }) =>
      api.patch<SiteDto>(`/sites/${siteId}`, { status }),
    onSuccess: invalidateSites,
  });

  const purgeMutation = useMutation({
    mutationFn: ({ siteId, confirmDomain }: { siteId: string; confirmDomain: string }) =>
      api.post(`/sites/${siteId}/purge`, { confirmDomain }),
    onSuccess: invalidateSites,
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateSiteRequest) => api.post<SiteDto>('/sites', body),
    onSuccess: invalidateSites,
  });

  const sites = sitesQuery.data?.data ?? [];
  const canCreate = hasPermission('sites:create');
  const canUpdate = hasPermission('sites:update');
  const canDelete = hasPermission('sites:delete');
  const canPurge = hasPermission('sites:purge');

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
                    <TableCell className="text-muted-foreground">
                      {orgMap.get(site.organizationId) ?? site.organizationId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[site.status]}>{site.status}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <SiteActionsDropdown
                        site={site}
                        canUpdate={canUpdate}
                        canDelete={canDelete}
                        canPurge={canPurge}
                        onStatusChange={(status) => statusMutation.mutate({ siteId: site.id, status })}
                        onPurge={(confirmDomain) => purgeMutation.mutate({ siteId: site.id, confirmDomain })}
                        onOpen={() => navigate(`/sites/${site.id}`)}
                      />
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

function SiteActionsDropdown({
  site,
  canUpdate,
  canDelete,
  canPurge,
  onStatusChange,
  onPurge,
  onOpen,
}: {
  site: SiteDto;
  canUpdate: boolean;
  canDelete: boolean;
  canPurge: boolean;
  onStatusChange: (status: SiteDto['status']) => void;
  onPurge: (confirmDomain: string) => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const confirmEnabled = confirmInput.trim() === site.domain;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>
            <ExternalLink className="size-4" />
            {t('common.open')}
          </DropdownMenuItem>
          {canUpdate && site.status === 'ACTIVE' && (
            <DropdownMenuItem onClick={() => onStatusChange('PAUSED')}>
              <Pause className="size-4" />
              {t('sites.pause', 'Pause')}
            </DropdownMenuItem>
          )}
          {canUpdate && site.status === 'PAUSED' && (
            <DropdownMenuItem onClick={() => onStatusChange('ACTIVE')}>
              <Play className="size-4" />
              {t('sites.resume', 'Resume')}
            </DropdownMenuItem>
          )}
          {canDelete && site.status !== 'ARCHIVED' && (
            <DropdownMenuItem onClick={() => onStatusChange('ARCHIVED')}>
              <PowerOff className="size-4" />
              {t('sites.archive', 'Archive')}
            </DropdownMenuItem>
          )}
          {canDelete && site.status === 'ARCHIVED' && (
            <DropdownMenuItem onClick={() => onStatusChange('ACTIVE')}>
              <Power className="size-4" />
              {t('sites.restore', 'Restore')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to={`/sites/${site.id}?tab=settings`}>
              <Unlink className="size-4" />
              {t('sites.manageConnections', 'Manage Connections')}
            </Link>
          </DropdownMenuItem>
          {canPurge && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  setConfirmInput('');
                  setPurgeOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                {t('sites.delete', 'Delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {purgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{t('sites.purgeTitle', 'Permanently delete site')}</CardTitle>
              <CardDescription>
                {t('sites.purgeDescription', 'This action cannot be undone. Type the domain to confirm:')}{' '}
                <strong>{site.domain}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder={site.domain}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPurgeOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={!confirmEnabled}
                  onClick={() => {
                    onPurge(site.domain);
                    setPurgeOpen(false);
                  }}
                >
                  {t('sites.purge', 'Delete permanently')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
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
