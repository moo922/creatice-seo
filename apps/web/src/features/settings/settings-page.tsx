import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import {
  Save,
  TestTube,
  Trash2,
  Power,
  PowerOff,
  Shield,
  Bot,
  Activity,
  FileText,
  Cog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiProviderKind } from '@creative-seo/types';

type ProviderKey = AiProviderKind;

interface AiProviderDto {
  provider: ProviderKey;
  enabled: boolean;
  configured: boolean;
  credentialSource: string;
  defaultModel: string;
  connectionStatus: string;
  latencyMs: number | null;
  lastError: string | null;
  lastTestedAt: string | null;
}

interface AiHealthDto {
  provider: ProviderKey;
  status: string;
  latencyMs: number | null;
  lastCheckedAt: string | null;
}

interface PromptVersionDto {
  id: string;
  workflow: string;
  name: string;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const SECTIONS = [
  { id: 'ai-providers', label: 'settings.sections.aiProviders', icon: Bot, permission: 'ai:manage' as const },
  { id: 'health', label: 'settings.sections.health', icon: Activity, permission: 'ai:read' as const },
  { id: 'prompts', label: 'settings.sections.prompts', icon: FileText, permission: 'ai:read' as const },
  { id: 'automation', label: 'settings.sections.automation', icon: Cog, permission: 'orchestration:manage' as const },
  { id: 'security', label: 'settings.sections.security', icon: Shield, permission: 'roles:read' as const },
] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [activeSection, setActiveSection] = useState('ai-providers');

  const visibleSections = SECTIONS.filter((s) => hasPermission(s.permission));

  const renderSection = () => {
    switch (activeSection) {
      case 'ai-providers':
        return <AiProvidersSection />;
      case 'health':
        return <HealthSection />;
      case 'prompts':
        return <PromptsSection />;
      case 'automation':
        return <AutomationSection />;
      case 'security':
        return <SecuritySection />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <section.icon className="size-4" />
                {t(section.label)}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{renderSection()}</div>
      </div>
    </div>
  );
}

function AiProvidersSection() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('ai:manage');

