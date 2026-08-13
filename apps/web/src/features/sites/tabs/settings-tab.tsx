import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiProviderConfigDto, ReportBrandingDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';

const WORKFLOWS = ['research', 'clustering', 'brief', 'writer', 'arabic-qa', 'content-brief', 'content-draft', 'content-language', 'content-seo-validator', 'content-aeo-validator', 'content-geo-validator', 'content-qa'];
const PROVIDERS = ['OPENAI', 'ANTHROPIC', 'PERPLEXITY'];

export function SettingsTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('ai:manage');

  const aiQuery = useQuery({
    queryKey: ['ai-config', siteId],
    queryFn: () => api.get<AiProviderConfigDto>(`/sites/${siteId}/ai/config`),
  });

  const aiSaveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<AiProviderConfigDto>(`/sites/${siteId}/ai/config`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-config'] }),
  });

  const brandingQuery = useQuery({
    queryKey: ['report-branding', siteId],
    queryFn: () => api.get<ReportBrandingDto>(`/sites/${siteId}/reporting/branding`),
  });

  const brandingSaveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<ReportBrandingDto>(`/sites/${siteId}/reporting/branding`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-branding'] }),
  });

  const config = aiQuery.data;
  const branding = brandingQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI provider routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiQuery.isLoading ? <EmptyState message="Loading…" /> : !config ? (
            <EmptyState message="No AI config." />
          ) : (
            <AIConfigForm config={config} canManage={canManage} onSave={(body) => aiSaveMutation.mutate(body)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.branding')}</CardTitle>
        </CardHeader>
        <CardContent>
          {branding ? (
            <BrandingForm branding={branding} canManage={Boolean(canManage)} onSave={(body) => brandingSaveMutation.mutate(body)} />
          ) : (
            <EmptyState message="Loading…" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AIConfigForm({ config, canManage, onSave }: { config: AiProviderConfigDto; canManage: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(config.enabled);
  const [keys, setKeys] = useState<Record<string, string>>({ OPENAI: '', ANTHROPIC: '', PERPLEXITY: '' });
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    const overridesMap = config.workflowOverrides as Partial<Record<string, { provider?: string }>>;
    for (const workflow of WORKFLOWS) {
      result[workflow] = overridesMap[workflow]?.provider ?? '';
    }
    return result;
  });

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canManage} />
        AI generation enabled for this site
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        {(['OPENAI', 'ANTHROPIC', 'PERPLEXITY'] as const).map((provider) => (
          <div key={provider} className="space-y-1.5">
            <Label htmlFor={`ai-key-${provider}`}>
              {provider} API key{config.keyOverrides.includes(provider) ? ' (site key set)' : ' (global/env)'}
            </Label>
            <Input
              id={`ai-key-${provider}`}
              type="password"
              placeholder={config.keyOverrides.includes(provider) ? '••••••••' : 'sk-…'}
              value={keys[provider] ?? ''}
              disabled={!canManage}
              onChange={(e) => setKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Provider</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {WORKFLOWS.map((workflow) => (
            <TableRow key={workflow}>
              <TableCell className="font-medium">{workflow}</TableCell>
              <TableCell>
                <Select value={overrides[workflow] ?? ''} disabled={!canManage} onChange={(e) => setOverrides((prev) => ({ ...prev, [workflow]: e.target.value }))} className="w-48">
                  <option value="">Default</option>
                  {PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {canManage ? (
        <Button
          onClick={() => {
            const workflowOverrides: Record<string, { provider: string }> = {};
            for (const workflow of WORKFLOWS) {
              if (overrides[workflow]) workflowOverrides[workflow] = { provider: overrides[workflow] };
            }
            const apiKeys: Record<string, string> = {};
            for (const [provider, key] of Object.entries(keys)) {
              if (key.trim()) apiKeys[provider] = key.trim();
            }
            onSave({ enabled, workflowOverrides, apiKeys });
          }}
        >
          {t('common.save')}
        </Button>
      ) : null}
    </div>
  );
}

function BrandingForm({ branding, canManage, onSave }: { branding: ReportBrandingDto; canManage: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [agencyName, setAgencyName] = useState(branding.agencyName);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState(branding.agencyLogoUrl);
  const [clientName, setClientName] = useState(branding.clientName);
  const [clientLogoUrl, setClientLogoUrl] = useState(branding.clientLogoUrl);
  const [footer, setFooter] = useState(branding.footer);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Agency name"><Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} disabled={!canManage} /></Field>
      <Field label="Agency logo URL"><Input value={agencyLogoUrl} onChange={(e) => setAgencyLogoUrl(e.target.value)} disabled={!canManage} /></Field>
      <Field label="Client name"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canManage} /></Field>
      <Field label="Client logo URL"><Input value={clientLogoUrl} onChange={(e) => setClientLogoUrl(e.target.value)} disabled={!canManage} /></Field>
      <Field label="Footer"><Input value={footer} onChange={(e) => setFooter(e.target.value)} disabled={!canManage} /></Field>
      {canManage ? (
        <div className="flex items-end">
          <Button onClick={() => onSave({ agencyName, agencyLogoUrl, clientName, clientLogoUrl, footer })}>
            {t('common.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
