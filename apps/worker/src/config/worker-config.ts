import { Injectable } from '@nestjs/common';
import { loadAppEnv, type AppEnv } from '@creative-seo/config';

@Injectable()
export class WorkerConfig {
  readonly env: AppEnv;

  constructor() {
    this.env = loadAppEnv();
  }
}
