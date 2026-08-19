import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GlobalAiProviderCredential } from '@creative-seo/database';
import { AI_PROVIDER_KINDS, type AiProviderKind } from '@creative-seo/types';
import { Repository } from 'typeorm';
import { EncryptionService } from '../../security/encryption.service';
import { AesEncryptor } from '@creative-seo/ai';

export interface GlobalProviderDto {
  provider: string;
  enabled: boolean;
  configured: boolean;
  credentialSource: 'APPLICATION' | 'ENVIRONMENT' | 'NOT_CONFIGURED';
  defaultModel: string | null;
  connected: boolean;
  lastHealthCheckAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
}

@Injectable()
export class GlobalProvidersService {
  private readonly encryptor: AesEncryptor;

  constructor(
    @InjectRepository(GlobalAiProviderCredential)
    private readonly creds: Repository<GlobalAiProviderCredential>,
    private readonly encryption: EncryptionService,
  ) {
    this.encryptor = AesEncryptor.fromHex(process.env.ENCRYPTION_KEY ?? '');
  }

  async list(): Promise<GlobalProviderDto[]> {
    const rows = await this.creds.find({ order: { provider: 'ASC' } });

    // Check env vars
    const envKeys: Record<string, string | undefined> = {
      OPENAI: process.env.OPENAI_API_KEY,
      ANTHROPIC: process.env.ANTHROPIC_API_KEY,
      PERPLEXITY: process.env.PERPLEXITY_API_KEY,
    };

    return rows.map((row) => {
      const hasEnvKey = !!envKeys[row.provider];
      const hasAppKey =
        row.credentialSource === 'APPLICATION' &&
        row.encryptedApiKey &&
        row.encryptedApiKey !== '';
      const configured = hasAppKey || hasEnvKey;
      const credentialSource: GlobalProviderDto['credentialSource'] = hasAppKey
        ? 'APPLICATION'
        : hasEnvKey
          ? 'ENVIRONMENT'
          : 'NOT_CONFIGURED';

      return {
        provider: row.provider,
        enabled: row.enabled,
        configured,
        credentialSource,
        defaultModel: row.defaultModel,
        connected: row.lastHealthStatus === 'OK',
        lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
        latencyMs: row.latencyMs,
        lastError: row.lastError,
      };
    });
  }

  async update(
    provider: string,
    dto: { apiKey?: string; defaultModel?: string; enabled?: boolean },
  ): Promise<GlobalProviderDto> {
    this.assertValidProvider(provider);
    const row =
      (await this.creds.findOne({ where: { provider } })) ??
      this.creds.create({ provider, encryptedApiKey: '' });

    if (dto.apiKey !== undefined) {
      if (!dto.apiKey || dto.apiKey.trim() === '') {
        throw new BadRequestException('API key cannot be empty');
      }
      row.encryptedApiKey = this.encryptor.encrypt(dto.apiKey);
      row.credentialSource = 'APPLICATION';
    }
    if (dto.defaultModel !== undefined) row.defaultModel = dto.defaultModel || null;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;

    await this.creds.save(row);
    const result = (await this.list()).find((p) => p.provider === provider);
    return result!;
  }

  async disconnect(provider: string): Promise<GlobalProviderDto> {
    this.assertValidProvider(provider);
    const row = await this.creds.findOne({ where: { provider } });
    if (row) {
      row.encryptedApiKey = '';
      row.credentialSource = 'NOT_CONFIGURED';
      row.defaultModel = null;
      row.lastHealthStatus = null;
      row.lastError = null;
      row.latencyMs = null;
      row.lastHealthCheckAt = null;
      await this.creds.save(row);
    }
    const result = (await this.list()).find((p) => p.provider === provider);
    return result!;
  }

  async testConnection(
    provider: string,
    overrideApiKey?: string,
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    this.assertValidProvider(provider);

    // Resolve the key: override -> application -> env
    let apiKey = overrideApiKey;
    if (!apiKey) {
      const row = await this.creds.findOne({ where: { provider } });
      if (row?.credentialSource === 'APPLICATION' && row.encryptedApiKey) {
        try {
          apiKey = this.encryptor.decrypt(row.encryptedApiKey);
        } catch {
          /* key corrupt */
        }
      }
    }
    if (!apiKey) {
      const envKey =
        provider === 'OPENAI'
          ? process.env.OPENAI_API_KEY
          : provider === 'ANTHROPIC'
            ? process.env.ANTHROPIC_API_KEY
            : process.env.PERPLEXITY_API_KEY;
      apiKey = envKey;
    }
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'No API key configured' };
    }

    const start = Date.now();
    try {
      const url =
        provider === 'OPENAI'
          ? 'https://api.openai.com/v1/models'
          : provider === 'ANTHROPIC'
            ? 'https://api.anthropic.com/v1/messages'
            : 'https://api.perplexity.ai/chat/completions';

      const headers: Record<string, string> =
        provider === 'ANTHROPIC'
          ? {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            }
          : { Authorization: `Bearer ${apiKey}` };

      const body =
        provider === 'ANTHROPIC'
          ? JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            })
          : undefined;

      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        await this.recordHealth(
          provider,
          'ERROR',
          latencyMs,
          `HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }

      await this.recordHealth(provider, 'OK', latencyMs, null);
      return { ok: true, latencyMs };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Connection failed';
      await this.recordHealth(provider, 'ERROR', latencyMs, message);
      return { ok: false, latencyMs, error: message };
    }
  }

  private async recordHealth(
    provider: string,
    status: string,
    latencyMs: number,
    error: string | null,
  ) {
    const row = await this.creds.findOne({ where: { provider } });
    if (row) {
      row.lastHealthStatus = status;
      row.lastHealthCheckAt = new Date();
      row.latencyMs = latencyMs;
      row.lastError = error;
      await this.creds.save(row);
    }
  }

  private assertValidProvider(provider: string) {
    if (!(AI_PROVIDER_KINDS as readonly string[]).includes(provider)) {
      throw new BadRequestException(
        `Invalid provider: ${provider}. Must be one of: ${AI_PROVIDER_KINDS.join(', ')}`,
      );
    }
  }
}
