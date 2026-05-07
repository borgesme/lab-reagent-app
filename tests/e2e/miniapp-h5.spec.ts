import { test, expect } from '@playwright/test';

test.describe('miniapp report-summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[placeholder="邮箱"]', 'labhead@lab.local');
    await page.fill('input[placeholder="密码"]', 'lab12345');
    await page.getByText(/登录/).click();
    await page.waitForURL(/home/);
  });

  test('3 KPI cards render numeric value', async ({ page }) => {
    await page.getByText('报表概览').click();
    await page.waitForURL(/report-summary/);
    await expect(page.getByText('近 30 天领用量')).toBeVisible();
    await expect(page.getByText('低库存数量')).toBeVisible();
    await expect(page.getByText('本月采购金额(元)')).toBeVisible();

    for (const label of ['近 30 天领用量', '低库存数量', '本月采购金额(元)']) {
      const card = page.locator(`text=${label}`).locator('..');
      await expect(card.locator('text=/[\d—]+/').first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
