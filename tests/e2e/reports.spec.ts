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
    test(`${slug} renders page + KPI`, async ({ page }) => {
      await page.goto(`/reports/${slug}`);
      // page wrapper testid 表示路由+权限通过
      await expect(page.getByTestId(`reports-${slug}-page`)).toBeVisible();
      // PageHeader 渲染的标题文字（用户可见）
      await expect(
        page.getByRole('heading', { name: label }),
      ).toBeVisible();

      // 第一个 KPI value：等 loading 完成（Skeleton 撤掉后 value span 才出现）
      const firstKpi = page
        .locator(`[data-testid^="reports-${slug}-kpi-"][data-testid$="-value"]`)
        .first();
      await expect(firstKpi).toBeVisible({ timeout: 10_000 });
      await expect(firstKpi).toHaveText(/[0-9—.\-]+/);

      if (slug === 'controlled-audit' || slug === 'inventory-turnover') {
        await expect(
          page.getByTestId(`reports-${slug}-detail-table`),
        ).toBeVisible();
      }
    });
  }

  test('export CSV triggers a .csv download', async ({ page }) => {
    await page.goto('/reports/usage-trend');
    // 等 KPI 出来确保数据已加载
    await expect(
      page
        .locator('[data-testid^="reports-usage-trend-kpi-"][data-testid$="-value"]')
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('reports-usage-trend-export').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('reports-usage-trend-export-csv').click(),
    ]);
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
