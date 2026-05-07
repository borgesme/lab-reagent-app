import { test, expect } from '@playwright/test';
import { stateFor } from './fixtures/auth';

const SLUGS = [
  ['usage-trend', '领用趋势'],
  ['inventory-turnover', '库存周转'],
  ['purchase-amount', '采购金额'],
  ['controlled-audit', '管控试剂审计'],
] as const;

test.describe('Path 5: SYS_ADMIN visits 4 reports', () => {
  test.use({ storageState: stateFor('admin') });

  for (const [slug, label] of SLUGS) {
    test(`${slug} renders KPI + chart/table`, async ({ page }) => {
      await page.goto(`/reports/${slug}`);
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
      await expect(page.locator('div').filter({ hasText: /—|\d/ }).first())
        .toBeVisible();
      if (slug !== 'controlled-audit') {
        await expect(page.locator('svg').first()).toBeVisible({ timeout: 10_000 });
      } else {
        await expect(page.getByRole('columnheader', { name: /时间/ })).toBeVisible();
      }
    });
  }

  test('export CSV downloads a file', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出 CSV/ }).click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/usage-trend.*\.csv/);
  });
});

test.describe('Path 6: PLAIN_USER scope hides forbidden tabs', () => {
  test.use({ storageState: stateFor('plain') });

  test('only 领用趋势 tab visible', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    await expect(page.getByRole('link', { name: '领用趋势' })).toBeVisible();
    for (const label of ['库存周转', '采购金额', '管控试剂审计']) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0);
    }
  });
});
