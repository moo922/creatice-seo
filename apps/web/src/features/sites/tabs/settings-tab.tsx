import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ExternalLink,
  Globe,
  Link2,
  Settings,
  Shield,
  Trash2,
  Unlink,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  AiProviderConfigDto,
  GoogleAdsIntegrationDto,
  GscPropertyDto,
  OrganizationDto,
  ReportBrandingDto,
  SiteDto,
  SiteMembershipDto,
  WordPressIntegrationDto,
} from '@creative-seo/types';
import { AI_WORKFLOWS, AI_PROVIDER_KINDS } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';

const PROVIDERS = [...AI_PROVIDER_KINDS];

type SettingsSection =
  | 'general'
  | 'connections'
  | 'ai'
  | 'automation'
  | 'knowledge'
  | 'reporting'
  | 'access'
  | 'danger';

const SECTIONS: Array<{ key: SettingsSection; labelKey: string; icon: typeof Settings }> = [
  { key: 'general', labelKey: 'settings.general', icon: Settings },
  { key: 'connections', labelKey: 'settings.connections', icon: Link2 },
  { key: 'ai', labelKey: 'settings.aiProviderRouting', icon: Bot },
  { key: 'automation', labelKey: 'settings.automation', icon: Zap },
  { key: 'knowledge', labelKey: 'settings.knowledgeBase', icon: Globe },
  { key: 'reporting', labelKey: 'reports.branding', icon: Settings },
  { key: 'access', labelKey: 'settings.access', icon: Shield },
  { key: 'danger', labelKey: 'settings.dangerZone', icon: AlertTriangle },
];

export function SettingsTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSection siteId={siteId} />;
      case 'connections':
        return <ConnectionsSection siteId={siteId} />;
      case 'ai':
        return <AISection siteId={siteId} />;
      case 'automation':
        return <AutomationSection />;
      case 'knowledge':
        return <KnowledgeSection siteId={siteId} />;
      case 'reporting':
        return <ReportingSection siteId={siteId} />;
      case 'access':
        return <AccessSection siteId={siteId} />;
      case 'danger':
        return <DangerSection siteId={siteId} />;
    }
  };

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.key;
          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              {t(section.labelKey)}
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1">{renderSection()}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Section
// ---------------------------------------------------------------------------

function GeneralSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission('sites:update');

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.get<SiteDto>(`/sites/${siteId}`),
  });

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    enabled: Boolean(siteQuery.data?.organizationId),
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });

  const site = siteQuery.data;
  const client = site?.organizationId
    ? organizationsQuery.data?.find((org) => org.id === site.organizationId)
    : undefined;

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [locale, setLocale] = useState('');
  const [language, setLanguage] = useState('');
  const [country, setCountry] = useState('');
  const [targetCities, setTargetCities] = useState('');
  const [status, setStatus] = useState<SiteDto['status']>('ACTIVE');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (site) {
      setName('');
      setDomain('');
      setLocale('');
      setLanguage('');
      setCountry('');
      setTargetCities(site.targetCities?.join(', ') ?? '');
      setStatus(site.status);
      setTouched(false);
    }
  }, [site?.id, site?.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<SiteDto>(`/sites/${siteId}`, body),
    onSuccess: () => {
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    },
  });

  if (siteQuery.isLoading) return <EmptyState message={t('common.loading')} />;
  if (!site) return <EmptyState message={t('settings.noSite')} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.general')}</CardTitle>
        {client ? (
          <CardDescription>
            {t('settings.client')}:{' '}
            <Link to={`/clients?id=${client.id}`} className="font-medium underline-offset-2 hover:underline">
              {client.name}
            </Link>
          </CardDescription>
        ) : (
          <CardDescription>{t('settings.clientNone')}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({
              name: name.trim() || site.name,
              domain: domain.trim() || site.domain,
              locale: locale.trim() || site.locale,
              language: language.trim() || site.language,
              country: country.trim() || site.country,
              targetCities: targetCities
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean),
              status,
            });
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label={t('settings.name')}>
            <Input
              value={name || site.name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.domain')}>
            <Input
              value={domain || site.domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.locale')}>
            <Input
              value={locale || site.locale}
              onChange={(e) => {
                setLocale(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.language')}>
            <Input
              value={language || site.language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.country')}>
            <Input
              value={country || (site.country ?? '')}
              onChange={(e) => {
                setCountry(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.targetCities')}>
            <Input
              value={targetCities}
              placeholder={t('settings.targetCitiesPlaceholder')}
              onChange={(e) => {
                setTargetCities(e.target.value);
                setTouched(true);
              }}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t('settings.status')}>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as SiteDto['status']);
                setTouched(true);
              }}
              disabled={!canEdit}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </Select>
          </Field>
          {canEdit ? (
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={saveMutation.isPending || !touched}>
                {saveMutation.isPending ? <Spinner /> : t('common.save')}
              </Button>
              {saveMutation.isError && <span className="text-sm text-destructive">{t('settings.error')}</span>}
              {saveMutation.isSuccess && <span className="text-sm text-green-600">{t('common.saved')}</span>}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connections Section
// ---------------------------------------------------------------------------

function ConnectionsSection({ siteId }: { siteId: string }) {
  const [subTab, setSubTab] = useState<'wordpress' | 'gsc' | 'google-ads'>('wordpress');

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['wordpress', 'gsc', 'google-ads'] as const).map((key) => (
          <Button
            key={key}
            variant={subTab === key ? 'default' : 'outline'}
            onClick={() => setSubTab(key)}
          >
            {key === 'wordpress' ? 'WordPress' : key === 'gsc' ? 'Google Search Console' : 'Google Ads'}
          </Button>
        ))}
      </div>

      {subTab === 'wordpress' && <WordPressConnection siteId={siteId} />}
      {subTab === 'gsc' && <GscConnection siteId={siteId} />}
      {subTab === 'google-ads' && <GoogleAdsConnection siteId={siteId} />}
    </div>
  );
}

// --- WordPress ---

function WordPressConnection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('wordpress:manage');

  const wpQuery = useQuery({
    queryKey: ['wordpress', siteId],
    queryFn: () => api.get<WordPressIntegrationDto>(`/sites/${siteId}/wordpress`),
  });

  const checkMutation = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/wordpress/check`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordpress', siteId] }),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/wordpress/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordpress', siteId] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete(`/sites/${siteId}/wordpress`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordpress', siteId] }),
  });

  const connectMutation = useMutation({
    mutationFn: (body: { url: string; username: string; password: string }) =>
      api.post(`/sites/${siteId}/secrets`, { kind: 'WORDPRESS', label: 'WordPress', payload: body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordpress', siteId] });
      setShowConnect(false);
    },
  });

  const [connectUrl, setConnectUrl] = useState('');
  const [connectUsername, setConnectUsername] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  const integration = wpQuery.data;
  const isConnected = integration?.status === 'CONNECTED';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          WordPress
          {isConnected ? (
            <Badge variant="default"><CheckCircle className="mr-1 size-3" />Connected</Badge>
          ) : integration ? (
            <Badge variant="secondary">{integration.status}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {t('settings.wordpressDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {wpQuery.isLoading ? (
          <EmptyState message={t('common.loading')} />
        ) : integration && integration.status !== 'DISCONNECTED' && integration.status !== 'PENDING' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="WordPress URL" value={integration.wpUrl} />
              <InfoRow label="Status" value={integration.status} />
              <InfoRow label="Rank Math" value={integration.rankMathDetected ? `v${integration.rankMathVersion ?? '?'}` : 'Not detected'} />
              <InfoRow label="Last Checked" value={integration.lastCheckedAt ? new Date(integration.lastCheckedAt).toLocaleString() : '—'} />
              <InfoRow label="Last Sync" value={integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : '—'} />
              {integration.lastSyncSummary && (
                <InfoRow label="Sync Result" value={`${integration.lastSyncSummary.created} created, ${integration.lastSyncSummary.updated} updated, ${integration.lastSyncSummary.unchanged} unchanged`} />
              )}
              {integration.lastError && (
                <InfoRow label="Last Error" value={integration.lastError} className="text-destructive" />
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
                  {checkMutation.isPending ? <Spinner /> : t('settings.checkConnection')}
                </Button>
                <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? <Spinner /> : t('settings.sync')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(t('settings.disconnectConfirm'))) disconnectMutation.mutate();
                  }}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="mr-1 size-4" />
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        ) : showConnect ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connectMutation.mutate({ url: connectUrl, username: connectUsername, password: connectPassword });
            }}
            className="space-y-3"
          >
            <Field label="WordPress URL">
              <Input value={connectUrl} onChange={(e) => setConnectUrl(e.target.value)} required placeholder="https://example.com" />
            </Field>
            <Field label="Username">
              <Input value={connectUsername} onChange={(e) => setConnectUsername(e.target.value)} required />
            </Field>
            <Field label="Application Password">
              <Input type="password" value={connectPassword} onChange={(e) => setConnectPassword(e.target.value)} required />
            </Field>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{t('settings.howToGetAppPassword')}</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>{t('settings.wpAppPasswordStep1')}</li>
                <li>{t('settings.wpAppPasswordStep2')}</li>
                <li>{t('settings.wpAppPasswordStep3')}</li>
              </ol>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? <Spinner /> : t('settings.connect')}
              </Button>
              <Button variant="outline" type="button" onClick={() => setShowConnect(false)}>
                {t('common.cancel')}
              </Button>
            </div>
            {connectMutation.isError && <p className="text-sm text-destructive">{t('settings.connectionFailed')}</p>}
          </form>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">{t('settings.wordpressNotConnected')}</p>
            {canManage && (
              <Button onClick={() => setShowConnect(true)}>
                <Link2 className="mr-1 size-4" />
                {t('settings.connectWordPress')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Google Search Console ---

function GscConnection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('gsc:manage');

  const gscQuery = useQuery({
    queryKey: ['gsc', siteId],
    queryFn: () => api.get<GscPropertyDto[]>(`/sites/${siteId}/gsc`),
  });

  const propertiesQuery = useQuery({
    queryKey: ['gsc-properties', siteId],
    enabled: canManage,
    queryFn: () => api.get<GscPropertyDto[]>(`/sites/${siteId}/gsc/properties`),
  });

  const selectedProperty = gscQuery.data?.find((p) => p.selected);
  const isConnected = selectedProperty?.status === 'CONNECTED';

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/gsc/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gsc', siteId] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete(`/sites/${siteId}/gsc`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gsc', siteId] }),
  });

  const selectPropertyMutation = useMutation({
    mutationFn: (body: { siteUrl: string }) =>
      api.put(`/sites/${siteId}/gsc/selected-property`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsc', siteId] });
      queryClient.invalidateQueries({ queryKey: ['gsc-properties', siteId] });
    },
  });

  const authorizeMutation = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/sites/${siteId}/gsc/authorize-url`),
    onSuccess: (data) => {
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
  });

  const handleConnect = async () => {
    try {
      const { url } = await api.get<{ url: string }>(`/sites/${siteId}/gsc/authorize-url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // error handled by mutation
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Search Console
          {gscQuery.isLoading ? null : isConnected ? (
            <Badge variant="default"><CheckCircle className="mr-1 size-3" />Connected</Badge>
          ) : selectedProperty ? (
            <Badge variant="secondary">{selectedProperty.status}</Badge>
          ) : (
            <Badge variant="outline">Disconnected</Badge>
          )}
        </CardTitle>
        <CardDescription>{t('settings.gscDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {gscQuery.isLoading ? (
          <EmptyState message={t('common.loading')} />
        ) : selectedProperty ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Property" value={selectedProperty.siteUrl} />
              <InfoRow label="Type" value={selectedProperty.type} />
              <InfoRow label="Permission" value={selectedProperty.permissionLevel} />
              <InfoRow label="Last Sync" value={selectedProperty.lastSyncAt ? new Date(selectedProperty.lastSyncAt).toLocaleString() : '—'} />
              {selectedProperty.lastError && (
                <InfoRow label="Last Error" value={selectedProperty.lastError} className="text-destructive" />
              )}
            </div>

            {propertiesQuery.data && propertiesQuery.data.length > 1 && (
              <div>
                <Label>{t('settings.selectProperty')}</Label>
                <Select
                  value={selectedProperty.siteUrl}
                  onChange={(e) => selectPropertyMutation.mutate({ siteUrl: e.target.value })}
                  disabled={!canManage || selectPropertyMutation.isPending}
                >
                  {propertiesQuery.data.map((p) => (
                    <option key={p.id} value={p.siteUrl}>
                      {p.siteUrl} ({p.type})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? <Spinner /> : t('settings.sync')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(t('settings.disconnectConfirm'))) disconnectMutation.mutate();
                  }}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="mr-1 size-4" />
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('settings.gscNotConnected')}</p>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{t('settings.gscWhatItProvides')}</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>{t('settings.gscBenefit1')}</li>
                <li>{t('settings.gscBenefit2')}</li>
                <li>{t('settings.gscBenefit3')}</li>
              </ul>
            </div>
            {canManage && (
              <Button onClick={handleConnect} disabled={authorizeMutation.isPending}>
                <ExternalLink className="mr-1 size-4" />
                {authorizeMutation.isPending ? <Spinner /> : t('settings.connectGsc')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Google Ads ---

function GoogleAdsConnection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('keywords:manage');

  const gaQuery = useQuery({
    queryKey: ['google-ads', siteId],
    queryFn: () => api.get<GoogleAdsIntegrationDto>(`/sites/${siteId}/google-ads`),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; integration: GoogleAdsIntegrationDto }>(`/sites/${siteId}/google-ads/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-ads', siteId] }),
  });

  const integration = gaQuery.data;
  const isConnected = integration?.status === 'CONNECTED';
  const [showConfig, setShowConfig] = useState(false);
  const [configCustomerId, setConfigCustomerId] = useState('');
  const [configDevToken, setConfigDevToken] = useState('');
  const [configRefreshToken, setConfigRefreshToken] = useState('');
  const [configClientId, setConfigClientId] = useState('');
  const [configClientSecret, setConfigClientSecret] = useState('');
  const [configLanguage, setConfigLanguage] = useState('');

  const configureMutation = useMutation({
    mutationFn: (body: {
      customerId: string;
      developerToken: string;
      refreshToken: string;
      clientId?: string;
      clientSecret?: string;
      language?: string;
    }) => api.post<GoogleAdsIntegrationDto>(`/sites/${siteId}/google-ads/configure`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-ads', siteId] });
      setShowConfig(false);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete<GoogleAdsIntegrationDto>(`/sites/${siteId}/google-ads`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-ads', siteId] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Ads
          {gaQuery.isLoading ? null : isConnected ? (
            <Badge variant="default"><CheckCircle className="mr-1 size-3" />Connected</Badge>
          ) : integration ? (
            <Badge variant="secondary">{integration.status}</Badge>
          ) : (
            <Badge variant="outline">Not Configured</Badge>
          )}
        </CardTitle>
        <CardDescription>{t('settings.googleAdsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {gaQuery.isLoading ? (
          <EmptyState message={t('common.loading')} />
        ) : integration && integration.status !== 'NOT_CONFIGURED' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Customer ID" value={integration.customerId ?? '—'} />
              <InfoRow label="Status" value={integration.status} />
              <InfoRow label="Language" value={integration.languageTarget ?? '—'} />
              <InfoRow label="Last Keyword Sync" value={integration.lastKeywordSyncAt ? new Date(integration.lastKeywordSyncAt).toLocaleString() : '—'} />
              {integration.lastError && (
                <InfoRow label="Last Error" value={integration.lastError} className="text-destructive" />
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                  {testMutation.isPending ? <Spinner /> : t('settings.testConnection')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(t('settings.disconnectGoogleAdsConfirm'))) {
                      disconnectMutation.mutate();
                    }
                  }}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="mr-1 size-4" />
                  {t('settings.disconnect')}
                </Button>
              </div>
            )}
          </div>
        ) : showConfig ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              configureMutation.mutate({
                customerId: configCustomerId,
                developerToken: configDevToken,
                refreshToken: configRefreshToken,
                clientId: configClientId || undefined,
                clientSecret: configClientSecret || undefined,
                language: configLanguage || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer ID">
                <Input value={configCustomerId} onChange={(e) => setConfigCustomerId(e.target.value)} required placeholder="123-456-7890" />
              </Field>
              <Field label="Developer Token">
                <Input value={configDevToken} onChange={(e) => setConfigDevToken(e.target.value)} required type="password" />
              </Field>
              <Field label="Refresh Token">
                <Input value={configRefreshToken} onChange={(e) => setConfigRefreshToken(e.target.value)} required type="password" />
              </Field>
              <Field label="Client ID">
                <Input value={configClientId} onChange={(e) => setConfigClientId(e.target.value)} />
              </Field>
              <Field label="Client Secret">
                <Input value={configClientSecret} onChange={(e) => setConfigClientSecret(e.target.value)} type="password" />
              </Field>
              <Field label="Language Target">
                <Input value={configLanguage} onChange={(e) => setConfigLanguage(e.target.value)} placeholder="en" />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={configureMutation.isPending}>
                {configureMutation.isPending ? <Spinner /> : t('settings.configure')}
              </Button>
              <Button variant="outline" type="button" onClick={() => setShowConfig(false)}>
                {t('common.cancel')}
              </Button>
            </div>
            {configureMutation.isError && <p className="text-sm text-destructive">{t('settings.configurationFailed')}</p>}
          </form>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">{t('settings.googleAdsNotConfigured')}</p>
            {canManage && (
              <Button onClick={() => setShowConfig(true)}>
                <Settings className="mr-1 size-4" />
                {t('settings.configureGoogleAds')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI Section
// ---------------------------------------------------------------------------

function AISection({ siteId }: { siteId: string }) {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-config', siteId] }),
  });

  const config = aiQuery.data;

  if (aiQuery.isLoading) return <EmptyState message={t('common.loading')} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.aiProviderRouting')}</CardTitle>
      </CardHeader>
      <CardContent>
        {config ? (
          <AIConfigForm config={config} canManage={canManage} siteId={siteId} onSave={(body) => aiSaveMutation.mutate(body)} />
        ) : (
          <EmptyState message={t('settings.aiConfigUnavailable')} />
        )}
      </CardContent>
    </Card>
  );
}

function AIConfigForm({
  config,
  canManage,
  siteId,
  onSave,
}: {
  config: AiProviderConfigDto;
  canManage: boolean;
  siteId: string;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(config.enabled);
  const [keys, setKeys] = useState<Record<string, string>>({
    OPENAI: '',
    ANTHROPIC: '',
    PERPLEXITY: '',
  });
  const [removeKeys, setRemoveKeys] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { provider: string; model: string }>>(() => {
    const result: Record<string, { provider: string; model: string }> = {};
    const overridesMap = config.workflowOverrides as Partial<Record<string, { provider?: string; model?: string }>>;
    for (const workflow of AI_WORKFLOWS) {
      result[workflow] = {
        provider: overridesMap[workflow]?.provider ?? '',
        model: overridesMap[workflow]?.model ?? '',
      };
    }
    return result;
  });

  const [testResults, setTestResults] = useState<Record<string, 'loading' | 'ok' | 'error'>>({});

  const testMutation = useMutation({
    mutationFn: (body: { kind: string }) =>
      api.post<{ ok: boolean }>(`/sites/${siteId}/ai/test`, body),
  });

  const handleTest = async (provider: string) => {
    setTestResults((prev) => ({ ...prev, [provider]: 'loading' }));
    try {
      const result = await testMutation.mutateAsync({ kind: provider });
      setTestResults((prev) => ({ ...prev, [provider]: result.ok ? 'ok' : 'error' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [provider]: 'error' }));
    }
  };

  const handleRemoveOverride = (provider: string) => {
    setRemoveKeys((prev) => [...prev, provider]);
    setKeys((prev) => ({ ...prev, [provider]: '' }));
  };

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canManage}
        />
        {t('settings.aiEnabledForSite')}
      </label>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t('settings.providerOverrides')}</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const effective = config.effectiveProviders?.find((ep) => ep.provider === provider);
            const hasSiteKey = config.keyOverrides.includes(provider);
            const testResult = testResults[provider];
            return (
              <div key={provider} className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">{provider}</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Source: {effective?.source ?? '—'}</div>
                  <div>Configured: {effective?.configured ? 'Yes' : 'No'}</div>
                  {hasSiteKey && <div>Site key override: Set</div>}
                </div>
                <Input
                  type="password"
                  placeholder={hasSiteKey ? '••••••••' : 'New API key'}
                  value={keys[provider] ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                />
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(provider)}
                      disabled={testResult === 'loading'}
                    >
                      {testResult === 'loading' ? <Spinner /> : testResult === 'ok' ? <CheckCircle className="size-3 text-green-600" /> : testResult === 'error' ? <XCircle className="size-3 text-destructive" /> : t('settings.test')}
                    </Button>
                    {hasSiteKey && !removeKeys.includes(provider) && (
                      <Button variant="outline" size="sm" onClick={() => handleRemoveOverride(provider)}>
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t('settings.workflowRouting')}</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workflow</TableHead>
              <TableHead>Provider Override</TableHead>
              <TableHead>Model Override</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AI_WORKFLOWS.map((workflow) => (
              <TableRow key={workflow}>
                <TableCell className="font-medium text-xs">{workflow}</TableCell>
                <TableCell>
                  <Select
                    value={overrides[workflow]?.provider ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [workflow]: { ...prev[workflow], provider: e.target.value } }))}
                    className="w-48"
                  >
                    <option value="">Default</option>
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="e.g. gpt-4o"
                    value={overrides[workflow]?.model ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [workflow]: { ...prev[workflow], model: e.target.value } }))}
                    className="w-48"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <div className="flex items-end gap-2">
          <Button
            onClick={() => {
              const workflowOverrides: Record<string, { provider?: string; model?: string }> = {};
              for (const workflow of AI_WORKFLOWS) {
                const ov = overrides[workflow];
                if (ov?.provider || ov?.model) {
                  workflowOverrides[workflow] = {};
                  if (ov.provider) workflowOverrides[workflow].provider = ov.provider;
                  if (ov.model) workflowOverrides[workflow].model = ov.model;
                }
              }
              const apiKeys: Record<string, string> = {};
              for (const [provider, key] of Object.entries(keys)) {
                if (key.trim()) apiKeys[provider] = key.trim();
              }
              onSave({
                enabled,
                workflowOverrides,
                apiKeys,
                removeApiKeys: removeKeys.length > 0 ? removeKeys : undefined,
              });
              setRemoveKeys([]);
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automation Section
// ---------------------------------------------------------------------------

function AutomationSection() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.automation')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Automation workflows run via orchestration jobs dispatched by the worker.</p>
        <Button asChild variant="outline">
          <Link to={`/automation`}>
            <Zap className="mr-1 size-4" />
            Open Automation Dashboard
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Knowledge Base Section
// ---------------------------------------------------------------------------

function KnowledgeSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.knowledgeBase')}</CardTitle>
        <CardDescription>{t('settings.knowledgeBaseDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to={`/knowledge?siteId=${siteId}`}>
            <ExternalLink className="mr-1 size-4" />
            {t('settings.openKnowledgeBase')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reporting / Branding Section
// ---------------------------------------------------------------------------

function ReportingSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('ai:manage');

  const brandingQuery = useQuery({
    queryKey: ['report-branding', siteId],
    queryFn: () => api.get<ReportBrandingDto>(`/sites/${siteId}/reporting/branding`),
  });

  const brandingSaveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<ReportBrandingDto>(`/sites/${siteId}/reporting/branding`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-branding', siteId] }),
  });

  const branding = brandingQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('reports.branding')}</CardTitle>
      </CardHeader>
      <CardContent>
        {brandingQuery.isLoading ? (
          <EmptyState message={t('common.loading')} />
        ) : branding ? (
          <BrandingForm branding={branding} canManage={Boolean(canManage)} onSave={(body) => brandingSaveMutation.mutate(body)} />
        ) : (
          <EmptyState message={t('settings.brandingUnavailable')} />
        )}
      </CardContent>
    </Card>
  );
}

function BrandingForm({
  branding,
  canManage,
  onSave,
}: {
  branding: ReportBrandingDto;
  canManage: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [agencyName, setAgencyName] = useState(branding.agencyName);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState(branding.agencyLogoUrl);
  const [clientName, setClientName] = useState(branding.clientName);
  const [clientLogoUrl, setClientLogoUrl] = useState(branding.clientLogoUrl);
  const [footer, setFooter] = useState(branding.footer);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Agency name">
        <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} disabled={!canManage} />
      </Field>
      <Field label="Agency logo URL">
        <Input value={agencyLogoUrl} onChange={(e) => setAgencyLogoUrl(e.target.value)} disabled={!canManage} />
      </Field>
      <Field label="Client name">
        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canManage} />
      </Field>
      <Field label="Client logo URL">
        <Input value={clientLogoUrl} onChange={(e) => setClientLogoUrl(e.target.value)} disabled={!canManage} />
      </Field>
      <Field label="Footer">
        <Input value={footer} onChange={(e) => setFooter(e.target.value)} disabled={!canManage} />
      </Field>
      {canManage && (
        <div className="flex items-end">
          <Button onClick={() => onSave({ agencyName, agencyLogoUrl, clientName, clientLogoUrl, footer })}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access / Members Section
// ---------------------------------------------------------------------------

function AccessSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('sites:manage_members');

  const membersQuery = useQuery({
    queryKey: ['site-members', siteId],
    queryFn: () => api.get<SiteMembershipDto[]>(`/sites/${siteId}/members`),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/sites/${siteId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-members', siteId] }),
  });

  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('VIEWER');

  const addMemberMutation = useMutation({
    mutationFn: (body: { userId: string; siteRole: string }) =>
      api.post(`/sites/${siteId}/members`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-members', siteId] });
      setAddUserId('');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.access')}</CardTitle>
        <CardDescription>{t('settings.membersDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {membersQuery.isLoading ? (
          <EmptyState message={t('common.loading')} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersQuery.data?.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.userId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.siteRole}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {m.userId !== user?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(t('settings.removeMemberConfirm'))) removeMemberMutation.mutate(m.userId);
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {(!membersQuery.data || membersQuery.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {t('settings.noMembers')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {canManage && (
              <div className="flex items-end gap-2 pt-2 border-t">
                <Field label={t('settings.userId')}>
                  <Input
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    placeholder="UUID"
                  />
                </Field>
                <Field label={t('settings.role')}>
                  <Select value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                    <option value="OWNER">OWNER</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="VIEWER">VIEWER</option>
                  </Select>
                </Field>
                <Button
                  onClick={() => addMemberMutation.mutate({ userId: addUserId, siteRole: addRole })}
                  disabled={!addUserId.trim() || addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? <Spinner /> : t('settings.addMember')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone Section
// ---------------------------------------------------------------------------

function DangerSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.get<SiteDto>(`/sites/${siteId}`),
  });

  const site = siteQuery.data;
  const canPurge = hasPermission('sites:purge');

  const pauseResumeMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'PAUSED') => api.patch(`/sites/${siteId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', siteId] }),
  });

  const archiveRestoreMutation = useMutation({
    mutationFn: (action: 'archive' | 'restore') => {
      if (action === 'archive') return api.delete(`/sites/${siteId}`);
      return api.patch(`/sites/${siteId}`, { status: 'ACTIVE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', siteId] }),
  });

  const purgeMutation = useMutation({
    mutationFn: (confirmDomain: string) => api.post(`/sites/${siteId}/purge`, { confirmDomain }),
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/sites/${siteId}/wordpress`).catch(() => {});
      await api.delete(`/sites/${siteId}/gsc`).catch(() => {});
      await api.delete(`/sites/${siteId}/google-ads`).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordpress', siteId] });
      queryClient.invalidateQueries({ queryKey: ['gsc', siteId] });
      queryClient.invalidateQueries({ queryKey: ['google-ads', siteId] });
    },
  });

  const [purgeDomain, setPurgeDomain] = useState('');

  const isPaused = site?.status === 'PAUSED';
  const isArchived = site?.status === 'ARCHIVED';

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" />
          {t('settings.dangerZone')}
        </CardTitle>
        <CardDescription>{t('settings.dangerZoneDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">
              {isPaused ? t('settings.resumeSite') : t('settings.pauseSite')}
            </div>
            <div className="text-xs text-muted-foreground">
              {isPaused ? t('settings.resumeDescription') : t('settings.pauseDescription')}
            </div>
          </div>
          <Button
            variant={isPaused ? 'default' : 'outline'}
            onClick={() => {
              if (window.confirm(isPaused ? t('settings.resumeConfirm') : t('settings.pauseConfirm'))) {
                pauseResumeMutation.mutate(isPaused ? 'ACTIVE' : 'PAUSED');
              }
            }}
            disabled={pauseResumeMutation.isPending || isArchived}
          >
            {pauseResumeMutation.isPending ? <Spinner /> : isPaused ? t('settings.resumeSite') : t('settings.pauseSite')}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">
              {isArchived ? t('settings.restoreSite') : t('settings.archiveSite')}
            </div>
            <div className="text-xs text-muted-foreground">
              {isArchived ? t('settings.restoreDescription') : t('settings.archiveDescription')}
            </div>
          </div>
          <Button
            variant={isArchived ? 'default' : 'outline'}
            onClick={() => {
              if (window.confirm(isArchived ? t('settings.restoreConfirm') : t('settings.archiveConfirm'))) {
                archiveRestoreMutation.mutate(isArchived ? 'restore' : 'archive');
              }
            }}
            disabled={archiveRestoreMutation.isPending}
          >
            {archiveRestoreMutation.isPending ? <Spinner /> : isArchived ? t('settings.restoreSite') : t('settings.archiveSite')}
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-4">
          <div>
            <div className="text-sm font-medium">{t('settings.disconnectAll')}</div>
            <div className="text-xs text-muted-foreground">{t('settings.disconnectAllDescription')}</div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(t('settings.disconnectAllConfirm'))) disconnectAllMutation.mutate();
            }}
            disabled={disconnectAllMutation.isPending}
          >
            {disconnectAllMutation.isPending ? <Spinner /> : <Unlink className="mr-1 size-4" />}
            {t('settings.disconnectAll')}
          </Button>
        </div>

        {canPurge && (
          <div className="rounded-md border border-destructive/50 p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-destructive">{t('settings.deletePermanently')}</div>
              <div className="text-xs text-muted-foreground">{t('settings.deletePermanentlyDescription')}</div>
            </div>
            <Field label={t('settings.typeDomainToConfirm')}>
              <Input
                value={purgeDomain}
                onChange={(e) => setPurgeDomain(e.target.value)}
                placeholder={site?.domain ?? ''}
                className="max-w-xs"
              />
            </Field>
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm(t('settings.deletePermanentlyFinalConfirm'))) {
                  purgeMutation.mutate(purgeDomain);
                }
              }}
              disabled={purgeDomain !== site?.domain || purgeMutation.isPending}
            >
              {purgeMutation.isPending ? <Spinner /> : <Trash2 className="mr-1 size-4" />}
              {t('settings.deletePermanently')}
            </Button>
            {purgeMutation.isError && (
              <p className="text-sm text-destructive">{purgeMutation.error?.message ?? t('settings.deleteFailed')}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm ${className ?? ''}`}>{value}</div>
    </div>
  );
}
