import { execSync } from 'node:child_process';
import { chromium, type FullConfig } from '@playwright/test';
import { ensureStorageState } from './fixtures/auth';

// Runs once before any test:
// 1. Ensure DB is migrated and seed data (admin/labhead/plain) exists, so
//    storage state fixtures can actually log in.
// 2. Pre-warm storage state for all 3 roles, so test.use({ storageState })
//    in spec files can read the file synchronously at worker init time.
//
// Skipping:
//   E2E_SKIP_SEED=1   -> skip migrate + seed (use when DB is already ready)
//   E2E_SKIP_AUTH=1   -> skip browser login (use to debug a specific spec)
export default async function globalSetup(_config: FullConfig) {
  if (process.env.E2E_SKIP_SEED !== '1') {
    const opts: Parameters<typeof execSync>[1] = { stdio: 'inherit' };
    execSync('pnpm --filter @app/api prisma migrate deploy', opts);
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
