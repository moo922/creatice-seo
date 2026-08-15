import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeFact } from '@creative-seo/database';
import type { KnowledgeFactDto } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  CreateKnowledgeFactDto,
  ListKnowledgeFactsDto,
  UpdateKnowledgeFactDto,
} from './knowledge-base.dto';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KnowledgeFact)
    private readonly facts: Repository<KnowledgeFact>,
    private readonly siteAccess: SiteAccessService,
    private readonly activities: ActivityLogService,
  ) {}

  async list(
    query: ListKnowledgeFactsDto,
    principal: AuthPrincipal,
  ): Promise<KnowledgeFactDto[]> {
    const builder = this.facts
      .createQueryBuilder('fact')
      .orderBy('fact.category', 'ASC')
      .addOrderBy('fact.key', 'ASC');

    if (query.siteId) {
      await this.siteAccess.assertSiteAccess(principal, query.siteId);
      builder.andWhere('fact.siteId = :siteId', { siteId: query.siteId });
    } else if (!this.siteAccess.isGlobal(principal)) {
      const siteIds = await this.siteAccess.memberSiteIds(principal.id);
      builder.andWhere(
        'fact.siteId IN (:...siteIds)',
        { siteIds: siteIds.length ? siteIds : [''] },
      );
    }

    if (query.category) {
      builder.andWhere('fact.category = :category', { category: query.category });
    }

    builder.limit(query.perPage);
    const rows = await builder.getMany();
    return rows.map(toDto);
  }

  async listBySite(siteId: string, principal: AuthPrincipal): Promise<KnowledgeFactDto[]> {
    await this.siteAccess.assertSiteAccess(principal, siteId);
    const rows = await this.facts.find({
      where: { siteId },
      order: { category: 'ASC', key: 'ASC' },
    });
    return rows.map(toDto);
  }

  async create(
    siteId: string,
    dto: CreateKnowledgeFactDto,
    actor: AuthPrincipal,
  ): Promise<KnowledgeFactDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);

    const key = normalizeKey(dto.key);
    if (await this.facts.exists({ where: { siteId, key } })) {
      throw new ConflictException(`A fact with key "${dto.key}" already exists for this site`);
    }

    const fact = this.facts.create({
      siteId,
      category: dto.category,
      key,
      value: dto.value,
      verificationStatus: dto.verificationStatus,
      source: dto.source ?? null,
      notes: dto.notes ?? null,
      createdBy: actor.id,
    });
    const saved = await this.facts.save(fact);

    await this.activities.record({
      action: 'knowledge.fact.create',
      userId: actor.id,
      organizationId: actor.organizationId,
      siteId,
      entityType: 'knowledge_fact',
      entityId: saved.id,
      meta: { category: saved.category, key: saved.key },
    });

    return toDto(saved);
  }

  async update(
    siteId: string,
    factId: string,
    dto: UpdateKnowledgeFactDto,
    actor: AuthPrincipal,
  ): Promise<KnowledgeFactDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const fact = await this.facts.findOne({ where: { id: factId, siteId } });
    if (!fact) {
      throw new NotFoundException('Knowledge fact not found');
    }

    if (dto.key !== undefined) {
      const key = normalizeKey(dto.key);
      if (key !== fact.key && (await this.facts.exists({ where: { siteId, key } }))) {
        throw new ConflictException(`A fact with key "${dto.key}" already exists for this site`);
      }
      fact.key = key;
    }
    if (dto.value !== undefined) fact.value = dto.value;
    if (dto.verificationStatus !== undefined) fact.verificationStatus = dto.verificationStatus;
    if (dto.source !== undefined) fact.source = dto.source;
    if (dto.notes !== undefined) fact.notes = dto.notes;

    const saved = await this.facts.save(fact);

    await this.activities.record({
      action: 'knowledge.fact.update',
      userId: actor.id,
      organizationId: actor.organizationId,
      siteId,
      entityType: 'knowledge_fact',
      entityId: saved.id,
      meta: { changed: dto },
    });

    return toDto(saved);
  }

  async remove(siteId: string, factId: string, actor: AuthPrincipal): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const fact = await this.facts.findOne({ where: { id: factId, siteId } });
    if (!fact) {
      throw new NotFoundException('Knowledge fact not found');
    }
    await this.facts.remove(fact);

    await this.activities.record({
      action: 'knowledge.fact.delete',
      userId: actor.id,
      organizationId: actor.organizationId,
      siteId,
      entityType: 'knowledge_fact',
      entityId: fact.id,
      meta: { category: fact.category, key: fact.key },
    });
  }
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

function toDto(fact: KnowledgeFact): KnowledgeFactDto {
  return {
    id: fact.id,
    siteId: fact.siteId,
    category: fact.category,
    key: fact.key,
    value: fact.value,
    verificationStatus: fact.verificationStatus,
    source: fact.source,
    notes: fact.notes,
    createdBy: fact.createdBy,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
  };
}
