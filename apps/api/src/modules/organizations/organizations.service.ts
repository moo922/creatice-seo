import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Organization } from '@creative-seo/database';
import type { OrganizationDto } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    private readonly activities: ActivityLogService,
  ) {}

  async list(principal: AuthPrincipal): Promise<OrganizationDto[]> {
    const rows = await this.organizations.find({
      where: this.isGlobal(principal) ? undefined : { id: principal.organizationId ?? '' },
      order: { name: 'ASC' },
    });
    return rows.map(toDto);
  }

  async create(dto: CreateOrganizationDto, actor: AuthPrincipal): Promise<OrganizationDto> {
    const slug = dto.slug ?? slugify(dto.name);
    const uniqueSlug = await this.ensureUniqueSlug(slug);

    const organization = this.organizations.create({
      name: dto.name,
      slug: uniqueSlug,
      status: 'ACTIVE',
      createdBy: actor.id,
      meta: {},
    });
    const saved = await this.organizations.save(organization);

    await this.activities.record({
      action: 'organization.create',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'organization',
      entityId: saved.id,
      meta: { name: saved.name, slug: saved.slug },
    });

    return toDto(saved);
  }

  async findByIdOrThrow(id: string, principal: AuthPrincipal): Promise<OrganizationDto> {
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!this.isGlobal(principal) && organization.id !== principal.organizationId) {
      throw new NotFoundException('Organization not found');
    }
    return toDto(organization);
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    actor: AuthPrincipal,
  ): Promise<OrganizationDto> {
    const organization = await this.organizations.findOne({ where: { id } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    if (!this.isGlobal(actor)) {
      throw new NotFoundException('Organization not found');
    }
    if (dto.name !== undefined) {
      organization.name = dto.name;
    }
    if (dto.status !== undefined) {
      organization.status = dto.status;
    }
    await this.organizations.save(organization);

    await this.activities.record({
      action: 'organization.update',
      userId: actor.id,
      organizationId: actor.organizationId,
      entityType: 'organization',
      entityId: id,
      meta: { changed: dto },
    });

    return toDto(organization);
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    if (!(await this.organizations.exists({ where: { slug: base } }))) {
      return base;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString('hex')}`;
      if (!(await this.organizations.exists({ where: { slug: candidate } }))) {
        return candidate;
      }
    }
    throw new ConflictException('Could not allocate a unique organization slug');
  }

  private isGlobal(principal: AuthPrincipal): boolean {
    return principal.roles.includes('SUPER_ADMIN') || principal.roles.includes('ADMIN');
  }
}

function toDto(organization: Organization): OrganizationDto {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt.toISOString(),
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `org-${randomBytes(3).toString('hex')}`;
}
