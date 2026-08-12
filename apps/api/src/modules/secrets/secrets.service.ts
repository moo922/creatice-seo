import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site, SiteSecret } from '@creative-seo/database';
import type { SiteSecretDto } from '@creative-seo/types';
import type { AuthPrincipal } from '../../common/auth.types';
import { SiteAccessService } from '../../common/guards/site-access.service';
import { EncryptionService } from '../../security/encryption.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CreateSecretDto } from './secrets.dto';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SecretsService {
  constructor(
    @InjectRepository(SiteSecret) private readonly secrets: Repository<SiteSecret>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    private readonly encryption: EncryptionService,
    private readonly siteAccess: SiteAccessService,
    private readonly activities: ActivityLogService,
  ) {}

  async create(
    siteId: string,
    dto: CreateSecretDto,
    actor: AuthPrincipal,
    meta: RequestMeta,
  ): Promise<SiteSecretDto> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    assertStringValues(dto.payload);

    const encrypted = this.encryption.encrypt(JSON.stringify(dto.payload));
    const secret = this.secrets.create({
      siteId,
      kind: dto.kind,
      label: dto.label ?? null,
      encryptedPayload: encrypted,
      meta: {},
      createdBy: actor.id,
    });
    const saved = await this.secrets.save(secret);

    await this.activities.record({
      action: 'site.secret.create',
      userId: actor.id,
      organizationId: site.organizationId,
      siteId,
      entityType: 'site_secret',
      entityId: saved.id,
      meta: { kind: dto.kind, label: dto.label ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.toDto(saved);
  }

  async list(siteId: string, principal: AuthPrincipal): Promise<SiteSecretDto[]> {
    await this.siteAccess.assertSiteAccess(principal, siteId);
    const rows = await this.secrets.find({
      where: { siteId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async remove(siteId: string, secretId: string, actor: AuthPrincipal, meta: RequestMeta): Promise<void> {
    await this.siteAccess.assertSiteAccess(actor, siteId);
    const secret = await this.secrets.findOne({ where: { id: secretId, siteId } });
    if (!secret) {
      throw new NotFoundException('Secret not found');
    }
    await this.secrets.remove(secret);

    await this.activities.record({
      action: 'site.secret.delete',
      userId: actor.id,
      siteId,
      entityType: 'site_secret',
      entityId: secret.id,
      meta: { kind: secret.kind },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Returns only masked metadata. Decrypted material never leaves the backend.
   */
  private toDto(secret: SiteSecret): SiteSecretDto {
    let masked: Record<string, string> = { value: '••••••••' };
    try {
      const parsed = JSON.parse(this.encryption.decrypt(secret.encryptedPayload)) as Record<
        string,
        unknown
      >;
      masked = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, maskValue(value)]));
    } catch {
      masked = { value: '••••••••' };
    }
    return {
      id: secret.id,
      siteId: secret.siteId,
      kind: secret.kind,
      label: secret.label ?? '',
      masked,
      lastValidatedAt: secret.lastValidatedAt ? secret.lastValidatedAt.toISOString() : null,
      expiresAt: secret.expiresAt ? secret.expiresAt.toISOString() : null,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
    };
  }
}

function assertStringValues(payload: Record<string, string>): void {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(`Secret field '${key}' must be a non-empty string`);
    }
  }
}

function maskValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '••••••••';
  }
  if (value.length <= 6) {
    return '••••••';
  }
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}
