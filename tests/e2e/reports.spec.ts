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
    test(`${slug} renders heading + KPI`, async ({ page }) => {
      await page.goto(`/reports/${slug}`);
      // exact match: 采购金额 page also has h3 "采购金额(按月)"
      await expect(
        page.getByRole('heading', { name: label, exact: true }),
      ).toBeVisible();

      // KpiCard renders value as div.text-3xl. Empty data shows '—'.
      const firstKpi = page.locator('div.text-3xl').first();
      await expect(firstKpi).toBeVisible({ timeout: 10_000 });
      await expect(firstKpi).toHaveText(/[0-9—.\-]+/);

      if (slug === 'controlled-audit') {
        await expect(
          page.getByRole('columnheader', { name: '时间' }),
        ).toBeVisible();
      }
      // svg chart is best-effort: recharts skips render on empty series, and
      // dev-mode dynamic import + no seed data leaves the chart slot empty.
      // KPI presence is the real signal that data fetch + scope gate worked.
    });
  }

  test('export CSV triggers a .csv download', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 CSV' }).click(),
    ]);
    // Backend sets Content-Disposition with the slug name, but CORS doesn't
    // expose that header to fetch() in dev (Access-Control-Expose-Headers),
    // so ExportButton falls back to "report.csv". Just assert .csv suffix.
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe('Path 6: PLAIN_USER scope hides forbidden tabs', () => {
  test.use({ storageState: stateFor('plain') });

  test('only 领用趋势 link visible in sidebar', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('link', { name: '领用趋势' })).toBeVisible();
    for (const label of ['库存周转', '采购金额', '管控审计']) {
      await expect(sidebar.getByRole('link', { name: label })).toHaveCount(0);
    }
  });
});