  const providersQuery = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => api.get<AiProviderDto[]>('/ai/providers'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ provider, body }: { provider: ProviderKey; body: Record<string, unknown> }) =>
      api.put<AiProviderDto>(`/ai/providers/${provider}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  const testMutation = useMutation({
    mutationFn: (provider: ProviderKey) => api.post<{ status: string; latencyMs: number | null }>(`/ai/providers/${provider}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (provider: ProviderKey) => api.post<AiProviderDto>(`/ai/providers/${provider}/disconnect`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  const providers = providersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.aiProviders.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.aiProviders.description')}</p>

      {providersQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : providers.length === 0 ? (
        <EmptyState message={t('settings.aiProviders.empty')} />
      ) : (
        <div className="grid gap-4">
          {providers.map((provider) => (
            <AiProviderCard
              key={provider.provider}
              provider={provider}
              canManage={canManage}
              onUpdate={(body) => updateMutation.mutate({ provider: provider.provider, body })}
              onTest={() => testMutation.mutate(provider.provider)}
              onDisconnect={() => disconnectMutation.mutate(provider.provider)}
              isUpdating={updateMutation.isPending}
              isTesting={testMutation.isPending && testMutation.variables === provider.provider}
              isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables === provider.provider}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AiProviderCard({
  provider,
  canManage,
  onUpdate,
  onTest,
  onDisconnect,
  isUpdating,
  isTesting,
  isDisconnecting,
}: {
  provider: AiProviderDto;
  canManage: boolean;
  onUpdate: (body: Record<string, unknown>) => void;
  onTest: () => void;
  onDisconnect: () => void;
  isUpdating: boolean;
  isTesting: boolean;
  isDisconnecting: boolean;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel);
  const [enabled, setEnabled] = useState(provider.enabled);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            {provider.provider}
          </CardTitle>
          <StatusBadge status={provider.enabled ? 'ACTIVE' : 'PAUSED'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('settings.aiProviders.configured')}</Label>
            <StatusBadge status={provider.configured ? 'CONNECTED' : 'NOT_READY'} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('settings.aiProviders.credentialSource')}</Label>
            <p className="text-sm">{provider.credentialSource}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('settings.aiProviders.connectionStatus')}</Label>
            <StatusBadge status={provider.connectionStatus} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('settings.aiProviders.latency')}</Label>
            <p className="text-sm">{provider.latencyMs !== null ? `${provider.latencyMs}ms` : '—'}</p>
          </div>
          {provider.lastError && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-destructive">{t('settings.aiProviders.lastError')}</Label>
              <p className="text-sm text-destructive">{provider.lastError}</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`api-key-${provider.provider}`}>{t('settings.aiProviders.apiKey')}</Label>
            <Input
              id={`api-key-${provider.provider}`}
              type="password"
              placeholder={provider.configured ? '••••••••' : t('settings.aiProviders.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`model-${provider.provider}`}>{t('settings.aiProviders.defaultModel')}</Label>
            <Input
              id={`model-${provider.provider}`}
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canManage}
          />
          {t('settings.aiProviders.enabled')}
        </label>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const body: Record<string, unknown> = { enabled, defaultModel };
                if (apiKey.trim()) body.apiKey = apiKey.trim();
                onUpdate(body);
              }}
              disabled={isUpdating}
            >
              <Save className="size-4" />
              {isUpdating ? t('common.loading') : t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onTest}
              disabled={isTesting || !provider.configured}
            >
              <TestTube className="size-4" />
              {isTesting ? t('common.loading') : t('settings.aiProviders.testConnection')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdate({ enabled: !enabled })}
              disabled={isUpdating}
            >
              {enabled ? <PowerOff className="size-4" /> : <Power className="size-4" />}
              {enabled ? t('settings.aiProviders.disable') : t('settings.aiProviders.enable')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onDisconnect}
              disabled={isDisconnecting || !provider.configured}
            >
              <Trash2 className="size-4" />
              {isDisconnecting ? t('common.loading') : t('settings.aiProviders.disconnect')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthSection() {
  const { t } = useTranslation();

  const healthQuery = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => api.get<AiHealthDto[]>('/ai/health'),
  });

  const health = healthQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.health.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.health.description')}</p>

      {healthQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : health.length === 0 ? (
        <EmptyState message={t('settings.health.empty')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {health.map((h) => (
            <Card key={h.provider}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.provider}</span>
                  <StatusBadge status={h.status} />
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>{t('settings.health.latency')}: {h.latencyMs !== null ? `${h.latencyMs}ms` : '—'}</p>
                  {h.lastCheckedAt && (
                    <p>{t('settings.health.lastChecked')}: {new Date(h.lastCheckedAt).toLocaleString()}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const promptsQuery = useQuery({
    queryKey: ['ai-prompts'],
    queryFn: () => api.get<PromptVersionDto[]>('/ai/prompts'),
  });

  const createMutation = useMutation({
    mutationFn: (body: { workflow: string; name: string; content: string }) =>
      api.post<PromptVersionDto>('/ai/prompts', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-prompts'] }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [workflow, setWorkflow] = useState('');
  const [name, setName] = useState('');

  const prompts = promptsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('settings.prompts.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.prompts.description')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {t('settings.prompts.newVersion')}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.prompts.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!workflow.trim() || !name.trim()) return;
                createMutation.mutate({ workflow: workflow.trim(), name: name.trim(), content: '' });
                setWorkflow('');
                setName('');
                setShowCreate(false);
              }}
            >
              <div className="space-y-1.5">
                <Label>{t('settings.prompts.workflow')}</Label>
                <Input value={workflow} onChange={(e) => setWorkflow(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t('settings.prompts.promptName')}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="sm:col-span-2">
                {createMutation.isPending ? t('common.loading') : t('common.create')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {promptsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : prompts.length === 0 ? (
        <EmptyState message={t('settings.prompts.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.prompts.workflow')}</TableHead>
                  <TableHead>{t('settings.prompts.promptName')}</TableHead>
                  <TableHead>{t('settings.prompts.version')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('settings.prompts.updated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-medium">{prompt.workflow}</TableCell>
                    <TableCell>{prompt.name}</TableCell>
                    <TableCell>v{prompt.version}</TableCell>
                    <TableCell>
                      <StatusBadge status={prompt.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(prompt.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AutomationSection() {
  const { t } = useTranslation();

  const configQuery = useQuery({
    queryKey: ['automation-config'],
    queryFn: () => api.get<Record<string, unknown>>('/orchestration/config'),
  });

  const config = configQuery.data;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.automation.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.automation.description')}</p>

      {configQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {config ? (
              <div className="space-y-4">
                <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                  {JSON.stringify(config, null, 2)}
                </pre>
                <p className="text-sm text-muted-foreground">{t('settings.automation.note')}</p>
              </div>
            ) : (
              <EmptyState message={t('settings.automation.empty')} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SecuritySection() {
  const { t } = useTranslation();

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<Array<{ id: string; email: string; fullName: string; roles: string[] }>>('/users'),
  });

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.security.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.security.description')}</p>

      {usersQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : users.length === 0 ? (
        <EmptyState message={t('settings.security.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.security.name')}</TableHead>
                  <TableHead>{t('settings.security.email')}</TableHead>
                  <TableHead>{t('settings.security.roles')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.roles.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
