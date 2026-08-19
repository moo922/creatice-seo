import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, Site, SiteMembership, User } from '@creative-seo/database';
import type { Paginated, SiteDto, SiteMembershipDto, SiteRole } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateMembershipDto, CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './sites.dto';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(SiteMembership) private readonly memberships: Repository<SiteMembership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly siteAccess: SiteAccessService,
    private readonly activities: ActivityLogService,
  ) {}

  async create(dto: CreateSiteDto, actor: AuthPrincipal, meta: RequestMeta): Promise<SiteDto> {
    const organizationId = await this.resolveOrganizationId(dto.organizationId, actor);

    const site = this.sites.create({
      organizationId,
      name: dto.name,
      domain: dto.domain.toLowerCase(),
      locale: dto.locale,
      language: dto.language,
      country: dto.country ?? null,
      targetCities: dto.targetCities ?? [],
      status: 'ACTIVE',
      settings: {},
      createdBy: actor.id,
    });
    const saved = await this.sites.save(site);

    const membership = this.memberships.create({
      siteId: saved.id,
      userId: actor.id,
      siteRole: 'OWNER',
      grantedBy: actor.id,
    });
    await this.memberships.save(membership);

    await this.activities.record({
      action: 'site.create',
      userId: actor.id,
      organizationId,
      siteId: saved.id,
      entityType: 'site',
      entityId: saved.id,
      meta: { name: saved.name, domain: saved.domain },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return toDto(saved);
  }

  /**
   * Resolves which client organization a new site belongs to. Explicit org wins;
   * a non-global actor falls back to their own organization; otherwise the
   * default client organization ("default-client", seeded at bootstrap) is used.
   */
  private async resolveOrganizationId(requested: string | undefined, actor: AuthPrincipal): Promise<string> {
    if (requested && (await this.organizations.exists({ where: { id: requested } }))) {
      return requested;
    }
    if (!this.siteAccess.isGlobal(actor) && actor.organizationId) {
      return actor.organizationId;
    }
    const defaultOrg = await this.organizations.findOne({ where: { slug: 'default-client' } });
    if (defaultOrg) {
      return defaultOrg.id;
    }
    throw new NotFoundException('No client organization found. Create an organization first.');
  }

  async list(query: SiteQueryDto, principal: AuthPrincipal): Promise<Paginated<SiteDto>> {
    const qb = this.sites.createQueryBuilder('site').orderBy('site.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere('(site.name ILIKE :search OR site.domain ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.status) {
      qb.andWhere('site.status = :status', { status: query.status });
    }
    if (query.organizationId && this.siteAccess.isGlobal(principal)) {
      qb.andWhere('site.organizationId = :organizationId', {
        organizationId: query.organizationId,
      });
    }
    if (!this.siteAccess.isGlobal(principal)) {
      const memberSiteIds = await this.siteAccess.memberSiteIds(principal.id);
      qb.andWhere(
        '(site.id IN (:...memberSiteIds) OR site.organizationId = :ownOrg)',
        {
          memberSiteIds: memberSiteIds.length ? memberSiteIds : [''],
          ownOrg: principal.organizationId ?? '',
        },
      );
    }

    const [rows, total] = await Promise.all([
      qb.skip((query.page - 1) * query.perPage).take(query.perPage).getMany(),
      qb.getCount(),
    ]);

    return {
      data: rows.map(toDto),
      meta: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async findByIdOrThrow(id: string, principal: AuthPrincipal): Promise<SiteDto> {
    await this.siteAccess.assertSiteAccess(principal, id);
    const site = await this.sites.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return toDto(site);
  }

  async update(id: string, dto: UpdateSiteDto, actor: AuthPrincipal, meta: RequestMeta): Promise<SiteDto> {
    await this.siteAccess.assertSiteAccess(actor, id);
    const site = await this.sites.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    if (dto.name !== undefined) site.name = dto.name;
    if (dto.domain !== undefined) site.domain = dto.domain.toLowerCase();
    if (dto.locale !== undefined) site.locale = dto.locale;
    if (dto.language !== undefined) site.language = dto.language;
    if (dto.country !== undefined) site.country = dto.country;
    if (dto.targetCities !== undefined) site.targetCities = dto.targetCities;
    if (dto.status !== undefined) site.status = dto.status;
    await this.sites.save(site);

    await this.activities.record({
      action: 'site.update',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId: id,
      entityType: 'site',
      entityId: id,
      meta: { changed: dto },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return toDto(site);
  }

  async archive(id: string, actor: AuthPrincipal, meta: RequestMeta): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, id);
    const site = await this.sites.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    site.status = 'ARCHIVED';
    await this.sites.save(site);

    await this.activities.record({
      action: 'site.delete',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId: id,
      entityType: 'site',
      entityId: id,
      meta: { archived: true },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async purgePreview(siteId: string) {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const TABLES_WITH_SITE_ID = [
      'activity_logs', 'aeo_page_audits', 'ai_jobs', 'ai_provider_configs',
      'ai_visibility_baselines', 'ai_visibility_budgets', 'ai_visibility_competitors',
      'ai_visibility_observations', 'ai_visibility_observations_v2',
      'ai_visibility_prompts', 'ai_visibility_prompt_sets', 'ai_visibility_prompt_sets_v2',
      'ai_visibility_runs', 'ai_visibility_snapshots', 'audit_results', 'audit_runs',
      'automation_runs', 'baseline_snapshots', 'cannibalization_cases', 'change_logs',
      'clusters', 'content_packages', 'content_publications', 'crawled_pages',
      'crawler_policy_results', 'crawl_errors', 'crawl_links', 'crawl_pages',
      'crawl_runs', 'decision_priority_weights', 'decision_recommendations',
      'decision_recommendation_dependencies', 'decision_recommendation_outcomes',
      'decision_work_packages', 'entity_relations', 'fact_evidence',
      'geo_page_audits', 'google_ads_integrations', 'gsc_page_daily_metrics',
      'gsc_query_daily_metrics', 'gsc_query_page_daily_metrics',
      'gsc_site_daily_metrics', 'gsc_tokens', 'issues', 'keywords',
      'keyword_discovery_jobs', 'keyword_opportunities', 'keyword_planner_metrics',
      'keyword_sources', 'knowledge_facts', 'lighthouse_runs', 'link_analyses',
      'link_suggestions', 'operations_alerts', 'operations_tasks', 'page_entities',
      'page_questions', 'recommendations', 'reports', 'report_branding',
      'site_activation_steps', 'site_automation_settings', 'site_memberships',
      'site_secrets', 'site_snapshots', 'url_mappings', 'work_item_states',
      'wp_integrations', 'wp_posts', 'workflow_jobs',
    ] as const;

    const impact: Record<string, number> = {};
    for (const table of TABLES_WITH_SITE_ID) {
      try {
        const result = await this.sites.manager.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE site_id = $1`, [siteId]);
        impact[table] = result[0]?.count ?? 0;
      } catch {
        impact[table] = -1;
      }
    }

    try {
      const gscProps = await this.sites.manager.query('SELECT COUNT(*)::int AS count FROM gsc_properties WHERE site_id = $1', [siteId]);
      impact['gsc_properties'] = gscProps[0]?.count ?? 0;
      const gscDaily = await this.sites.manager.query(
        'SELECT COUNT(*)::int AS count FROM gsc_daily_metrics WHERE property_id IN (SELECT id FROM gsc_properties WHERE site_id = $1)',
        [siteId],
      );
      impact['gsc_daily_metrics'] = gscDaily[0]?.count ?? 0;
    } catch { /* ignore */ }

    const totalRows = Object.values(impact).filter((v) => v > 0).reduce((s, v) => s + v, 0);

    return {
      siteId,
      domain: site.domain,
      impact,
      totalRows,
      preserved: [] as string[],
    };
  }

  async purge(siteId: string, confirmDomain: string, actor: AuthPrincipal, meta: RequestMeta) {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    if (confirmDomain.toLowerCase() !== site.domain.toLowerCase()) {
      throw new BadRequestException(
        `Domain confirmation does not match. Expected: ${site.domain}`,
      );
    }

    await this.activities.record({
      action: 'site.purge',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'site',
      entityId: siteId,
      meta: { domain: site.domain },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const TABLES_WITH_SITE_ID = [
      'activity_logs',
      'aeo_page_audits',
      'ai_jobs',
      'ai_provider_configs',
      'ai_visibility_baselines',
      'ai_visibility_budgets',
      'ai_visibility_competitors',
      'ai_visibility_observations',
      'ai_visibility_observations_v2',
      'ai_visibility_prompts',
      'ai_visibility_prompt_sets',
      'ai_visibility_prompt_sets_v2',
      'ai_visibility_runs',
      'ai_visibility_snapshots',
      'audit_results',
      'audit_runs',
      'automation_runs',
      'baseline_snapshots',
      'cannibalization_cases',
      'change_logs',
      'clusters',
      'content_packages',
      'content_publications',
      'crawled_pages',
      'crawler_policy_results',
      'crawl_errors',
      'crawl_links',
      'crawl_pages',
      'crawl_runs',
      'decision_priority_weights',
      'decision_recommendations',
      'decision_recommendation_dependencies',
      'decision_recommendation_outcomes',
      'decision_work_packages',
      'entity_relations',
      'fact_evidence',
      'geo_page_audits',
      'google_ads_integrations',
      'gsc_page_daily_metrics',
      'gsc_query_daily_metrics',
      'gsc_query_page_daily_metrics',
      'gsc_site_daily_metrics',
      'gsc_tokens',
      'issues',
      'keywords',
      'keyword_discovery_jobs',
      'keyword_opportunities',
      'keyword_planner_metrics',
      'keyword_sources',
      'knowledge_facts',
      'lighthouse_runs',
      'link_analyses',
      'link_suggestions',
      'operations_alerts',
      'operations_tasks',
      'page_entities',
      'page_questions',
      'recommendations',
      'reports',
      'report_branding',
      'site_activation_steps',
      'site_automation_settings',
      'site_memberships',
      'site_secrets',
      'site_snapshots',
      'url_mappings',
      'work_item_states',
      'wp_integrations',
      'wp_posts',
      'workflow_jobs',
    ];

    const childQuery = TABLES_WITH_SITE_ID.map((t) => `DELETE FROM ${t} WHERE site_id = $1`).join('; ');
    await this.sites.manager.query(childQuery, [siteId]);

    await this.sites.manager.query(
      'DELETE FROM gsc_daily_metrics WHERE property_id IN (SELECT id FROM gsc_properties WHERE site_id = $1)',
      [siteId],
    );

    await this.sites.manager.query('DELETE FROM gsc_properties WHERE site_id = $1', [siteId]);
    await this.sites.manager.query('DELETE FROM sites WHERE id = $1', [siteId]);

    return { deleted: true, siteId, domain: site.domain };
  }

  async addMember(
    siteId: string,
    dto: CreateMembershipDto,
    actor: AuthPrincipal,
    meta: RequestMeta,
  ): Promise<SiteMembershipDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    if (!(await this.users.exists({ where: { id: dto.userId } }))) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.memberships.exists({
      where: { siteId, userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this site');
    }

    const membership = this.memberships.create({
      siteId,
      userId: dto.userId,
      siteRole: dto.siteRole as SiteRole,
      grantedBy: actor.id,
    });
    const saved = await this.memberships.save(membership);

    await this.activities.record({
      action: 'site.membership.create',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'site_membership',
      entityId: saved.id,
      meta: { userId: dto.userId, siteRole: dto.siteRole },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return toMembershipDto(saved, dto.userId);
  }

  async listMembers(siteId: string, principal: AuthPrincipal): Promise<SiteMembershipDto[]> {
    await this.siteAccess.assertSiteAccess(principal, siteId);
    const rows = await this.memberships.find({
      where: { siteId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => toMembershipDto(row, row.userId));
  }

  async removeMember(siteId: string, userId: string, actor: AuthPrincipal, meta: RequestMeta): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    const membership = await this.memberships.findOne({ where: { siteId, userId } });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    await this.memberships.remove(membership);

    await this.activities.record({
      action: 'site.membership.delete',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'site_membership',
      entityId: membership.id,
      meta: { userId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

function toDto(site: Site): SiteDto {
  return {
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    domain: site.domain,
    locale: site.locale,
    language: site.language,
    country: site.country,
    targetCities: site.targetCities,
    status: site.status,
    settings: site.settings,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

function toMembershipDto(membership: SiteMembership, userId: string): SiteMembershipDto {
  return {
    id: membership.id,
    siteId: membership.siteId,
    userId,
    siteRole: membership.siteRole,
    grantedBy: membership.grantedBy,
    createdAt: membership.createdAt.toISOString(),
  };
}
