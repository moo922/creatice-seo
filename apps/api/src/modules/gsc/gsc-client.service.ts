import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';

/**
 * Google OAuth 2.0 + Search Console API client (server-side only).
 *
 * - Tokens are exchanged/refreshed on the backend and never reach the browser.
 * - Access tokens are passed to Google directly; they are never logged.
 * - The API base is the Search Console webmasters v3 endpoint.
 */

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface GscSiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscSearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSearchAnalyticsResponse {
  rows?: GscSearchAnalyticsRow[];
  rowCount?: number;
}

export class GscClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: unknown,
    readonly kind: 'config' | 'network' | 'upstream' = 'upstream',
  ) {
    super(message);
    this.name = 'GscClientError';
  }
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class GscClientService {
  constructor(private readonly config: AppConfig) {}

  private get apiBase(): string {
    return this.config.env.GSC_API_BASE;
  }

  private get tokenEndpoint(): string {
    return `${this.config.env.GSC_TOKEN_BASE}/token`;
  }

  /** OAuth authorization URL for connecting the user's Search Console. */
  buildAuthorizeUrl(state: string): string {
    const env = this.config.env;
    if (!env.GSC_CLIENT_ID) {
      throw new GscClientError('GSC_CLIENT_ID is not configured on the server', null, undefined, 'config');
    }
    const params = new URLSearchParams({
      client_id: env.GSC_CLIENT_ID,
      redirect_uri: env.GSC_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const env = this.config.env;
    if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) {
      throw new GscClientError('GSC OAuth credentials are not configured on the server', null, undefined, 'config');
    }
    const body = new URLSearchParams({
      code,
      client_id: env.GSC_CLIENT_ID,
      client_secret: env.GSC_CLIENT_SECRET,
      redirect_uri: env.GSC_REDIRECT_URI,
      grant_type: 'authorization_code',
    });
    const res = await this.postForm(this.tokenEndpoint, body);
    return this.parseToken(res);
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const env = this.config.env;
    if (!env.GSC_CLIENT_ID || !env.GSC_CLIENT_SECRET) {
      throw new GscClientError('GSC OAuth credentials are not configured on the server', null, undefined, 'config');
    }
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GSC_CLIENT_ID,
      client_secret: env.GSC_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });
    const res = await this.postForm(this.tokenEndpoint, body);
    return this.parseToken(res);
  }

  async listSites(accessToken: string): Promise<GscSiteEntry[]> {
    const res = await this.get(`${this.apiBase}/sites`, accessToken);
    const body = (await this.parseJson(res)) as { siteEntry?: GscSiteEntry[] };
    return body.siteEntry ?? [];
  }

  async searchAnalytics(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: string[],
  ): Promise<GscSearchAnalyticsResponse> {
    const payload = {
      startDate,
      endDate,
      dimensions,
      rowLimit: 25_000,
    };
    const res = await this.post(
      `${this.apiBase}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken,
      JSON.stringify(payload),
    );
    return (await this.parseJson(res)) as GscSearchAnalyticsResponse;
  }

  private async get(url: string, accessToken: string): Promise<Response> {
    return this.request(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  }

  private async post(url: string, accessToken: string, body: string): Promise<Response> {
    return this.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
    });
  }

  private async postForm(url: string, body: URLSearchParams): Promise<Response> {
    return this.request(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  private async request(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown network error';
      throw new GscClientError(`Google API request failed: ${reason}`, null, undefined, 'network');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseToken(res: Response): Promise<GoogleTokenResponse> {
    const body = (await this.parseJson(res)) as Partial<GoogleTokenResponse> & { error_description?: string };
    if (!body.access_token) {
      throw new GscClientError(body.error_description ?? 'OAuth token exchange failed', res.status, body);
    }
    return body as GoogleTokenResponse;
  }

  private async parseJson(res: Response): Promise<unknown> {
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const message = extractErrorMessage(body, res.status);
      throw new GscClientError(message, res.status, body);
    }
    return body;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { error?: unknown; message?: unknown; error_description?: unknown };
    if (typeof record.error_description === 'string' && record.error_description.length > 0) {
      return record.error_description;
    }
    if (typeof record.error === 'object' && record.error && 'message' in record.error) {
      const inner = (record.error as { message?: unknown }).message;
      if (typeof inner === 'string') {
        return inner;
      }
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
  }
  return `Google API returned HTTP ${status}`;
}
