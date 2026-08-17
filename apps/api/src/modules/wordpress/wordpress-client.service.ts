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

/** Rank Math SEO metadata read from the connector. */
export interface ConnectorSeoMetadata {
  available: boolean;
  title: string;
  description: string;
  canonical: string;
  robots: string[];
  focus_keywords: string;
  schema: unknown;
}

/** Payload for writing Rank Math SEO metadata to the connector. */
export interface ConnectorSeoWritePayload {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string[];
  focus_keywords?: string;
  schema?: unknown;
}

/** Response from PUT /seo/{id}. */
export interface ConnectorSeoWriteResult {
  updated: string[];
  post_id: number;
  seo: ConnectorSeoMetadata;
}

/** Content read from the connector (POST /content/{id}). */
export interface ConnectorContentRead {
  id: number;
  content: string;
  content_hash: string;
  excerpt?: string;
}

/** Content write result from the connector. */
export interface ConnectorContentWriteResult {
  id: number;
  content: string;
  content_hash: string;
}

/** Internal link extracted from a post. */
export interface ConnectorInternalLink {
  url: string;
  anchor_text: string;
}

/** Response from GET /seo/{id}. */
export interface ConnectorSeoReadResult {
  id: number;
  rank_math: ConnectorSeoMetadata;
}

/** Connector capability discovery result. */
export interface ConnectorCapabilities {
  connectorVersion: string;
  wpVersion: string | null;
  phpVersion: string | null;
  rankMathDetected: boolean;
  rankMathVersion: string | null;
  canReadPosts: boolean;
  canWritePosts: boolean;
  canWriteSeoMetadata: boolean;
  canWriteSchema: boolean;
  canReadInternalLinks: boolean;
  canWriteContent: boolean;
  postTypes: string[];
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

  /** Creates a WordPress post as a draft via the connector. */
  async createDraft(
    creds: WordPressCredentials,
    input: { title: string; content: string; slug?: string; excerpt?: string; postType?: string },
  ): Promise<{ id: number; link: string; status: string }> {
    return this.post(creds, '/posts', {
      title: input.title,
      content: input.content,
      post_type: input.postType ?? 'post',
      status: 'draft',
      slug: input.slug ?? '',
      excerpt: input.excerpt ?? '',
    }) as Promise<{ id: number; link: string; status: string }>;
  }

  /** Sets a WordPress post's status (e.g. 'publish'). */
  async updatePostStatus(creds: WordPressCredentials, postId: number, status: string): Promise<{ id: number; link: string; status: string }> {
    return this.post(creds, `/posts/${postId}/status`, { status }) as Promise<{ id: number; link: string; status: string }>;
  }

  /** Fetches a post (with content) to verify a publication. */
  async getPost(creds: WordPressCredentials, postId: number): Promise<{ id: number; link: string; status: string; title: string; content?: string }> {
    return this.get(creds, `/posts/${postId}?include_content=1`) as Promise<{ id: number; link: string; status: string; title: string; content?: string }>;
  }

  /** Updates a post's title, slug, or content. */
  async updatePost(
    creds: WordPressCredentials,
    postId: number,
    patch: { title?: string; slug?: string; content?: string; excerpt?: string },
  ): Promise<{ id: number; link: string; status: string; title: string; content_hash: string }> {
    return this.patch(creds, `/posts/${postId}`, patch) as Promise<{
      id: number; link: string; status: string; title: string; content_hash: string;
    }>;
  }

  // ---- Rank Math SEO metadata ----

  /** Reads all Rank Math SEO metadata for a post. */
  async getSeoMetadata(creds: WordPressCredentials, postId: number): Promise<ConnectorSeoReadResult> {
    return this.get(creds, `/seo/${postId}`) as Promise<ConnectorSeoReadResult>;
  }

  /** Writes Rank Math SEO metadata to a post. Returns the written state. */
  async writeSeoMetadata(
    creds: WordPressCredentials,
    postId: number,
    payload: ConnectorSeoWritePayload,
  ): Promise<ConnectorSeoWriteResult> {
    return this.put(creds, `/seo/${postId}`, payload as Record<string, unknown>) as Promise<ConnectorSeoWriteResult>;
  }

