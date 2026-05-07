import { test, expect } from '@playwright/test';

// Taro h5 boots at the first page in app.config.ts (pages/login/index). The
// dev server resolves '/' → that page. After login, switchTab navigates to
// pages/home/index. The 报表概览 button on home calls Taro.navigateTo to
// pages/report-summary/index, which loads three KPI cards via summary=1.
test.describe('miniapp h5: report-summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/login/);
    await page.locator('input').nth(0).fill('labhead@lab.local');
    await page.locator('input').nth(1).fill('lab12345');
    await page.getByText('登录').click();
    await page.waitForURL(/home/, { timeout: 15_000 });
  });

  test('three KPI cards render values', async ({ page }) => {
    await page.getByText('报表概览').click();
    await page.waitForURL(/report-summary/);

    // labels (note: 本月采购金额 — no '(元)' suffix in actual UI)
    for (const label of ['近 30 天领用量', '低库存数量', '本月采购金额']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }

    // values render as a numeric string or em-dash placeholder; LAB_HEAD has
    // scope to all three so we expect at least one numeric value to appear
    const valueRegex = /^[0-9—.\-]+$/;
    await expect
      .poll(async () => {
        const texts = await page.locator('text-core, span, view').allTextContents();
        return texts.some((t) => valueRegex.test(t.trim()) && t.trim() !== '—');
      }, { timeout: 10_000 })
      .toBe(true);
  });
});
