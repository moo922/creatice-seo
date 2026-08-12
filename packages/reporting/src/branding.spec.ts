import { agencyDefaults, resolveBranding } from './branding';

const defaults = agencyDefaults({ name: 'Agency Co', logoUrl: 'https://a.co/logo.png', email: 'a@b.co', phone: '', footer: 'Default footer' });

describe('resolveBranding', () => {
  it('falls back to agency defaults and the site name', () => {
    const view = resolveBranding(defaults, null, 'Client Ltd');
    expect(view.agencyName).toBe('Agency Co');
    expect(view.agencyLogoUrl).toBe('https://a.co/logo.png');
    expect(view.clientName).toBe('Client Ltd');
    expect(view.contactDetails.email).toBe('a@b.co');
  });

  it('prefers the per-site branding row when present', () => {
    const view = resolveBranding(defaults, {
      siteId: 's1',
      agencyName: 'White-label Co',
      agencyLogoUrl: '',
      clientName: 'Big Client',
      clientLogoUrl: 'https://client.co/logo.png',
      contactDetails: { phone: '+1 555' },
      footer: 'Client footer',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, 'Site Name');
    expect(view.agencyName).toBe('White-label Co');
    expect(view.clientName).toBe('Big Client');
    expect(view.clientLogoUrl).toBe('https://client.co/logo.png');
    expect(view.footer).toBe('Client footer');
    expect(view.contactDetails.phone).toBe('+1 555');
    // Merged: default email retained alongside the row's phone.
    expect(view.contactDetails.email).toBe('a@b.co');
  });

  it('never yields an empty client name', () => {
    const view = resolveBranding(defaults, null, null);
    expect(view.clientName).toBeTruthy();
  });
});
