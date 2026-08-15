import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CheckCircle2, Plus, Rocket } from 'lucide-react';
import type { CreateSiteRequest, OrganizationDto, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'details', labelKey: 'addSite.step1' },
  { key: 'client', labelKey: 'addSite.step2' },
  { key: 'review', labelKey: 'addSite.step3' },
] as const;

export function AddSitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedOrg = searchParams.get('organizationId') ?? '';

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('English');
  const [organizationId, setOrganizationId] = useState(preselectedOrg);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<OrganizationDto[]>('/organizations'),
  });
  const organizations = organizationsQuery.data ?? [];

  const createClientMutation = useMutation({
    mutationFn: (clientName: string) =>
      api.post<OrganizationDto>('/organizations', { name: clientName }),
    onSuccess: (org) => {
      setOrganizationId(org.id);
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setCreatingClient(false);
      setNewClientName('');
    },
    onError: () => setError(t('clients.error')),
  });

  const createSiteMutation = useMutation({
    mutationFn: (body: CreateSiteRequest) => api.post<SiteDto>('/sites', body),
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      navigate(`/sites/${site.id}?tab=activation`, { replace: true });
    },
    onError: () => setError(t('addSite.error')),
  });

  const canCreate = hasPermission('sites:create');
  if (!canCreate) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {t('common.notImplemented')}
        </CardContent>
      </Card>
    );
  }

  const goNext = () => {
    setError(null);
    if (step === 0) {
      if (!name.trim() || !domain.trim()) {
        setError(t('addSite.error'));
        return;
      }
    }
    if (step === 1) {
      if (!organizationId) {
        setError(t('addSite.noClients'));
        return;
      }
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createSiteMutation.mutate({
      organizationId,
      name: name.trim(),
      domain: domain.trim(),
      country: country.trim() || null,
      language,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/sites" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t('common.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('addSite.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('addSite.subtitle')}</p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map((entry, index) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                index === step
                  ? 'bg-primary text-primary-foreground'
                  : index < step
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {index < step ? <CheckCircle2 className="size-3.5" /> : <span>{index + 1}</span>}
              {t(entry.labelKey)}
            </span>
            {index < STEPS.length - 1 ? <div className="h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-4">
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="add-site-name">{t('addSite.name')}</Label>
                  <Input id="add-site-name" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="add-site-domain">{t('addSite.domain')}</Label>
                  <Input
                    id="add-site-domain"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    placeholder={t('addSite.domainPlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-site-country">{t('addSite.country')}</Label>
                  <Input id="add-site-country" value={country} onChange={(event) => setCountry(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-site-language">{t('addSite.language')}</Label>
                  <Select id="add-site-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                    <option value="English">English</option>
                    <option value="Arabic">العربية</option>
                  </Select>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="add-site-organization">{t('addSite.client')}</Label>
                  <Select
                    id="add-site-organization"
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                  >
                    <option value="">{t('addSite.noClients')}</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name} ({organization.siteCount})
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('addSite.clientHelp')}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="add-site-new-client">{t('addSite.newClientName')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="add-site-new-client"
                      value={newClientName}
                      onChange={(event) => setNewClientName(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={creatingClient || !newClientName.trim()}
                      onClick={() => createClientMutation.mutate(newClientName.trim())}
                    >
                      <Plus className="size-4" />
                      {t('addSite.createAndContinue')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">{t('addSite.review')}</h3>
                  <p className="text-sm text-muted-foreground">{t('addSite.reviewDescription')}</p>
                </div>
                <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                  <Row label={t('addSite.name')} value={name} />
                  <Row label={t('addSite.domain')} value={domain} />
                  <Row label={t('addSite.country')} value={country || t('common.none')} />
                  <Row label={t('addSite.language')} value={language} />
                  <Row
                    label={t('addSite.client')}
                    value={organizations.find((organization) => organization.id === organizationId)?.name ?? '—'}
                  />
                </dl>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Rocket className="mt-0.5 size-4 shrink-0 text-primary" />
                  {t('addSite.thenActivation')}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep((value) => Math.max(value - 1, 0))} disabled={step === 0}>
                <ArrowLeft className="size-4 rtl:rotate-180" />
                {t('addSite.back')}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  {t('addSite.continue')}
                  <ArrowRight className="size-4 rtl:rotate-180" />
                </Button>
              ) : (
                <Button type="submit" disabled={createSiteMutation.isPending}>
                  {createSiteMutation.isPending ? t('common.loading') : t('addSite.createSite')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
