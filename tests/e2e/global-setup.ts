import { execSync } from 'node:child_process';
import { chromium, type FullConfig } from '@playwright/test';
import { ensureStorageState } from './fixtures/auth';

// Runs once before any test:
// 1. migrate + seed the API DB so admin/labhead/plain users exist
// 2. pre-warm storage state for those 3 roles, so per-spec
//    test.use({ storageState }) can read .auth/<role>.json synchronously
//
// Skipping:
//   E2E_SKIP_SEED=1   skip migrate + seed (DB is already prepared)
//   E2E_SKIP_AUTH=1   skip browser login (debugging a single spec)
export default async function globalSetup(_config: FullConfig) {
  if (process.env.E2E_SKIP_SEED !== '1') {
    const opts: Parameters<typeof execSync>[1] = { stdio: 'inherit' };
    // pnpm --filter <pkg> exec runs the binary; pnpm --filter <pkg> <name>
    // would look for an npm script named "prisma" which doesn't exist.
    execSync('pnpm --filter @app/api exec prisma migrate deploy', opts);
    execSync('pnpm --filter @app/api prisma:seed', opts);
  }

  if (process.env.E2E_SKIP_AUTH === '1') return;

  const browser = await chromium.launch();
  try {
    for (const role of ['admin', 'labhead', 'plain'] as const) {
      await ensureStorageState(role, 'http://localhost:3000', async () => {
        const ctx = await browser.newContext();
        return ctx.newPage();
      });
    }
  } finally {
    await browser.close();
  }
}
