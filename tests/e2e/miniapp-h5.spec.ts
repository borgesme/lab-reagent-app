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
    // Taro <Button>登录</Button> renders as <taro-button-core>; plain
    // getByText is ambiguous because the nav bar title is also "登录".
    await page.locator('taro-button-core').filter({ hasText: '登录' }).click();
    await page.waitForURL(/home/, { timeout: 30_000 });
  });

  test('three KPI cards render values', async ({ page }) => {
    await page.getByText('报表概览').click();
    await page.waitForURL(/report-summary/);

    for (const label of ['近 30 天领用量', '低库存数量', '本月采购金额']) {
      await expect(page.getByText(label).first()).toBeVisible({
        timeout: 10_000,
      });
    }

    // KPI value lives in a <Text> beneath the label, rendered as
    // <taro-text-core>. Wait until at least one shows numeric content (not
    // '—' loading/missing-scope placeholder).
    await expect
      .poll(
        async () => {
          const texts = await page.locator('taro-text-core').allTextContents();
          return texts.some((t) => /^[0-9.]+$/.test(t.trim()));
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });
});
