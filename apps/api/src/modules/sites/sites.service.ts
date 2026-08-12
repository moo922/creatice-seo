import {
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
    if (!(await this.organizations.exists({ where: { id: dto.organizationId } }))) {
      throw new NotFoundException('Organization not found');
    }

    const site = this.sites.create({
      organizationId: dto.organizationId,
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
      organizationId: dto.organizationId,
      siteId: saved.id,
      entityType: 'site',
      entityId: saved.id,
      meta: { name: saved.name, domain: saved.domain },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return toDto(saved);
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
