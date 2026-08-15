import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { OrganizationDto, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ClientsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const clientsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const sitesOf = useQuery({
    queryKey: ['organization-sites', expanded],
    enabled: Boolean(expanded),
    queryFn: () => api.get<SiteDto[]>(`/organizations/${expanded}/sites`),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<OrganizationDto>('/organizations', { name }),
    onSuccess: () => {
      setShowCreate(false);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const clients = clientsQuery.data ?? [];
  const canManage = hasPermission('organizations:manage');
  const canCreate = canManage;

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('clients.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} · {t('clients.subtitle')}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="size-4" />
            {t('clients.newClient')}
          </Button>
        )}
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{t('clients.createTitle')}</CardTitle>
            <CardDescription>{t('clients.createDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitCreate} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="client-name">{t('clients.nameLabel')}</Label>
                <Input id="client-name" value={newName} onChange={(event) => setNewName(event.target.value)} required />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t('common.loading') : t('clients.create')}
                </Button>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive sm:col-span-2">{t('clients.error')}</p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {clientsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : clients.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('clients.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>{t('clients.name')}</TableHead>
                  <TableHead>{t('clients.sites')}</TableHead>
                  <TableHead>{t('clients.status')}</TableHead>
                  <TableHead>{t('clients.created')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    expanded={expanded === client.id}
                    onToggle={() => setExpanded(expanded === client.id ? null : client.id)}
                    sites={expanded === client.id ? (sitesOf.data ?? null) : null}
                    sitesLoading={expanded === client.id && sitesOf.isLoading}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientRow({
  client,
  expanded,
  onToggle,
  sites,
  sitesLoading,
}: {
  client: OrganizationDto;
  expanded: boolean;
  onToggle: () => void;
  sites: SiteDto[] | null;
  sitesLoading: boolean;
}) {
  const { t } = useTranslation();
  const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    ACTIVE: 'default',
    SUSPENDED: 'secondary',
    ARCHIVED: 'outline',
  };

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </TableCell>
        <TableCell className="font-medium">{client.name}</TableCell>
        <TableCell className="text-muted-foreground">{client.siteCount}</TableCell>
        <TableCell>
          <Badge variant={statusVariant[client.status]}>{client.status}</Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {new Date(client.createdAt).toLocaleDateString()}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30">
            <div className="space-y-3 p-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('clients.details')}</span>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/sites/new?organizationId=${client.id}`}>
                    <Plus className="size-3.5" />
                    {t('clients.addSite')}
                  </Link>
                </Button>
              </div>
              {sitesLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : sites === null ? null : sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('clients.noSites')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sites.name')}</TableHead>
                      <TableHead>{t('sites.domain')}</TableHead>
                      <TableHead>{t('sites.status')}</TableHead>
                      <TableHead className="text-end">{t('common.open')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell className="font-medium">{site.name}</TableCell>
                        <TableCell className="text-muted-foreground">{site.domain}</TableCell>
                        <TableCell>
                          <Badge variant={site.status === 'ACTIVE' ? 'default' : 'secondary'}>{site.status}</Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/sites/${site.id}`}>{t('common.open')}</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
