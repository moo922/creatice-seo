import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from '@creative-seo/database';
import type { ActivityLogDto, Paginated } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';

export interface ListActivitiesParams {
  page: number;
  perPage: number;
  siteId?: string;
  userId?: string;
  organizationId?: string;
  action?: string;
}

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly logs: Repository<ActivityLog>,
    private readonly siteAccess: SiteAccessService,
  ) {}

  async list(params: ListActivitiesParams, principal: AuthPrincipal): Promise<Paginated<ActivityLogDto>> {
    const query = this.logs.createQueryBuilder('log');

    if (params.siteId) {
      query.andWhere('log.siteId = :siteId', { siteId: params.siteId });
    }
    if (params.userId) {
      query.andWhere('log.userId = :userId', { userId: params.userId });
    }
    if (params.organizationId) {
      query.andWhere('log.organizationId = :organizationId', {
        organizationId: params.organizationId,
      });
    }
    if (params.action) {
      query.andWhere('log.action = :action', { action: params.action });
    }

    if (!this.siteAccess.isGlobal(principal)) {
      const memberSiteIds = await this.siteAccess.memberSiteIds(principal.id);
      query.andWhere(
        '(log.siteId IN (:...memberSiteIds) OR log.organizationId = :ownOrg)',
        { memberSiteIds: memberSiteIds.length ? memberSiteIds : [''], ownOrg: principal.organizationId ?? '' },
      );
    }

    query.orderBy('log.createdAt', 'DESC');

    const [rows, total] = await Promise.all([
      query
        .skip((params.page - 1) * params.perPage)
        .take(params.perPage)
        .getMany(),
      query.getCount(),
    ]);

    const totalPages = Math.ceil(total / params.perPage);
    return {
      data: rows.map(toDto),
      meta: { page: params.page, perPage: params.perPage, total, totalPages },
    };
  }
}

function toDto(log: ActivityLog): ActivityLogDto {
  return {
    id: log.id,
    userId: log.userId,
    organizationId: log.organizationId,
    siteId: log.siteId,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    meta: log.meta,
    ip: log.ip,
    createdAt: log.createdAt.toISOString(),
  };
}