  // ---- Content read/write ----

  /** Reads post content and its hash. */
  async getContent(creds: WordPressCredentials, postId: number): Promise<ConnectorContentRead> {
    return this.get(creds, `/content/${postId}`) as Promise<ConnectorContentRead>;
  }

  /** Writes post content (e.g. for internal link insertion). */
  async writeContent(
    creds: WordPressCredentials,
    postId: number,
    content: string,
  ): Promise<ConnectorContentWriteResult> {
    return this.put(creds, `/content/${postId}`, { content }) as Promise<ConnectorContentWriteResult>;
  }

  /** Extracts internal links from a post's rendered content. */
  async getInternalLinks(creds: WordPressCredentials, postId: number): Promise<ConnectorInternalLink[]> {
    return this.get(creds, `/content/${postId}/internal-links`) as Promise<ConnectorInternalLink[]>;
  }

  // ---- Capability discovery ----

  /**
   * Probes the connector to determine what operations are supported.
   * Used before publishing to fail fast if the connector doesn't support
   * the required operations (e.g. Rank Math SEO writes).
   */
  async discoverCapabilities(creds: WordPressCredentials): Promise<ConnectorCapabilities> {
    let connectorVersion = 'unknown';
    let wpVersion: string | null = null;
    let phpVersion: string | null = null;
    let rankMathDetected = false;
    let rankMathVersion: string | null = null;
    let canReadPosts = false;
    let canWritePosts = false;
    let canWriteSeoMetadata = false;
    let canWriteSchema = false;
    let canReadInternalLinks = false;
    let canWriteContent = false;
    let postTypes: string[] = [];

    try {
      const info = await this.info(creds);
      connectorVersion = info.connector?.version ?? 'unknown';
      wpVersion = info.wp_version ?? null;
      phpVersion = info.php_version ?? null;
    } catch {
      // info unavailable
    }

    try {
      const rm = await this.rankMath(creds);
      rankMathDetected = rm.detected;
      rankMathVersion = rm.version ?? null;
      canWriteSeoMetadata = rm.detected;
      canWriteSchema = rm.detected;
    } catch {
      // rank math unavailable
    }

    try {
      const perms = await this.permissions(creds);
      canReadPosts = perms.authenticated && perms.can_read;
      canWritePosts = perms.authenticated && perms.can_write;
      canWriteContent = canWritePosts;
      canReadInternalLinks = canReadPosts;
    } catch {
      // permissions unavailable
    }

    try {
      const types = await this.postTypes(creds);
      postTypes = types.post_types.map((t) => t.name);
    } catch {
      // post types unavailable
    }

    return {
      connectorVersion,
      wpVersion,
      phpVersion,
      rankMathDetected,
      rankMathVersion,
      canReadPosts,
      canWritePosts,
      canWriteSeoMetadata,
      canWriteSchema,
      canReadInternalLinks,
      canWriteContent,
      postTypes,
    };
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

  private async post(creds: WordPressCredentials, path: string, body: Record<string, unknown>): Promise<unknown> {
    const base = this.normalizeBaseUrl(creds.url);
    const url = `${base}/${CONNECTOR_PATH}${path}`;
    const auth = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
    const res = await this.request(url, {
      method: 'POST',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseJson(res);
  }

  private async put(creds: WordPressCredentials, path: string, body: Record<string, unknown>): Promise<unknown> {
    const base = this.normalizeBaseUrl(creds.url);
    const url = `${base}/${CONNECTOR_PATH}${path}`;
    const auth = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
    const res = await this.request(url, {
      method: 'PUT',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parseJson(res);
  }

  private async patch(creds: WordPressCredentials, path: string, body: Record<string, unknown>): Promise<unknown> {
    const base = this.normalizeBaseUrl(creds.url);
    const url = `${base}/${CONNECTOR_PATH}${path}`;
    const auth = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
    const res = await this.request(url, {
      method: 'PATCH',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
