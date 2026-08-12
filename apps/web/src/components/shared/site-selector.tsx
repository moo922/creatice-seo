import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Paginated, SiteDto } from '@creative-seo/types';
import { api } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Site selector for cross-site pages. Pass value=undefined for "all sites". */
export function SiteSelector({
  value,
  onChange,
  allowAll = true,
}: {
  value: string | undefined;
  onChange: (siteId: string | undefined) => void;
  allowAll?: boolean;
}) {
  const { t } = useTranslation();
  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Paginated<SiteDto>>('/sites?perPage=100'),
  });
  const sites = sitesQuery.data?.data ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor="site-selector">{t('sites.title')}</Label>
      <Select
        id="site-selector"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        {allowAll ? <option value="">{t('common.allSites')}</option> : null}
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name} ({site.domain})
          </option>
        ))}
      </Select>
    </div>
  );
}
