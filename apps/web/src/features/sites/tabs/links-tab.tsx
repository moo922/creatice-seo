import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2, Play, X } from 'lucide-react';
import type { LinkSuggestionDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';

const STATUSES = ['', 'SUGGESTED', 'APPROVED', 'APPLIED', 'VERIFIED', 'REJECTED'];

export function LinksTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const suggestionsQuery = useQuery({
    queryKey: ['link-suggestions', siteId, status],
    queryFn: () => api.get<LinkSuggestionDto[]>(`/sites/${siteId}/links/suggestions${status ? `?status=${status}` : ''}`),
  });

  const mutate = useMutation({
    mutationFn: ({ id, action, found }: { id: string; action: 'approve' | 'apply' | 'verify' | 'reject'; found?: boolean }) => {
      if (action === 'verify') return api.post<LinkSuggestionDto>(`/sites/${siteId}/links/suggestions/${id}/verify`, { found: found ?? true });
      return api.post<LinkSuggestionDto>(`/sites/${siteId}/links/suggestions/${id}/${action}`, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['link-suggestions'] }),
  });

  const suggestions = suggestionsQuery.data ?? [];
  const canManage = hasPermission('links:manage');

  return (
    <div className="space-y-6">
      <div className="w-64 space-y-1.5">
        <Label htmlFor="link-status">{t('issues.status')}</Label>
        <Select id="link-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {item === '' ? 'All' : item}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('siteDetail.links')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suggestions.length === 0 ? (
            <EmptyState message="No link suggestions yet. Run an audit first." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source → Target</TableHead>
                  <TableHead>Anchor</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>{t('issues.status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((suggestion) => (
                  <TableRow key={suggestion.id}>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">{suggestion.sourceUrl}</div>
                      <div className="text-xs">→ {suggestion.targetUrl}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{suggestion.reason}</div>
                    </TableCell>
                    <TableCell className="text-sm">{suggestion.anchor}</TableCell>
                    <TableCell>{Math.round(suggestion.confidence * 100)}%</TableCell>
                    <TableCell>
                      <StatusBadge status={suggestion.status} />
                    </TableCell>
                    <TableCell className="text-end">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          {suggestion.status === 'SUGGESTED' ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => mutate.mutate({ id: suggestion.id, action: 'approve' })}>
                                <Check className="size-3.5" />
                                {t('common.approve')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ id: suggestion.id, action: 'reject' })}>
                                <X className="size-3.5" />
                                {t('common.reject')}
                              </Button>
                            </>
                          ) : null}
                          {suggestion.status === 'APPROVED' ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => mutate.mutate({ id: suggestion.id, action: 'apply' })}>
                                <Play className="size-3.5" />
                                {t('common.apply')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ id: suggestion.id, action: 'reject' })}>
                                <X className="size-3.5" />
                                {t('common.reject')}
                              </Button>
                            </>
                          ) : null}
                          {suggestion.status === 'APPLIED' ? (
                            <Button size="sm" variant="outline" onClick={() => mutate.mutate({ id: suggestion.id, action: 'verify' })}>
                              <CheckCircle2 className="size-3.5" />
                              {t('common.verify')}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
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
