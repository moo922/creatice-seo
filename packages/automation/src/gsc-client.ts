import { createHmac } from 'crypto';

/**
 * Minimal self-contained Search Console client + headless incremental sync used
 * by the scheduled automation executor. Mirrors the API GSC sync behavior but
 * runs with no user context: tokens are read from the same encrypted store and
 * refreshed against Google, then daily metrics and opportunities are upserted.
 * The platform (PostgreSQL) remains the source of truth — this only reads from
 * Google and appends/updates local rows.
 */

export interface GscSearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSearchAnalyticsResponse {
  rows?: GscSearchAnalyticsRow[];
}

export interface GscClientOptions {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  tokenBase: string;
}

export class GscClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: 'config' | 'network' | 'upstream' = 'upstream',
  ) {
    super(message);
    this.name = 'GscClientError';
  }
}

export class HeadlessGscClient {
  constructor(private readonly options: GscClientOptions) {}

  async searchAnalytics(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: string[],
  ): Promise<GscSearchAnalyticsResponse> {
    const res = await this.post(
      `${this.options.apiBase}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken,
      JSON.stringify({ startDate, endDate, dimensions, rowLimit: 25_000 }),
    );
    return (await this.parseJson(res)) as GscSearchAnalyticsResponse;
  }

  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new GscClientError('GSC OAuth credentials are not configured on the server', null, 'config');
    }
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: 'refresh_token',
    });
    const res = await this.postForm(`${this.options.tokenBase}/token`, body);
    const parsed = (await this.parseJson(res)) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!parsed.access_token) {
      throw new GscClientError(parsed.error_description ?? 'OAuth token refresh failed', res.status ?? null);
    }
    return { access_token: parsed.access_token, expires_in: parsed.expires_in ?? 3600 };
  }

  private async post(url: string, accessToken: string, body: string): Promise<Response> {
    return this.request(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
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
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      return await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: controller.signal });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown network error';
      throw new GscClientError(`Google API request failed: ${reason}`, null, 'network');
    } finally {
      clearTimeout(timeout);
    }
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
      throw new GscClientError(extractErrorMessage(body, res.status), res.status);
    }
    return body;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { error?: unknown; message?: unknown; error_description?: unknown };
    if (typeof record.error_description === 'string' && record.error_description.length > 0) return record.error_description;
    if (typeof record.error === 'object' && record.error && 'message' in record.error) {
      const inner = (record.error as { message?: unknown }).message;
      if (typeof inner === 'string') return inner;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return `Google API returned HTTP ${status}`;
}

export function gscRowKey(keys: string[]): string {
  return createHmac('sha1', 'gsc').update(keys.join('\u0001')).digest('hex');
}
