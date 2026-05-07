import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const MP = 'http://localhost:10086';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm dev:api',
      url: `${API}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev:web',
      url: WEB,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev:mp',
      url: MP,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
  projects: [
    {
      name: 'web',
      testMatch: /(workflows|reports)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB },
    },
    {
      name: 'miniapp-h5',
      testMatch: /miniapp-h5\.spec\.ts/,
      use: { ...devices['Pixel 5'], baseURL: MP },
    },
  ],
});
