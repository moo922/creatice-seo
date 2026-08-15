import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_VERIFICATION_STATUSES,
} from '@creative-seo/types';
import type {
  CreateKnowledgeFactRequest,
  KnowledgeCategory,
  KnowledgeFactDto,
  KnowledgeVerificationStatus,
  Paginated,
  SiteDto,
} from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_VARIANT: Record<KnowledgeVerificationStatus, 'default' | 'secondary' | 'outline'> = {
  VERIFIED: 'default',
  UNVERIFIED: 'secondary',
  INFERRED: 'outline',
  EXTERNAL: 'secondary',
};

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [siteFilter, setSiteFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState<KnowledgeFactDto | 'new' | null>(null);

  const factsQuery = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => api.get<KnowledgeFactDto[]>('/knowledge?perPage=500'),
  });

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Paginated<SiteDto>>('/sites?perPage=100'),
  });

  const deleteMutation = useMutation({
    mutationFn: (fact: KnowledgeFactDto) => api.delete(`/sites/${fact.siteId}/knowledge/${fact.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const facts = factsQuery.data ?? [];
  const sites = sitesQuery.data?.data ?? [];
  const siteName = (siteId: string) => sites.find((site) => site.id === siteId)?.name ?? siteId;
  const canManage = hasPermission('knowledge:manage');

  const visibleFacts = facts.filter(
    (fact) =>
      (!siteFilter || fact.siteId === siteFilter) &&
      (!categoryFilter || fact.category === categoryFilter),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookOpen className="size-6 text-primary" />
            {t('knowledge.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('knowledge.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('knowledge.addFact')}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('knowledge.site')}</Label>
          <Select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
            <option value="">{t('knowledge.allSites')}</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('knowledge.category')}</Label>
          <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">{t('knowledge.allCategories')}</option>
            {KNOWLEDGE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`knowledge.categories.${category}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {editing && (
        <FactForm
          fact={editing === 'new' ? null : editing}
          sites={sites}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['knowledge'] });
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('knowledge.fact')}</CardTitle>
          <CardDescription>
            {visibleFacts.length} · {t('knowledge.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {factsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : visibleFacts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('knowledge.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('knowledge.site')}</TableHead>
                  <TableHead>{t('knowledge.category')}</TableHead>
                  <TableHead>{t('knowledge.key')}</TableHead>
                  <TableHead>{t('knowledge.value')}</TableHead>
                  <TableHead>{t('knowledge.verificationStatus')}</TableHead>
                  <TableHead>{t('knowledge.updated')}</TableHead>
                  {canManage && <TableHead className="text-end">{t('common.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFacts.map((fact) => (
                  <TableRow key={fact.id}>
                    <TableCell className="text-sm text-muted-foreground">{siteName(fact.siteId)}</TableCell>
                    <TableCell className="text-sm">{t(`knowledge.categories.${fact.category}`)}</TableCell>
                    <TableCell className="font-mono text-xs">{fact.key}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className="truncate text-sm" title={fact.value}>
                        {fact.value}
                      </div>
                      {fact.source && (
                        <div className="text-xs text-muted-foreground">source: {fact.source}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[fact.verificationStatus]}>
                        {t(`knowledge.verification.${fact.verificationStatus}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(fact.updatedAt).toLocaleDateString()}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(fact)} aria-label={t('knowledge.editFact')}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(fact)}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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

function FactForm({
  fact,
  sites,
  onCancel,
  onSaved,
}: {
  fact: KnowledgeFactDto | null;
  sites: SiteDto[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState(fact?.siteId ?? sites[0]?.id ?? '');
  const [category, setCategory] = useState<KnowledgeCategory>(fact?.category ?? 'COMPANY');
  const [key, setKey] = useState(fact?.key ?? '');
  const [value, setValue] = useState(fact?.value ?? '');
  const [verificationStatus, setVerificationStatus] = useState<KnowledgeVerificationStatus>(
    fact?.verificationStatus ?? 'UNVERIFIED',
  );
  const [source, setSource] = useState(fact?.source ?? '');
  const [notes, setNotes] = useState(fact?.notes ?? '');

  const saveMutation = useMutation({
    mutationFn: (body: CreateKnowledgeFactRequest) =>
      fact
        ? api.patch<KnowledgeFactDto>(`/sites/${fact.siteId}/knowledge/${fact.id}`, body)
        : api.post<KnowledgeFactDto>(`/sites/${siteId}/knowledge`, body),
    onSuccess: onSaved,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({
      category,
      key: key.trim(),
      value: value.trim(),
      verificationStatus,
      source: source.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{fact ? t('knowledge.editTitle') : t('knowledge.createTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('knowledge.site')}</Label>
            <Select value={siteId} onChange={(event) => setSiteId(event.target.value)} disabled={Boolean(fact)} required>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('knowledge.category')}</Label>
            <Select value={category} onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}>
              {KNOWLEDGE_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {t(`knowledge.categories.${entry}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('knowledge.key')}</Label>
            <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="founded_year" required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('knowledge.verificationStatus')}</Label>
            <Select
              value={verificationStatus}
              onChange={(event) => setVerificationStatus(event.target.value as KnowledgeVerificationStatus)}
            >
              {KNOWLEDGE_VERIFICATION_STATUSES.map((entry) => (
                <option key={entry} value={entry}>
                  {t(`knowledge.verification.${entry}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('knowledge.value')}</Label>
            <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t('knowledge.source')}</Label>
            <Input value={source} onChange={(event) => setSource(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('knowledge.notes')}</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {saveMutation.isError && <p className="text-sm text-destructive sm:col-span-2">{t('knowledge.error')}</p>}
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
