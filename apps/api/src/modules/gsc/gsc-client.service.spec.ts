import type { AppConfig } from '../../config/app-config';
import { GscClientError, GscClientService } from './gsc-client.service';

function makeClient(overrides: Partial<{ apiBase: string; tokenBase: string; clientId: string; clientSecret: string }> = {}): GscClientService {
  const config = {
    env: {
      GSC_API_BASE: overrides.apiBase ?? 'https://www.googleapis.com/webmasters/v3',
      GSC_TOKEN_BASE: overrides.tokenBase ?? 'https://oauth2.googleapis.com',
      GSC_CLIENT_ID: overrides.clientId ?? 'client-id',
      GSC_CLIENT_SECRET: overrides.clientSecret ?? 'client-secret',
      GSC_REDIRECT_URI: 'http://localhost:3000/api/sites/:siteId/gsc/callback',
    },
  } as unknown as AppConfig;
  return new GscClientService(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockFetch = jest.fn();

describe('GscClientService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('builds an OAuth authorize URL with offline consent and the state', () => {
    const url = new URL(makeClient().buildAuthorizeUrl('site-id.nonce.123.sig'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('site-id.nonce.123.sig');
    expect(url.searchParams.get('redirect_uri')).toContain('/gsc/callback');
  });

  it('exchanges an authorization code via the token endpoint form POST', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ access_token: 'at', expires_in: 3600, refresh_token: 'rt', scope: 's', token_type: 'Bearer' }),
    );

    const token = await makeClient().exchangeCode('the-code');

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=the-code');
    expect(token.access_token).toBe('at');
    expect(token.refresh_token).toBe('rt');
  });

  it('throws GscClientError with the Google error message on non-2xx token response', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'invalid_grant', error_description: 'Bad Request' }, 400),
    );

    await expect(makeClient().exchangeCode('bad')).rejects.toThrow(
      new GscClientError('Bad Request', 400),
    );
  });

  it('lists Search Console sites with a Bearer token', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ siteEntry: [{ siteUrl: 'https://example.com/', permissionLevel: 'siteFullUser' }] }),
    );

    const sites = await makeClient().listSites('at');

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://www.googleapis.com/webmasters/v3/sites');
    expect(init.headers.Authorization).toBe('Bearer at');
    expect(sites).toHaveLength(1);
    expect(sites[0]!.siteUrl).toBe('https://example.com/');
  });

  it('queries Search Analytics for a date window with dimensions', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [{ keys: ['seo', 'https://example.com/'], clicks: 3, impressions: 50, ctr: 0.06, position: 4.2 }], rowCount: 1 }));

    const result = await makeClient().searchAnalytics('at', 'https://example.com/', '2026-07-01', '2026-07-01', ['query', 'page']);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query');
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ startDate: '2026-07-01', endDate: '2026-07-01', dimensions: ['query', 'page'], rowLimit: 25_000 });
    expect(result.rows?.[0]?.clicks).toBe(3);
  });

  it('maps search analytics API errors to GscClientError', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { message: 'Access to property denied' } }, 403));

    await expect(makeClient().searchAnalytics('at', 'sc-domain:example.com', 'd', 'd', ['query'])).rejects.toThrow(
      new GscClientError('Access to property denied', 403),
    );
  });
});
