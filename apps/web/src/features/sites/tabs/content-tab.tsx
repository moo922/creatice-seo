import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Play, X } from 'lucide-react';
import type { ContentPackageDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

export function ContentTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [selected, setSelected] = useState<ContentPackageDto | null>(null);

  const packagesQuery = useQuery({
    queryKey: ['content-packages', siteId],
    queryFn: () => api.get<ContentPackageDto[]>(`/sites/${siteId}/content/packages`),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post<ContentPackageDto>(`/sites/${siteId}/content/pipeline`, { primaryKeyword, language: 'en' }),
    onSuccess: (pkg) => {
      queryClient.invalidateQueries({ queryKey: ['content-packages'] });
      setSelected(pkg);
      setPrimaryKeyword('');
    },
  });

  const briefMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post<ContentPackageDto>(`/sites/${siteId}/content/packages/${id}/brief/${approve ? 'approve' : 'reject'}`, {}),
    onSuccess: (pkg) => {
      queryClient.invalidateQueries({ queryKey: ['content-packages'] });
      setSelected(pkg);
    },
  });

  const canManage = hasPermission('content:manage');
  const packages = packagesQuery.data ?? [];

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Content pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex max-w-lg gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="content-kw">Primary keyword</Label>
                <Input id="content-kw" value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder="e.g. seo services" />
              </div>
              <Button className="self-end" onClick={() => runMutation.mutate()} disabled={!primaryKeyword || runMutation.isPending}>
                <Play className="size-4" />
                {t('common.run')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Content packages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {packages.length === 0 ? (
            <EmptyState message="No content packages yet. Run the pipeline to create one." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Primary keyword</TableHead>
                  <TableHead>{t('issues.status')}</TableHead>
                  <TableHead>SEO</TableHead>
                  <TableHead>AEO</TableHead>
                  <TableHead>GEO</TableHead>
                  <TableHead className="text-end">{t('common.open')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id} className={selected?.id === pkg.id ? 'bg-muted/40' : ''}>
                    <TableCell className="font-medium">{pkg.seoTitle || pkg.brief?.title || pkg.primaryKeyword}</TableCell>
                    <TableCell className="text-muted-foreground">{pkg.primaryKeyword}</TableCell>
                    <TableCell>
                      <StatusBadge status={pkg.status} />
                    </TableCell>
                    <TableCell>{pkg.scores?.seo?.overallScore ?? '—'}</TableCell>
                    <TableCell>{pkg.scores?.aeo?.overallScore ?? '—'}</TableCell>
                    <TableCell>{pkg.scores?.geo?.overallScore ?? '—'}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(selected?.id === pkg.id ? null : pkg)}>
                        {t('common.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected ? <PackageDetail pkg={selected} onBrief={(approve) => briefMutation.mutate({ id: selected.id, approve })} canManage={Boolean(canManage)} /> : null}
    </div>
  );
}

function PackageDetail({ pkg, onBrief, canManage }: { pkg: ContentPackageDto; onBrief: (approve: boolean) => void; canManage: boolean }) {
  const gate = pkg.briefGate;
  const awaiting = pkg.status === 'AWAITING_APPROVAL';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{pkg.seoTitle || pkg.brief?.title || pkg.primaryKeyword}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">SEO</div>
            <div className="text-lg font-semibold">{pkg.scores?.seo?.overallScore ?? '—'}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">AEO</div>
            <div className="text-lg font-semibold">{pkg.scores?.aeo?.overallScore ?? '—'}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">GEO</div>
            <div className="text-lg font-semibold">{pkg.scores?.geo?.overallScore ?? '—'}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-xs text-muted-foreground">Factual</div>
            <div className="text-lg font-semibold">{pkg.scores?.factual?.overallScore ?? '—'}</div>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium">Brief gate</div>
          <p className="text-sm text-muted-foreground">
            {gate.approved ? 'Approved' : 'Not approved'} · score {gate.score}
            {gate.blockers.length > 0 ? ` · ${gate.blockers.join('; ')}` : ''}
          </p>
        </div>

        {awaiting && canManage ? (
          <div className="flex gap-2">
            <Button onClick={() => onBrief(true)}>
              <Check className="size-4" />
              {tCommonApprove()}
            </Button>
            <Button variant="outline" onClick={() => onBrief(false)}>
              <X className="size-4" />
              Reject
            </Button>
          </div>
        ) : null}

        {pkg.htmlContent ? (
          <div>
            <div className="text-sm font-medium">Content</div>
            <div className="max-h-64 overflow-auto rounded-md border p-3 text-sm" dangerouslySetInnerHTML={{ __html: pkg.htmlContent }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function tCommonApprove(): string {
  return 'Approve';
}
