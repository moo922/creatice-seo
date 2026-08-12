/**
 * Google Search Console REST client.
 *
 * Pure fetch-based client with no framework coupling, shared by the API
 * (connect/select property/manual sync) and the worker (daily sync job).
 *
 * Auth: server-side OAuth 2.0. Tokens are never exposed to the browser; they
 * live only in encrypted backend storage.
 */

export interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GscTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  accessTokenExpiresAt: number;
}

export interface GscPropertyInfo {
  siteUrl: string;
  permissionLevel: string;
  type: 'URL_PREFIX' | 'DOMAIN';
}

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export class GscClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'GscClientError';
  }
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SITE_LIST_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

export function searchAnalyticsUrl(siteUrl: string): string {
  return `https://searchconsole.googleapis.com/v1/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
}

export class GscClient {
  constructor(private readonly oauth: GscOAuthConfig) {}

  authorizationUrl(state: string, scopes: string[] = DEFAULT_SCOPES): string {
    const params = new URLSearchParams({
      client_id: this.oauth.clientId,
      redirect_uri: this.oauth.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${OAUTH_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GscTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.oauth.clientId,
      client_secret: this.oauth.clientSecret,
      redirect_uri: this.oauth.redirectUri,
      grant_type: 'authorization_code',
    });
    return this.tokenRequest(body);
  }

  async refreshAccessToken(tokens: GscTokens): Promise<GscTokens> {
    const body = new URLSearchParams({
      client_id: this.oauth.clientId,
      client_secret: this.oauth.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    });
    const refreshed = await this.tokenRequest(body);
    return { ...tokens, ...refreshed };
  }

  private async tokenRequest(body: URLSearchParams): Promise<GscTokens> {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    } | null;
    if (!res.ok || !json?.access_token) {
      throw new GscClientError(
        json?.error_description ?? json?.error ?? `Google token request failed (HTTP ${res.status})`,
        res.status,
        json,
      );
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? '',
      accessTokenExpiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
  }

  async listProperties(tokens: GscTokens): Promise<GscPropertyInfo[]> {
    const data = (await this.getJson(tokens, SITE_LIST_URL)) as {
      siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
    };
    return (data.siteEntry ?? [])
      .map((entry) => ({
        siteUrl: entry.siteUrl,
        permissionLevel: entry.permissionLevel,
        type: (entry.siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX') as 'URL_PREFIX' | 'DOMAIN',
      }))
      .filter((property) => property.permissionLevel !== 'siteUnverifiedUser');
  }

  async searchAnalytics(tokens: GscTokens, siteUrl: string, request: SearchAnalyticsRequest): Promise<SearchAnalyticsRow[]> {
    const body = {
      startDate: request.startDate,
      endDate: request.endDate,
      dimensions: request.dimensions,
      rowLimit: request.rowLimit ?? 1000,
      startRow: request.startRow ?? 0,
      dataState: 'final' as const,
    };
    const data = (await this.postJson(tokens, searchAnalyticsUrl(siteUrl), body)) as {
      rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    };
    return (data.rows ?? []).map((row) => ({
      keys: row.keys,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
  }

  private async getJson(tokens: GscTokens, url: string): Promise<unknown> {
    return this.request(tokens, url, { method: 'GET' });
  }

  private async postJson(tokens: GscTokens, url: string, body: unknown): Promise<unknown> {
    return this.request(tokens, url, { method: 'POST', body: JSON.stringify(body) });
  }

  private async request(
    tokens: GscTokens,
    url: string,
    init: { method: string; body?: string },
  ): Promise<unknown> {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: init.body,
    });
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      throw new GscClientError(extractMessage(body, res.status), res.status, body);
    }
    return body;
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const candidate = body as { error?: { message?: unknown }; message?: unknown };
    if (typeof candidate.error?.message === 'string') return candidate.error.message;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return `Google Search Console API returned HTTP ${status}`;
}

/** Shared time helpers for incremental sync. All dates are local calendar days (yyyy-mm-dd). */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function shiftDateString(dateString: string, days: number): string {
  const parts = dateString.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  return toDateString(addDays(new Date(y, m, d), days));
}
