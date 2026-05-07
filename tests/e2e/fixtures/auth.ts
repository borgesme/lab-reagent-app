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

const API_BASE = 'http://127.0.0.1:3001/api/v1';

type Role = keyof typeof CREDS;

export const ROLES = Object.keys(CREDS) as Role[];
export const stateFor = (role: Role) =>
  path.join(STATE_DIR, `${role}.json`);

// Bypass the UI login form (which races with Next.js dev hydration on first
// compile). Instead: hit /auth/login + /auth/me directly, then write the
// zustand-persist payload into localStorage on a blank web page. Subsequent
// spec tests load this storageState and zustand rehydrates from localStorage,
// so RequireAuth sees a valid session.
export async function ensureStorageState(
  role: Role,
  webBaseUrl: string,
  newPage: () => Promise<Page>,
) {
  const file = stateFor(role);
  if (fs.existsSync(file) && fs.statSync(file).size > 64) return file;

  // 1. login + me via API
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CREDS[role]),
  });
  if (!loginRes.ok) {
    throw new Error(`${role} login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const tokens = (await loginRes.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!meRes.ok) {
    throw new Error(`${role} /auth/me failed: ${meRes.status}`);
  }
  const user = await meRes.json();

  // 2. seed localStorage on a same-origin page so storageState captures it
  const page = await newPage();
  // Hitting /login keeps us on the public route (no RequireAuth redirect)
  // and the page is small, so dev compile is fast.
  await page.goto(`${webBaseUrl}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.evaluate(
    ({ tokens, user }) => {
      localStorage.setItem(
        'auth-store-v1',
        JSON.stringify({ state: { tokens, user }, version: 0 }),
      );
    },
    { tokens, user },
  );
  await page.context().storageState({ path: file });
  await page.close();
  return file;
}

export const test = base.extend<{ role: Role }>({
  role: ['admin', { option: true }],
});
export { expect };
