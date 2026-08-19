import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Clock, Eye, FileText, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import type { ContentPackageDto, ContentPublicationDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SiteSelector } from '@/components/shared/site-selector';
import { StatusBadge } from '@/components/shared/status-badge';

const STAGE_ORDER = ['DRAFTING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'GENERATING', 'QA', 'PUBLISHING', 'PUBLISHED', 'VERIFIED'] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_META: Record<Stage, { label: string; color: string; icon: typeof FileText }> = {
  DRAFTING: { label: 'Drafting', color: 'bg-blue-100 text-blue-700', icon: FileText },
  AWAITING_APPROVAL: { label: 'Awaiting Approval', color: 'bg-amber-100 text-amber-700', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: Check },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: X },
  GENERATING: { label: 'Generating', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  QA: { label: 'QA', color: 'bg-orange-100 text-orange-700', icon: Eye },
  PUBLISHING: { label: 'Publishing', color: 'bg-indigo-100 text-indigo-700', icon: Play },
  PUBLISHED: { label: 'Published', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  VERIFIED: { label: 'Verified', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

export function ContentStudioPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [selectedPkg, setSelectedPkg] = useState<ContentPackageDto | null>(null);
  const [activeTab, setActiveTab] = useState('workflow');

  const packagesQuery = useQuery({
    queryKey: ['content-packages', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ContentPackageDto[]>(`/sites/${siteId}/content/packages`),
  });

  const publicationsQuery = useQuery({
    queryKey: ['content-publications', siteId],
    enabled: Boolean(siteId),
    queryFn: () => api.get<ContentPublicationDto[]>(`/sites/${siteId}/content/publications`),
  });

  const briefMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post<ContentPackageDto>(`/sites/${siteId}/content/packages/${id}/brief/${approve ? 'approve' : 'reject'}`, {}),
    onSuccess: (pkg) => {
      queryClient.invalidateQueries({ queryKey: ['content-packages'] });
      setSelectedPkg(pkg);
    },
  });

  const transitionPublication = useMutation({
    mutationFn: ({ id, step }: { id: string; step: 'approve' | 'publish' | 'verify' | 'rollback' }) =>
      api.post<ContentPublicationDto>(`/sites/${siteId}/content/publications/${id}/${step}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-publications'] }),
  });

  const packages = packagesQuery.data ?? [];
  const publications = publicationsQuery.data ?? [];
  const canManage = hasPermission('content:manage');

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pkg of packages) {
      counts[pkg.status] = (counts[pkg.status] ?? 0) + 1;
    }
    return counts;
  }, [packages]);

  const needsAttention = packages.filter((p) => p.status === 'AWAITING_APPROVAL' || p.status === 'REJECTED');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('contentStudio.title')}
        description={t('contentStudio.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ['content-packages'] })}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />

      <div className="w-64">
        <SiteSelector value={siteId} onChange={(v) => { setSiteId(v); setSelectedPkg(null); }} allowAll={false} />
      </div>

      {!siteId ? (
        <EmptyState message="Select a site to view its content studio." />
      ) : (
        <>
          {/* Stage summary */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {STAGE_ORDER.map((stage) => {
              const meta = STAGE_META[stage];
              const count = stageCounts[stage] ?? 0;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setActiveTab('workflow')}
                  className="text-start"
                >
                  <Card className={cn('transition-colors', count > 0 && 'border-primary/50')}>
                    <CardContent className="pt-3 pb-2">
                      <div className={cn('mb-1 inline-flex rounded p-1', meta.color)}>
                        <meta.icon className="size-3" />
                      </div>
                      <div className="text-lg font-semibold tabular-nums">{count}</div>
                      <div className="text-[10px] text-muted-foreground">{meta.label}</div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          {/* Attention needed */}
          {needsAttention.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="size-4" />
                  {needsAttention.length} content item(s) need your attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {needsAttention.map((pkg) => (
                    <Button
                      key={pkg.id}
                      size="sm"
                      variant="outline"
                      className="h-auto py-1.5"
                      onClick={() => { setSelectedPkg(pkg); setActiveTab('detail'); }}
                    >
                      {pkg.seoTitle || pkg.brief?.title || pkg.primaryKeyword}
                      <ChevronRight className="size-3" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="workflow">Editorial Workflow</TabsTrigger>
              <TabsTrigger value="publications">Publications</TabsTrigger>
              <TabsTrigger value="detail">Detail</TabsTrigger>
            </TabsList>

            <TabsContent value="workflow" className="mt-4">
              {packagesQuery.isLoading ? (
                <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
              ) : packages.length === 0 ? (
                <EmptyState message="No content packages yet. Use the Content tab on a site to create one." />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {packages.map((pkg) => {
                        const meta = STAGE_META[pkg.status as Stage] ?? STAGE_META.DRAFTING;
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => { setSelectedPkg(pkg); setActiveTab('detail'); }}
                            className="flex w-full items-center gap-4 px-4 py-3 text-start transition-colors hover:bg-muted/40"
                          >
                            <div className={cn('inline-flex rounded p-1.5', meta.color)}>
                              <meta.icon className="size-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{pkg.seoTitle || pkg.brief?.title || pkg.primaryKeyword}</div>
                              <div className="text-xs text-muted-foreground">{pkg.primaryKeyword}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <ScoreChips scores={pkg.scores} />
                              <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                              <ChevronRight className="size-4 text-muted-foreground" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="publications" className="mt-4">
              {publications.length === 0 ? (
                <EmptyState message="No publications yet." />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {publications.map((pub) => (
                        <div key={pub.id} className="flex items-center gap-4 px-4 py-3">
                          {pub.conflict?.detected ? (
                            <AlertTriangle className="size-4 text-destructive" />
                          ) : (
                            <CheckCircle2 className="size-4 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{pub.title}</div>
                            <div className="text-xs text-muted-foreground">WP #{pub.wpPostId ?? '—'}</div>
                          </div>
                          <StatusBadge status={pub.status} />
                          {pub.verification ? (
                            <VerificationBadges verification={pub.verification} />
                          ) : null}
                          {canManage ? (
                            <div className="flex gap-1">
                              {pub.status === 'DRAFT' && (
                                <Button size="sm" variant="outline" onClick={() => transitionPublication.mutate({ id: pub.id, step: 'approve' })}>
                                  <Check className="size-3" /> Approve
                                </Button>
                              )}
                              {pub.status === 'APPROVED' && (
                                <Button size="sm" variant="outline" onClick={() => transitionPublication.mutate({ id: pub.id, step: 'publish' })}>
                                  <Play className="size-3" /> Publish
                                </Button>
                              )}
                              {pub.status === 'PUBLISHED' && (
                                <Button size="sm" variant="outline" onClick={() => transitionPublication.mutate({ id: pub.id, step: 'verify' })}>
                                  <CheckCircle2 className="size-3" /> Verify
                                </Button>
                              )}
                              {['PUBLISHED', 'VERIFIED', 'FAILED'].includes(pub.status) && (
                                <Button size="sm" variant="outline" onClick={() => transitionPublication.mutate({ id: pub.id, step: 'rollback' })}>
                                  <RotateCcw className="size-3" />
                                </Button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="detail" className="mt-4">
              {selectedPkg ? (
                <ContentDetail
                  pkg={selectedPkg}
                  onBrief={(approve) => briefMutation.mutate({ id: selectedPkg.id, approve })}
                  canManage={Boolean(canManage)}
                />
              ) : (
                <EmptyState message="Select a content item from the workflow to view its details." />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ScoreChips({ scores }: { scores: ContentPackageDto['scores'] }) {
  if (!scores) return null;
  const items = [
    { label: 'SEO', value: scores.seo?.overallScore },
    { label: 'AEO', value: scores.aeo?.overallScore },
    { label: 'GEO', value: scores.geo?.overallScore },
  ];
  return (
    <div className="hidden items-center gap-1 lg:flex">
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            item.value == null ? 'bg-muted text-muted-foreground' :
            item.value >= 80 ? 'bg-green-50 text-green-700' :
            item.value >= 50 ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          )}
        >
          {item.label} {item.value ?? '—'}
        </span>
      ))}
    </div>
  );
}

function ContentDetail({ pkg, onBrief, canManage }: { pkg: ContentPackageDto; onBrief: (approve: boolean) => void; canManage: boolean }) {
  const gate = pkg.briefGate;
  const brief = pkg.brief;
  const meta = STAGE_META[pkg.status as Stage] ?? STAGE_META.DRAFTING;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>{pkg.seoTitle || brief?.title || pkg.primaryKeyword}</CardTitle>
            <CardDescription className="mt-1">
              <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
              <span className="ml-2">Primary keyword: {pkg.primaryKeyword}</span>
            </CardDescription>
          </div>
          <ScoreChips scores={pkg.scores} />
        </CardHeader>
      </Card>

      {/* Brief */}
      {brief && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Content Brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brief.title && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Title</div>
                <div className="text-sm">{brief.title}</div>
              </div>
            )}
            {brief.targetAudience && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Target Audience</div>
                <div className="text-sm">{brief.targetAudience}</div>
              </div>
            )}
            {brief.keyQuestions && brief.keyQuestions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Key Questions</div>
                <ul className="list-disc pl-4 text-sm">
                  {brief.keyQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {brief.secondaryKeywords && brief.secondaryKeywords.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Keywords</div>
                <div className="flex flex-wrap gap-1">
                  {brief.secondaryKeywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
            )}
            {brief.entities && brief.entities.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Entities</div>
                <div className="flex flex-wrap gap-1">
                  {brief.entities.map((entity, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{entity}</Badge>
                  ))}
                </div>
              </div>
            )}
            {brief.notes && brief.notes.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Notes</div>
                <ul className="list-disc pl-4 text-sm">
                  {brief.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Brief gate */}
            {gate && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className={gate.approved ? 'text-green-600' : 'text-amber-600'}>
                    {gate.approved ? 'Brief Approved' : 'Brief Not Approved'}
                  </span>
                  <span className="text-muted-foreground">Score: {gate.score}</span>
                </div>
                {gate.blockers.length > 0 && (
                  <div className="mt-1 text-xs text-destructive">
                    Blockers: {gate.blockers.join('; ')}
                  </div>
                )}
              </div>
            )}

            {/* Approve/Reject */}
            {pkg.status === 'AWAITING_APPROVAL' && canManage && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={() => onBrief(true)}>
                  <Check className="size-3.5" /> Approve Brief
                </Button>
                <Button size="sm" variant="outline" onClick={() => onBrief(false)}>
                  <X className="size-3.5" /> Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generated Content */}
      {pkg.htmlContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generated Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none rounded-md border p-4"
              dangerouslySetInnerHTML={{ __html: pkg.htmlContent }}
            />
          </CardContent>
        </Card>
      )}

      {/* QA Scores */}
      {pkg.scores && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quality Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(['seo', 'aeo', 'geo', 'factual'] as const).map((key) => {
                const score = pkg.scores[key];
                if (!score) return null;
                return (
                  <div key={key} className="rounded-md border p-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase">{key}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{score.overallScore}</div>
                    {score.recommendations && score.recommendations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {score.recommendations.slice(0, 3).map((rec, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            <span className={score.passed ? 'text-green-600' : 'text-amber-600'}>
                              {score.passed ? '○' : '◐'}
                            </span>{' '}
                            {rec}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VerificationBadges({ verification }: { verification: ContentPublicationDto['verification'] }) {
  if (!verification) return null;
  const items = [
    { label: 'Post', ok: verification.postStatus === 'publish' },
    { label: 'Title', ok: verification.titleMatch !== false },
    { label: 'Content', ok: verification.contentHashMatch !== false },
    { label: 'SEO', ok: verification.seoMetadataWritten !== false },
    { label: 'Page', ok: verification.renderedPageAccessible !== false },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
            item.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
