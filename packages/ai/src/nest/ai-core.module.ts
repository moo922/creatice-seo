import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiJob, AiPrompt, AiProviderCapability, AiProviderConfig, GlobalAiProviderCredential } from '@creative-seo/database';
import { loadAppEnv } from '@creative-seo/config';
import { globalConfigFromEnv } from '../config';
import { AesEncryptor } from '../encryption';
import { AiProviderRegistry, type RegistryProviderOptions } from '../registry';
import { AiRouter } from '../router';
import { AiJobsService } from './ai-jobs.service';
import { AiService } from './ai.service';
import { PromptRegistryService } from './prompt-registry.service';
import { ProviderCapabilityRegistryService } from '../provider/capabilities';

/**
 * Provider-independent AI infrastructure for both the API and worker apps.
 * Builds the provider registry and router from validated environment, wires job
 * persistence and the prompt registry, and exposes AiService to business code.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiJob, AiPrompt, AiProviderCapability, AiProviderConfig, GlobalAiProviderCredential])],
  providers: [
    {
      provide: AiProviderRegistry,
      useFactory: () => {
        const env = loadAppEnv();
        const providers = globalConfigFromEnv(env);
        const registryOptions: Record<'OPENAI' | 'ANTHROPIC' | 'PERPLEXITY', RegistryProviderOptions> = {
          OPENAI: { ...providers.providers.OPENAI, timeoutMs: providers.timeoutMs, maxRetries: providers.maxRetries, retryBackoffMs: providers.retryBackoffMs },
          ANTHROPIC: { ...providers.providers.ANTHROPIC, timeoutMs: providers.timeoutMs, maxRetries: providers.maxRetries, retryBackoffMs: providers.retryBackoffMs },
          PERPLEXITY: { ...providers.providers.PERPLEXITY, timeoutMs: providers.timeoutMs, maxRetries: providers.maxRetries, retryBackoffMs: providers.retryBackoffMs },
        };
        return AiProviderRegistry.fromOptions(registryOptions);
      },
    },
    {
      provide: AiRouter,
      inject: [AiJobsService],
      useFactory: (jobs: AiJobsService) => new AiRouter(globalConfigFromEnv(loadAppEnv()), jobs),
    },
    {
      provide: AesEncryptor,
      useFactory: () => AesEncryptor.fromHex(loadAppEnv().ENCRYPTION_KEY),
    },
    AiJobsService,
    PromptRegistryService,
    AiService,
    ProviderCapabilityRegistryService,
  ],
  exports: [AiService, AiJobsService, PromptRegistryService, AiRouter, AiProviderRegistry, AesEncryptor, ProviderCapabilityRegistryService],
})
export class AiCoreModule {}

/** Re-exported types so callers import everything from @creative-seo/ai. */
export type { AiGlobalConfig, GlobalProviderConfig } from '../contracts';
