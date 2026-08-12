import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { loadAppEnv, type AppEnv } from '@creative-seo/config';

/**
 * Loads environment for database CLI scripts. Tries a local .env then the
 * repository root .env, then falls back to process env / defaults.
 */
export function loadDbEnv(): AppEnv {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
    }
  }
  return loadAppEnv();
}
