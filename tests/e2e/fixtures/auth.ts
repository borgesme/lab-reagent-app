import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = path.resolve(__dirname, '..', '.auth');
fs.mkdirSync(STATE_DIR, { recursive: true });

const CREDS = {
  admin: { email: 'admin@lab.local', password: 'admin123' },
  labhead: { email: 'labhead@lab.local', password: 'lab12345' },
  plain: { email: 'plain@lab.local', password: 'plain123' },
} as const;

type Role = keyof typeof CREDS;

export const ROLES = Object.keys(CREDS) as Role[];
export const stateFor = (role: Role) =>
  path.join(STATE_DIR, `${role}.json`);

export async function ensureStorageState(
  role: Role,
  webBaseUrl: string,
  newPage: () => Promise<Page>,
) {
  const file = stateFor(role);
  if (fs.existsSync(file) && fs.statSync(file).size > 64) return file;

  const page = await newPage();
  await page.goto(`${webBaseUrl}/login`);
  await page.getByPlaceholder('邮箱').fill(CREDS[role].email);
  await page.getByPlaceholder('密码').fill(CREDS[role].password);
  await page.getByRole('button', { name: /登录/ }).click();
  // login redirects to /admin/users; just wait until URL is no longer /login
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 10_000,
  });
  await page.context().storageState({ path: file });
  await page.close();
  return file;
}

export const test = base.extend<{ role: Role }>({
  role: ['admin', { option: true }],
});
export { expect };
