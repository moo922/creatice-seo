import type { ReportBrandingDto } from '@creative-seo/types';

/**
 * White-label branding. Agency defaults come from environment (AGENCY_*);
 * per-site overrides come from the report_branding row. A client name/logo and
 * agency name/logo are always present so generated reports never fall back to
 * the platform's own identity.
 */

export interface BrandingView {
  agencyName: string;
  agencyLogoUrl: string;
  clientName: string;
  clientLogoUrl: string;
  contactDetails: Record<string, string>;
  footer: string;
}

export interface AgencyEnvDefaults {
  name: string;
  logoUrl: string;
  email: string;
  phone: string;
  footer: string;
}

export function agencyDefaults(env: AgencyEnvDefaults): Pick<BrandingView, 'agencyName' | 'agencyLogoUrl' | 'footer' | 'contactDetails'> {
  return {
    agencyName: env.name || 'Creative SEO',
    agencyLogoUrl: env.logoUrl,
    footer: env.footer,
    contactDetails: {
      ...(env.email ? { email: env.email } : {}),
      ...(env.phone ? { phone: env.phone } : {}),
    },
  };
}

/** Merges environment agency defaults with the per-site branding row (if any). */
export function resolveBranding(
  defaults: Pick<BrandingView, 'agencyName' | 'agencyLogoUrl' | 'footer' | 'contactDetails'>,
  row: ReportBrandingDto | null,
  siteName: string | null,
): BrandingView {
  return {
    agencyName: row?.agencyName || defaults.agencyName || 'Creative SEO',
    agencyLogoUrl: row?.agencyLogoUrl ?? defaults.agencyLogoUrl ?? '',
    clientName: row?.clientName || siteName || 'Client',
    clientLogoUrl: row?.clientLogoUrl ?? '',
    contactDetails: { ...defaults.contactDetails, ...(row?.contactDetails ?? {}) },
    footer: row?.footer ?? defaults.footer ?? '',
  };
}
