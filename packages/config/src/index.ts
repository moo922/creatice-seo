import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .or(z.boolean());

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).default(3000),
  /** Dedicated health-server port for the worker (must not collide with PORT). */
  WORKER_PORT: z.coerce.number().int().min(0).default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://creative_seo:creative_seo_dev@127.0.0.1:5432/creative_seo'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  COOKIE_SECURE: boolFromString.default(false),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  AUTH_THROTTLE_TTL: z.coerce.number().int().positive().default(60_000),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
  WP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  WP_ALLOW_PRIVATE_ADDRESSES: boolFromString.default(false),
  GSC_CLIENT_ID: z.string().default(''),
  GSC_CLIENT_SECRET: z.string().default(''),
  GSC_REDIRECT_URI: z.string().default('http://localhost:3000/api/sites/:siteId/gsc/callback'),
  GSC_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(3_600),
  GSC_SYNC_DIMENSIONS: z.string().default('date,query,page'),
  GSC_SYNC_LOOKBACK_DAYS: z.coerce.number().int().positive().default(28),
  /**
   * Search Console API base. Overridable in dev/test to point at a mock or a
   * future on-prem connector. Never set this in production.
   */
  GSC_API_BASE: z
    .string()
    .url()
    .default('https://www.googleapis.com/webmasters/v3'),
  /** Google Ads API base (REST). Empty disables Google Ads integration. */
  GOOGLE_ADS_API_BASE: z.string().url().default('https://googleads.googleapis.com'),
  /** Google Ads API version, e.g. v18. Used to build REST paths. */
  GOOGLE_ADS_API_VERSION: z.string().default('v18'),
  /** Developer token for the Google Ads API (server-side only; never exposed). */
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().default(''),
  /** OAuth2 token endpoint for Google Ads (service accounts use JWT). */
  GOOGLE_ADS_TOKEN_BASE: z.string().url().default('https://oauth2.googleapis.com'),
  /** OAuth2 client credentials for Google Ads (installed app / service account). */
  GOOGLE_ADS_CLIENT_ID: z.string().default(''),
  GOOGLE_ADS_CLIENT_SECRET: z.string().default(''),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().default(''),
  /** Timeout for Google Ads API requests. */
  GOOGLE_ADS_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AI_DEFAULT_PROVIDER: z.enum(['OPENAI', 'ANTHROPIC', 'PERPLEXITY']).default('OPENAI'),
  AI_DEFAULT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  /**
   * Ordered fallback chain used when the resolved provider fails after retries,
   * e.g. "ANTHROPIC,PERPLEXITY". Overridable per site and per call.
   */
  AI_FALLBACK_PROVIDERS: z.string().default('ANTHROPIC,PERPLEXITY'),
  /**
   * Global workflow -> provider routing. Includes the content intelligence
   * pipeline stage workflows (content-*). Per-site overrides
   * (ai_provider_configs) and per-call overrides win.
   */
  AI_WORKFLOW_PROVIDERS: z
    .string()
    .default(
      'research=PERPLEXITY,clustering=OPENAI,brief=ANTHROPIC,writer=ANTHROPIC,arabic-qa=OPENAI,' +
        'content-evidence=ANTHROPIC,content-intent=OPENAI,content-aeo=OPENAI,content-geo=OPENAI,' +
        'content-gap=OPENAI,content-brief=ANTHROPIC,content-brief-gate=ANTHROPIC,content-outline=ANTHROPIC,' +
        'content-draft=ANTHROPIC,content-language=ANTHROPIC,content-seo-validator=OPENAI,' +
        'content-aeo-validator=OPENAI,content-geo-validator=OPENAI,content-rankmath-validator=OPENAI,' +
        'content-factual=ANTHROPIC,content-links=OPENAI,content-qa=OPENAI,operations-recommendation=OPENAI,' +
        'visibility-observation=OPENAI',
    ),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  AI_RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(1_000),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_DEFAULT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  ANTHROPIC_DEFAULT_MODEL: z.string().min(1).default('claude-sonnet-4-5'),
  PERPLEXITY_API_KEY: z.string().default(''),
  PERPLEXITY_BASE_URL: z.string().url().default('https://api.perplexity.ai'),
  PERPLEXITY_DEFAULT_MODEL: z.string().min(1).default('sonar-pro'),
  /**
   * OAuth token exchange/refresh endpoint. Overridable in dev/test for mocks.
   * Never set this in production.
   */
  GSC_TOKEN_BASE: z.string().url().default('https://oauth2.googleapis.com'),
  // ---- White-label reporting ----
  AGENCY_NAME: z.string().default('Creative SEO'),
  AGENCY_LOGO_URL: z.string().default(''),
  AGENCY_EMAIL: z.string().default(''),
  AGENCY_PHONE: z.string().default(''),
  AGENCY_FOOTER: z.string().default(''),
  /** Directory where generated PDF report files are stored (self-hosted). */
  REPORTS_DIR: z.string().default('./data/reports'),
  // ---- n8n orchestration ----
  /** Public base URL of the API (used to build the n8n callback webhook URL). */
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /** n8n instance base URL. Empty disables dispatch (jobs fail with a clear error). */
  N8N_BASE_URL: z.string().default(''),
  /** Base path for n8n webhooks (defaults to {N8N_BASE_URL}/webhook). */
  N8N_WEBHOOK_BASE: z.string().default(''),
  /** Shared secret required on the n8n callback webhook (empty = disabled check). */
  N8N_CALLBACK_SECRET: z.string().default(''),
  /** Per-dispatch HTTP timeout when calling the n8n webhook. */
  N8N_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export interface LoadEnvOptions {
  source?: NodeJS.ProcessEnv;
  override?: Partial<Record<keyof AppEnv, string>>;
}

export class ConfigValidationError extends Error {
  constructor(
    public readonly issues: z.ZodIssue[],
  ) {
    super(`Invalid environment configuration: ${issues.length} problem(s)`);
    this.name = 'ConfigValidationError';
  }
}

export function loadAppEnv(options: LoadEnvOptions = {}): AppEnv {
  const merged = { ...process.env, ...options.source, ...(options.override ?? {}) };
  const parsed = appEnvSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigValidationError(parsed.error.issues);
  }
  return parsed.data;
}

export function corsOrigins(env: AppEnv): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export * from './safe-url';
