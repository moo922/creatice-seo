import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { CrawledPageDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';

export function CrawlerTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [outLinks, setOutLinks] = useState('');
  const [title, setTitle] = useState('');

  const pagesQuery = useQuery({
    queryKey: ['crawl-pages', siteId],
    queryFn: () => api.get<CrawledPageDto[]>(`/sites/${siteId}/links/crawl-pages`),
  });

  const ingestMutation = useMutation({
    mutationFn: () =>
      api.post<CrawledPageDto>(`/sites/${siteId}/links/crawl-pages`, {
        url,
        title: title || null,
        httpStatus: 200,
        text,
        outLinks: parseOutLinks(outLinks),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crawl-pages'] });
      setUrl('');
      setText('');
      setOutLinks('');
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('siteDetail.crawler')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crawl-url">URL</Label>
              <Input id="crawl-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/page" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crawl-title">Title</Label>
              <Input id="crawl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crawl-text">Content text</Label>
              <Textarea id="crawl-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crawl-links">Outgoing links (JSON, [{`{"url","anchor"}`}])</Label>
              <Textarea id="crawl-links" value={outLinks} onChange={(e) => setOutLinks(e.target.value)} rows={3} placeholder='[{"url":"https://example.com/x","anchor":"anchor text"}]' />
            </div>
            <Button onClick={() => ingestMutation.mutate()} disabled={!url || ingestMutation.isPending}>
              <Plus className="size-4" />
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crawled pages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(pagesQuery.data ?? []).length === 0 ? (
            <EmptyState message="No crawled pages yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead>Out links</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Crawled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pagesQuery.data ?? []).map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.url}</TableCell>
                    <TableCell>{page.wordCount}</TableCell>
                    <TableCell>{page.outLinks?.length ?? 0}</TableCell>
                    <TableCell>{page.httpStatus ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{page.crawledAt ? new Date(page.crawledAt).toLocaleString() : '—'}</TableCell>
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

function parseOutLinks(value: string): Array<{ url: string; anchor: string }> {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { url: string; anchor: string } => item && typeof item.url === 'string')
      .map((item) => ({ url: item.url, anchor: String(item.anchor ?? '') }));
  } catch {
    return [];
  }
}
