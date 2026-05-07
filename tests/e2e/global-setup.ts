import { execSync } from 'node:child_process';

// Runs once before any test. Ensures the API DB is migrated and seed data
// (admin / labhead / plain users + sample reagents) is present, so storage
// state fixtures and per-path seed checks have something to work against.
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return;
  const opts: Parameters<typeof execSync>[1] = { stdio: 'inherit' };
  execSync('pnpm --filter @app/api prisma migrate deploy', opts);
  execSync('pnpm --filter @app/api prisma:seed', opts);
}
