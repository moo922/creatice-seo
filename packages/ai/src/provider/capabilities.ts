import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderCapability } from '@creative-seo/database';
import type { AiProviderKind } from '@creative-seo/types';
import type { ProviderCapabilities } from '../contracts';

/**
 * Provider capability registry (GC06 Section 4). Each provider adapter declares
 * its actual capabilities — providers without CITATIONS return NOT_APPLICABLE
 * not 0% citation rate.
 */
@Injectable()
export class ProviderCapabilityRegistryService {
  constructor(
    @InjectRepository(AiProviderCapability)
    private readonly caps: Repository<AiProviderCapability>,
  ) {}

  async getCapabilities(provider: AiProviderKind): Promise<ProviderCapabilities | null> {
    const row = await this.caps.findOne({ where: { provider } });
    if (!row) return null;
    return this.toDto(row);
  }

  async getAllCapabilities(): Promise<ProviderCapabilities[]> {
    const rows = await this.caps.find({ order: { provider: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async supportsCitations(provider: AiProviderKind): Promise<boolean> {
    const caps = await this.getCapabilities(provider);
    return caps?.supportsCitations ?? false;
  }

  async supportsSourceProvenance(provider: AiProviderKind): Promise<boolean> {
    const caps = await this.getCapabilities(provider);
    return caps?.supportsSourceProvenance ?? false;
  }

  async supportsSearch(provider: AiProviderKind): Promise<boolean> {
    const caps = await this.getCapabilities(provider);
    return caps?.supportsSearch ?? false;
  }

  async upsertCapabilities(provider: AiProviderKind, caps: Partial<ProviderCapabilities>): Promise<ProviderCapabilities> {
    let row = await this.caps.findOne({ where: { provider } });
    if (!row) {
      row = this.caps.create({ provider });
    }
    if (caps.capabilities) row.capabilities = caps.capabilities;
    if (caps.defaultModel) row.defaultModel = caps.defaultModel;
    if (caps.maxOutputTokens !== undefined) row.maxOutputTokens = caps.maxOutputTokens;
    if (caps.supportsTemperature !== undefined) row.supportsTemperature = caps.supportsTemperature;
    if (caps.supportsSeed !== undefined) row.supportsSeed = caps.supportsSeed;
    if (caps.supportsLocationContext !== undefined) row.supportsLocationContext = caps.supportsLocationContext;
    if (caps.supportsSearch !== undefined) row.supportsSearch = caps.supportsSearch;
    if (caps.supportsCitations !== undefined) row.supportsCitations = caps.supportsCitations;
    if (caps.supportsSourceProvenance !== undefined) row.supportsSourceProvenance = caps.supportsSourceProvenance;
    if (caps.rateLimitRpm !== undefined) row.rateLimitRpm = caps.rateLimitRpm;
    const saved = await this.caps.save(row);
    return this.toDto(saved);
  }

  private toDto(row: AiProviderCapability): ProviderCapabilities {
    return {
      provider: row.provider as AiProviderKind,
      capabilities: row.capabilities as ProviderCapabilities['capabilities'],
      defaultModel: row.defaultModel,
      maxOutputTokens: row.maxOutputTokens,
      supportsTemperature: row.supportsTemperature,
      supportsSeed: row.supportsSeed,
      supportsLocationContext: row.supportsLocationContext,
      supportsSearch: row.supportsSearch,
      supportsCitations: row.supportsCitations,
      supportsSourceProvenance: row.supportsSourceProvenance,
      rateLimitRpm: row.rateLimitRpm,
    };
  }
}
