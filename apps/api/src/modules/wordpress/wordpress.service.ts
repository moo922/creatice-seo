import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Site,
  SiteSecret,
  WordPressIntegration,
  WordPressPost,
} from '@creative-seo/database';
import type {
  Paginated,
  WordPressCheckResultDto,
  WordPressCheckStepResult,
  WordPressImportedPostDto,
  WordPressIntegrationDto,
  WordPressIntegrationSummaryDto,
  WordPressSyncQuery,
  WordPressSyncResultDto,
} from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { EncryptionService } from '../../security/encryption.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import type { RequestMeta } from '../secrets/secrets.service';
import {
  WordPressClientService,
  type ConnectorPostItem,
  type WordPressCredentials,
} from './wordpress-client.service';

export interface ListImportedPostsQuery {
  page: number;
  perPage: number;
  search?: string;
}

interface SyncCounters {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);

  constructor(
    @InjectRepository(WordPressIntegration)
    private readonly integrations: Repository<WordPressIntegration>,
    @InjectRepository(WordPressPost)
    private readonly posts: Repository<WordPressPost>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    @InjectRepository(SiteSecret)
    private readonly secrets: Repository<SiteSecret>,
    private readonly client: WordPressClientService,
    private readonly encryption: EncryptionService,
    private readonly siteAccess: SiteAccessService,
    private readonly activities: ActivityLogService,
  ) {}

  /**
   * Onboarding health check: WordPress reachable -> connector reachable ->
   * authentication valid -> Rank Math detected -> permissions valid. Persists a
   * snapshot of the site and updates the integration status.
   */
  async checkConnection(
    siteId: string,
    actor: AuthPrincipal,
    meta: RequestMeta = {},
  ): Promise<WordPressCheckResultDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const { site, creds } = await this.loadConnection(siteId);
    const integration = await this.getOrCreateIntegration(siteId, creds.url);

    const steps: WordPressCheckStepResult[] = [];

    const root = await this.client.siteRootReachable(creds);
    steps.push({
      key: 'wordpress_reachable',
      status: root.reachable ? 'ok' : 'failed',
      message: root.reachable
        ? `WordPress responded with HTTP ${root.status}`
        : 'WordPress did not respond',
    });

    let info = null;
    let rankMath = null;
    let permissions = null;
    let plugins: { slug: string; version: string }[] = [];

    if (root.reachable) {
      try {
        info = await this.client.info(creds);
        steps.push({ key: 'connector_reachable', status: 'ok', message: 'Connector reachable' });
      } catch (error) {
        steps.push({
          key: 'connector_reachable',
          status: 'failed',
          message: errorMessage(error, 'Connector not reachable'),
        });
      }
    } else {
      steps.push({
        key: 'connector_reachable',
        status: 'skipped',
        message: 'WordPress unreachable; skipped',
      });
    }

    if (info) {
      try {
        rankMath = await this.client.rankMath(creds);
        steps.push({
          key: 'rank_math',
          status: rankMath.detected ? 'ok' : 'failed',
          message: rankMath.detected
            ? `Rank Math ${rankMath.version ?? 'detected'}`
            : 'Rank Math not detected',
          detail: { detected: rankMath.detected, version: rankMath.version ?? null },
        });
      } catch (error) {
        steps.push({ key: 'rank_math', status: 'failed', message: errorMessage(error, 'Rank Math detection failed') });
      }

      try {
        permissions = await this.client.permissions(creds);
        const ok = permissions.authenticated && permissions.can_read && permissions.can_write;
        steps.push({
          key: 'permissions',
          status: ok ? 'ok' : 'failed',
          message: ok
            ? 'Read + write permissions valid'
            : `Permissions invalid: ${permissionsDescription(permissions)}`,
          detail: permissions as unknown as Record<string, unknown>,
        });
      } catch (error) {
        steps.push({ key: 'permissions', status: 'failed', message: errorMessage(error, 'Permission probe failed') });
      }

      try {
        plugins = (await this.client.plugins(creds)).plugins.map((p) => ({ slug: p.slug, version: p.version }));
      } catch {
        plugins = [];
      }
    } else {
      steps.push({ key: 'rank_math', status: 'skipped', message: 'Skipped: connector unreachable' });
      steps.push({ key: 'permissions', status: 'skipped', message: 'Skipped: connector unreachable' });
    }

    const passed = steps.length > 0 && steps.every((step) => step.status === 'ok');

    integration.status = passed ? 'CONNECTED' : 'FAILED';
    integration.lastCheckedAt = new Date();
    integration.lastError = passed ? null : steps.find((s) => s.status !== 'ok')?.message ?? 'Connection check failed';
    integration.activePlugins = plugins;
    if (info) {
      integration.wpVersion = info.wp_version ?? null;
      integration.phpVersion = info.php_version ?? null;
    }
    if (rankMath) {
      integration.rankMathDetected = rankMath.detected;
      integration.rankMathVersion = rankMath.version ?? null;
    }
    const saved = await this.integrations.save(integration);

    await this.activities.record({
      action: 'wordpress.check',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'wp_integration',
      entityId: saved.id,
      meta: { passed, steps: steps.map((s) => s.key) },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { integration: this.toIntegrationDto(saved), steps, passed };
  }

  /**
   * Idempotent import of WordPress posts/pages into PostgreSQL. Upserts are
   * keyed on (site_id, wp_post_id); re-running converges and never duplicates.
   * Content bodies are not transferred — only hashes and Rank Math metadata.
   */
  async sync(
    siteId: string,
    query: WordPressSyncQuery,
    actor: AuthPrincipal,
    meta: RequestMeta = {},
  ): Promise<WordPressSyncResultDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const { site, creds } = await this.loadConnection(siteId);
    const integration = await this.getOrCreateIntegration(siteId, creds.url);

    const status = query.status ?? 'publish';
    const counters: SyncCounters = { created: 0, updated: 0, unchanged: 0, failed: 0 };
    let postTypes: string[] = [];
    let total = 0;

    try {
      const available = (await this.client.postTypes(creds)).post_types
        .map((t) => t.name)
        .filter((name) => name !== 'attachment');

      postTypes = available;
      if (query.postTypes) {
        const wanted = query.postTypes.split(',').map((t) => t.trim()).filter(Boolean);
        if (wanted.length > 0) {
          postTypes = wanted.filter((t) => available.includes(t));
        }
      }
      if (postTypes.length === 0) {
        throw new BadRequestException('No importable post types found on the WordPress site');
      }

      const seen = new Set<string>();
      for (const postType of postTypes) {
        let page = 1;
        let totalPages = 1;
        do {
          const result = await this.client.listPosts(creds, {
            postType,
            status,
            page,
            perPage: 100,
          });
          totalPages = result.total_pages;
          for (const item of result.items) {
            seen.add(`${postType}:${item.wp_post_id}`);
            await this.upsertPost(siteId, item, counters);
            total += 1;
          }
          page += 1;
        } while (page <= totalPages);
      }

      if (query.prune) {
        const removed = await this.pruneMissing(siteId, seen);
        this.logger.log(`[sync] pruned ${removed} stale rows for site ${siteId}`);
      }

      integration.lastSyncAt = new Date();
      integration.lastSyncSummary = {
        created: counters.created,
        updated: counters.updated,
        unchanged: counters.unchanged,
        total,
      };
      integration.lastError = null;
      await this.integrations.save(integration);
    } catch (error) {
      integration.status = 'FAILED';
      integration.lastError = errorMessage(error, 'Sync failed');
      await this.integrations.save(integration);
      throw error;
    }

    await this.activities.record({
      action: 'wordpress.sync',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'wp_integration',
      entityId: integration.id,
      meta: { ...counters, postTypes, total },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      siteId,
      status: toStatus(integration.status),
      created: counters.created,
      updated: counters.updated,
      unchanged: counters.unchanged,
      failed: counters.failed,
      total,
      postTypes,
      lastSyncAt: integration.lastSyncAt.toISOString(),
    };
  }

  async getIntegration(siteId: string, actor: AuthPrincipal): Promise<WordPressIntegrationDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const integration = await this.integrations.findOne({ where: { siteId } });
    if (!integration) {
      throw new NotFoundException('No WordPress integration configured for this site');
    }
    return this.toIntegrationDto(integration);
  }

  async listIntegrations(
    principal: AuthPrincipal,
    page: number,
    perPage: number,
  ): Promise<Paginated<WordPressIntegrationSummaryDto>> {
    const scopeIds = this.siteAccess.isGlobal(principal) ? null : await this.siteAccess.memberSiteIds(principal.id);
    if (scopeIds && scopeIds.length === 0) {
      return { data: [], meta: { page, perPage, total: 0, totalPages: 0 } };
    }

    const [rows, total] = await this.integrations.findAndCount({
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      ...(scopeIds ? { where: { siteId: In(scopeIds) } } : {}),
    });

    const siteById = new Map<string, Site>();
    if (rows.length > 0) {
      const sites = await this.sites.findBy({ id: In(rows.map((row) => row.siteId)) });
      sites.forEach((site) => siteById.set(site.id, site));
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    return {
      data: rows.map((row) => this.toSummaryDto(row, siteById.get(row.siteId))),
      meta: { page, perPage, total, totalPages },
    };
  }

  async listImportedPosts(
    siteId: string,
    actor: AuthPrincipal,
    query: ListImportedPostsQuery,
  ): Promise<Paginated<WordPressImportedPostDto>> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const qb = this.posts.createQueryBuilder('wp').where('wp.site_id = :siteId', { siteId });
    if (query.search) {
      qb.andWhere('(wp.title ILIKE :search OR wp.slug ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('wp.modified_at', 'DESC')
      .skip((query.page - 1) * query.perPage)
      .take(query.perPage)
      .getManyAndCount();
    return {
      data: rows.map(this.toPostDto),
      meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.max(1, Math.ceil(total / query.perPage)) },
    };
  }

  async remove(siteId: string, actor: AuthPrincipal, meta: RequestMeta = {}): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const integration = await this.integrations.findOne({ where: { siteId } });
    if (!integration) {
      throw new NotFoundException('No WordPress integration configured for this site');
    }
    await this.posts.delete({ siteId });
    await this.integrations.remove(integration);

    await this.activities.record({
      action: 'wordpress.disconnect',
      userId: actor.id,
      siteId,
      entityType: 'wp_integration',
      entityId: integration.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  private async upsertPost(siteId: string, item: ConnectorPostItem, counters: SyncCounters): Promise<void> {
    const wpPostId = String(item.wp_post_id);
    const modifiedAt = new Date(item.modified_ts * 1000);

    try {
      const existing = await this.posts.findOne({ where: { siteId, wpPostId } });
      const snapshot = {
        postType: item.post_type,
        url: item.url,
        slug: item.slug,
        status: item.status,
        title: item.title,
        contentHash: item.content_hash,
        rankMath: (item.seo ?? {}) as Record<string, unknown>,
        modifiedAt,
      };

      if (!existing) {
        await this.posts.save(
          this.posts.create({ siteId, wpPostId, ...snapshot, meta: {} }),
        );
        counters.created += 1;
        return;
      }

      const unchanged =
        existing.contentHash === item.content_hash &&
        existing.modifiedAt.getTime() === modifiedAt.getTime();

      Object.assign(existing, snapshot);
      await this.posts.save(existing);

      if (unchanged) {
        counters.unchanged += 1;
      } else {
        counters.updated += 1;
      }
    } catch (error) {
      this.logger.warn(`[sync] failed to upsert wp_post_id=${wpPostId}: ${errorMessage(error, 'upsert error')}`);
      counters.failed += 1;
    }
  }

  private async pruneMissing(siteId: string, seen: Set<string>): Promise<number> {
    const rows = await this.posts.find({ where: { siteId }, select: { id: true, wpPostId: true, postType: true } });
    const stale = rows.filter((row) => !seen.has(`${row.postType}:${row.wpPostId}`));
    if (stale.length > 0) {
      await this.posts.delete(stale.map((row) => row.id));
    }
    return stale.length;
  }

  private async loadConnection(siteId: string): Promise<{ site: Site; creds: WordPressCredentials }> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    const secret = await this.secrets.findOne({
      where: { siteId, kind: 'WORDPRESS' },
      order: { createdAt: 'DESC' },
    });
    if (!secret) {
      throw new BadRequestException(
        'No WordPress credentials configured. Add a WORDPRESS site secret (url, username, password) first.',
      );
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(this.encryption.decrypt(secret.encryptedPayload)) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('WordPress credentials are corrupted; re-save the WORDPRESS secret');
    }
    const url = stringField(payload.url, 'url');
    const username = stringField(payload.username, 'username');
    const password = stringField(payload.password, 'password');
    return { site, creds: { url, username, password } };
  }

  private async getOrCreateIntegration(siteId: string, wpUrl: string): Promise<WordPressIntegration> {
    const existing = await this.integrations.findOne({ where: { siteId } });
    if (existing) {
      return existing;
    }
    return this.integrations.save(this.integrations.create({ siteId, wpUrl, status: 'PENDING' }));
  }

  private toIntegrationDto(row: WordPressIntegration): WordPressIntegrationDto {
    return {
      id: row.id,
      siteId: row.siteId,
      status: toStatus(row.status),
      wpUrl: row.wpUrl,
      wpVersion: row.wpVersion,
      phpVersion: row.phpVersion,
      rankMathDetected: row.rankMathDetected,
      rankMathVersion: row.rankMathVersion,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
      lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
      lastSyncSummary: row.lastSyncSummary
        ? {
            created: num(row.lastSyncSummary.created),
            updated: num(row.lastSyncSummary.updated),
            unchanged: num(row.lastSyncSummary.unchanged),
            total: num(row.lastSyncSummary.total),
          }
        : null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toSummaryDto(row: WordPressIntegration, site?: Site): WordPressIntegrationSummaryDto {
    return {
      integration: this.toIntegrationDto(row),
      site: {
        id: site?.id ?? row.siteId,
        name: site?.name ?? '',
        domain: site?.domain ?? '',
        status: site?.status ?? 'ACTIVE',
      },
    };
  }

  private toPostDto(row: WordPressPost): WordPressImportedPostDto {
    return {
      id: row.id,
      siteId: row.siteId,
      wpPostId: Number(row.wpPostId),
      postType: row.postType,
      url: row.url,
      slug: row.slug,
      status: row.status,
      title: row.title,
      contentHash: row.contentHash,
      rankMath: row.rankMath,
      modifiedAt: row.modifiedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function toStatus(value: string): WordPressIntegrationDto['status'] {
  return value === 'CONNECTED' || value === 'FAILED' ? value : 'PENDING';
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`WordPress secret field '${field}' must be a non-empty string`);
  }
  return value.trim();
}

function permissionsDescription(p: { authenticated: boolean; can_read: boolean; can_write: boolean }): string {
  if (!p.authenticated) return 'authentication failed';
  const missing: string[] = [];
  if (!p.can_read) missing.push('read');
  if (!p.can_write) missing.push('write');
  return `missing: ${missing.join(', ')}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
