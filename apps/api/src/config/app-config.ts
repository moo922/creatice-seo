import { Injectable } from '@nestjs/common';
import { loadAppEnv, type AppEnv } from '@creative-seo/config';

/**
 * Typed application configuration, validated once at startup by zod
 * (@creative-seo/config). Fail-fast: invalid environment aborts bootstrap.
 */
@Injectable()
export class AppConfig {
  readonly env: AppEnv;

  constructor() {
    this.env = loadAppEnv();
  }
}
