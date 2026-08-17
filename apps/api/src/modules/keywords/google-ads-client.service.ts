import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { GOOGLE_ADS_ERROR_CODES, type GoogleAdsErrorCode } from '@creative-seo/types';

/**
 * Google Ads Keyword Planner REST client (server-side only).
 *
 * - Credentials live in env + site_secrets and never reach the browser.
 * - Uses OAuth2 (refresh token flow) + a Google Ads developer token.
 * - Gracefully degrades when Keyword Planning is unavailable for an account
 *   (KEYWORD_PLANNER_UNAVAILABLE) so the keyword engine keeps running on GSC,
 *   manual seeds and site content.
 */

export interface GoogleAdsCredentials {
  developerToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  customerId: string;
}

export interface GoogleAdsKeywordIdea {
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string | null;
  competitionIndex: number | null;
  historicalMonths: Array<{ month: string; searches: number }> | null;
}

export interface KeywordPlanIdeaRequest {
  seeds: string[];
  language: string;
  locationIds: string[];
  pageSize: number;
}

export class GoogleAdsClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: GoogleAdsErrorCode,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'GoogleAdsClientError';
  }
}

@Injectable()
export class GoogleAdsClientService {
  private readonly logger = new Logger(GoogleAdsClientService.name);

  constructor(private readonly config: AppConfig) {}

  private get apiBase(): string {
    return this.config.env.GOOGLE_ADS_API_BASE;
  }

  private get apiVersion(): string {
    return this.config.env.GOOGLE_ADS_API_VERSION;
  }

  private get tokenEndpoint(): string {
    return `${this.config.env.GOOGLE_ADS_TOKEN_BASE}/token`;
  }

  private get devTokenConfigured(): boolean {
    return Boolean(this.config.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  }

  /**
   * Exchanges a refresh token for an access token (OAuth2 installed-app flow).
   * Tokens are never logged.
   */
  async getAccessToken(creds: GoogleAdsCredentials): Promise<string> {
    if (!this.devTokenConfigured) {
      throw new GoogleAdsClientError('GOOGLE_ADS_DEVELOPER_TOKEN is not configured on the server', null, 'DEVELOPER_TOKEN_ERROR');
    }
    const params = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(this.config.env.GOOGLE_ADS_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GoogleAdsClientError(`Google OAuth token exchange failed (${res.status})`, res.status, 'AUTH_FAILURE', body);
    }
    const data = (await res.json()) as { access_token: string };
    if (!data.access_token) {
      throw new GoogleAdsClientError('Google OAuth token exchange returned no access token', null, 'AUTH_FAILURE');
    }
    return data.access_token;
  }

  /**
   * Calls the Keyword Planner GenerateKeywordIdeas REST endpoint for the given
   * customer id. Throws GoogleAdsClientError on failure (never swallows).
   */
  async generateKeywordIdeas(creds: GoogleAdsCredentials, request: KeywordPlanIdeaRequest): Promise<GoogleAdsKeywordIdea[]> {
    if (!this.devTokenConfigured) {
      throw new GoogleAdsClientError('GOOGLE_ADS_DEVELOPER_TOKEN is not configured on the server', null, 'DEVELOPER_TOKEN_ERROR');
    }
    const accessToken = await this.getAccessToken(creds);
    const url = `${this.apiBase}/${this.apiVersion}/customers/${creds.customerId}/keywordPlanAdGroups:generateKeywordIdeas`;
    const payload = {
      keyword_plan_seed: {
        keyword_seeds: request.seeds.map((seed) => ({ keyword: seed })),
        url_seeds: [],
      },
      keyword_and_url_seed: null,
      language: request.language,
      geo_target_constants: request.locationIds.map((id) => ({ resource_name: `geoTargetConstants/${id}` })),
      page_size: request.pageSize,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.env.GOOGLE_ADS_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw await this.mapError(res);
    }
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return (data.results ?? []).map(parseIdeaResult);
  }

  private async mapError(res: Response): Promise<GoogleAdsClientError> {
    const status = res.status;
    const body = await res.text().catch(() => '');
    let code: GoogleAdsErrorCode = 'TEMPORARY_API_ERROR';
    if (status === 401 || status === 403) {
      code = 'AUTH_FAILURE';
    } else if (status === 429) {
      code = 'RATE_LIMITED';
    } else if (status === 400 && body.includes('Keyword planning is not available')) {
      code = 'KEYWORD_PLANNER_UNAVAILABLE';
    } else if (body.includes('invalid geo target')) {
      code = 'INVALID_LOCATION';
    } else if (body.includes('invalid language')) {
      code = 'INVALID_LANGUAGE';
    }
    return new GoogleAdsClientError(`Google Ads Keyword Planner failed (${status})`, status, code, body);
  }
}

function parseIdeaResult(row: Record<string, unknown>): GoogleAdsKeywordIdea {
  const metrics = (row['keyword_idea_metrics'] ?? {}) as Record<string, unknown>;
  const text = (row['text'] as string) ?? '';
  const competition = (metrics['competition'] as string) ?? null;
  const competitionIndex = metrics['competition_index'] != null ? Number(metrics['competition_index']) : null;
  const monthly = (metrics['monthly_search_volumes'] ?? []) as Array<{ year: number; month: number; searches: number }>;
  const avg = monthly.length > 0 ? Math.round(monthly.reduce((sum, m) => sum + m.searches, 0) / monthly.length) : null;
  return {
    keyword: text,
    avgMonthlySearches: avg,
    competition: competition ? competition.replace(/^UNKNOWN$/, '') : null,
    competitionIndex,
    historicalMonths: monthly.map((m) => ({
      month: `${m.year}-${String(m.month).padStart(2, '0')}`,
      searches: m.searches,
    })),
  };
}

export function isGoogleAdsClientError(error: unknown): error is GoogleAdsClientError {
  return error instanceof GoogleAdsClientError;
}

export { GOOGLE_ADS_ERROR_CODES };