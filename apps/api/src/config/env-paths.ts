import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Resolve .env files for monorepo: root .env first (shared secrets), then apps/api/.env (local overrides).
 * Paths work from both src/ (dev) and dist/ (prod).
 */
export function resolveEnvFilePaths(): string[] {
  const apiRoot = resolve(__dirname, '../..');
  const rootEnv = resolve(apiRoot, '../../.env');
  const localEnv = resolve(apiRoot, '.env');

  const candidates = [rootEnv, localEnv, resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

  return [...new Set(candidates)].filter((p) => existsSync(p));
}
