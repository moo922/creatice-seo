import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isPublicAddress } from '@creative-seo/config';
import { AppConfig } from '../../config/app-config';

/**
 * Credentials for the WordPress connector (decrypted from a WORDPRESS site
 * secret). Never logged.
 */
export interface WordPressCredentials {
  url: string;
  username: string;
  password: string;
}

/**
 * Paginated response shape returned by the connector's GET /posts.
 */
export interface ConnectorPostPage {
  items: ConnectorPostItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ConnectorPostItem {
  wp_post_id: number;
  post_type: string;
  url: string;
  slug: string;
  status: string;
  title: string;
  content_hash: string;
  modified: string;
  modified_ts: number;
  seo?: {
    available: boolean;
    title: string;
    description: string;
    canonical: string;
    robots: string[];
    focus_keywords: string;
    schema: unknown;
  };
}

export interface ConnectorRankMathDetection {
  detected: boolean;
  version: string | null;
  meta_keys: Record<string, string>;
}

export interface ConnectorPermissions {
  authenticated: boolean;
  can_read: boolean;
  can_write: boolean;
  can_manage: boolean;
}

export interface ConnectorSiteInfo {
  name: string;
  description: string;
  url: string;
  home_url: string;
  locale: string;
  wp_version: string;
  php_version: string;
  environment: string;
  active_plugins: number;
  connector: { name: string; version: string; namespace: string };
}

export interface ConnectorPlugin {
  file: string;
  slug: string;
  name: string;
  version: string;
  active: boolean;
}

export class WordPressClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'WordPressClientError';
  }
}

const CONNECTOR_PATH = 'wp-json/search-visibility-connector/v1';

/**
 * Typed HTTP client for the Search Visibility Connector WordPress plugin.
 *
 * - Server-to-server auth via WordPress Application Passwords (HTTP Basic).
 * - SSRF egress guard: rejects private/loopback/link-local/reserved hosts
 *   unless WP_ALLOW_PRIVATE_ADDRESSES is enabled (local development).
 * - Never logs credentials or content bodies.
 */
@Injectable()
export class WordPressClientService {
  private readonly logger = new Logger(WordPressClientService.name);

  constructor(private readonly config: AppConfig) {}

  health(creds: WordPressCredentials): Promise<Record<string, unknown>> {
    return this.get(creds, '/health') as Promise<Record<string, unknown>>;
  }

  info(creds: WordPressCredentials): Promise<ConnectorSiteInfo> {
    return this.get(creds, '/info') as Promise<ConnectorSiteInfo>;
  }

  plugins(creds: WordPressCredentials): Promise<{ plugins: ConnectorPlugin[]; total: number }> {
    return this.get(creds, '/plugins') as Promise<{ plugins: ConnectorPlugin[]; total: number }>;
  }

  rankMath(creds: WordPressCredentials): Promise<ConnectorRankMathDetection> {
    return this.get(creds, '/rank-math') as Promise<ConnectorRankMathDetection>;
  }

  permissions(creds: WordPressCredentials): Promise<ConnectorPermissions> {
    return this.get(creds, '/permissions') as Promise<ConnectorPermissions>;
  }

  postTypes(creds: WordPressCredentials): Promise<{ post_types: Array<{ name: string; label: string }>; total: number }> {
    return this.get(creds, '/post-types') as Promise<{
      post_types: Array<{ name: string; label: string }>;
      total: number;
    }>;
  }

  listPosts(creds: WordPressCredentials, query: { postType: string; status?: string; page: number; perPage?: number }): Promise<ConnectorPostPage> {
    const params = new URLSearchParams({
      post_type: query.postType,
      status: query.status ?? 'publish',
      page: String(query.page),
      per_page: String(query.perPage ?? 100),
    });
    return this.get(creds, `/posts?${params.toString()}`) as Promise<ConnectorPostPage>;
  }

  /**
   * Fetches a page of the connector's response and reads the auth/status via
   * the health endpoint against the site root. Used by the onboarding check.
   */
  async siteRootReachable(creds: WordPressCredentials): Promise<{ reachable: boolean; status: number | null }> {
    const url = this.normalizeBaseUrl(creds.url);
    try {
      const res = await this.request(url, { method: 'GET' }, false);
      return { reachable: true, status: res.status };
    } catch (error) {
      if (error instanceof WordPressClientError) {
        return { reachable: false, status: error.status };
      }
      return { reachable: false, status: null };
    }
  }

  private async get(creds: WordPressCredentials, path: string): Promise<unknown> {
    const base = this.normalizeBaseUrl(creds.url);
    const url = `${base}/${CONNECTOR_PATH}${path}`;
    const auth = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
    const res = await this.request(url, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    return this.parseJson(res);
  }

  private async request(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
    _authenticate = true,
  ): Promise<Response> {
    await this.assertPublicEgress(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.env.WP_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown network error';
      throw new WordPressClientError(`WordPress request failed: ${reason}`, null);
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
      const message = extractErrorMessage(body, res.status);
      throw new WordPressClientError(message, res.status, body);
    }
    return body;
  }

  private normalizeBaseUrl(input: string): string {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new WordPressClientError('WordPress URL must use http(s).', null);
    }
    return url.origin + url.pathname.replace(/\/$/, '');
  }

  /**
   * SSRF guard. Resolves the host and rejects non-public address space unless
   * explicitly allowed via WP_ALLOW_PRIVATE_ADDRESSES (dev only).
   */
  private async assertPublicEgress(url: string): Promise<void> {
    if (this.config.env.WP_ALLOW_PRIVATE_ADDRESSES) {
      return;
    }
    const { hostname } = new URL(url);
    let addresses: string[];
    try {
      addresses = (await lookup(hostname, { all: true })).map((entry) => entry.address);
    } catch {
      throw new WordPressClientError(`Unable to resolve WordPress host: ${hostname}`, null);
    }
    if (addresses.length === 0) {
      throw new WordPressClientError(`WordPress host resolved to no addresses: ${hostname}`, null);
    }
    const blocked = addresses.filter((address) => !isPublicAddress(address));
    if (blocked.length > 0) {
      throw new WordPressClientError(
        `Refusing to connect to non-public WordPress host (${hostname} resolves to ${blocked.join(', ')}). ` +
          'Set WP_ALLOW_PRIVATE_ADDRESSES=true only for local development.',
        null,
      );
    }
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string') {
    return (body as { message: string }).message;
  }
  return `WordPress connector returned HTTP ${status}`;
}
