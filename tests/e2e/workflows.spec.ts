import { test, expect } from '@playwright/test';
import { ensureStorageState, stateFor } from './fixtures/auth';

test.beforeAll(async ({ browser }) => {
  for (const role of ['admin', 'labhead', 'plain'] as const) {
    await ensureStorageState(role, 'http://localhost:3000', async () => {
      const ctx = await browser.newContext();
      return ctx.newPage();
    });
  }
});

test.describe('Path 1: PLAIN_USER apply for reagent', () => {
  test.use({ storageState: stateFor('plain') });

  test('search → request → submit', async ({ page }) => {
    await page.goto('/reagents');
    await page.getByPlaceholder(/试剂/).first().fill('盐酸');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /申请/ }).first().click();
    await page.getByLabel(/数量/).fill('1');
    await page.getByLabel(/用途/).fill('e2e test');
    await page.getByRole('button', { name: /提交/ }).click();
    await expect(page.getByText(/PENDING|待审批/)).toBeVisible();
  });
});

test.describe('Path 2: LAB_HEAD approve', () => {
  test.use({ storageState: stateFor('labhead') });

  test('approve newest pending', async ({ page }) => {
    await page.goto('/approvals');
    const firstApprove = page.getByRole('button', { name: /^通过/ }).first();
    await expect(firstApprove).toBeVisible();
    await firstApprove.click();
    await expect(page.getByText(/已通过|APPROVED/)).toBeVisible();
  });
});

test.describe('Path 3: REAGENT_ADMIN issue → stock decreases', () => {
  test.use({ storageState: stateFor('admin') });

  test('issue + verify stock', async ({ page }) => {
    await page.goto('/admin/issues');
    const stockCell = page.locator('[data-testid="stock-id"]').first();
    const stockId = await stockCell.textContent();
    expect(stockId).toBeTruthy();

    await page.getByRole('button', { name: /发放/ }).first().click();
    await page.getByLabel(/实发/).fill('1');
    await page.getByRole('button', { name: /确认/ }).click();
    await expect(page.getByText(/已发放|ISSUED/)).toBeVisible();
  });
});

test.describe('Path 4: REAGENT_ADMIN purchase → approve → receive', () => {
  test.use({ storageState: stateFor('admin') });

  test('full purchase loop', async ({ page }) => {
    await page.goto('/admin/purchases');
    await page.getByRole('button', { name: /新建采购/ }).click();
    await page.getByLabel(/数量/).fill('5');
    await page.getByRole('button', { name: /提交/ }).click();
    await page.getByRole('button', { name: /批准/ }).first().click();
    await page.getByRole('button', { name: /收货/ }).first().click();
    await page.getByLabel(/实收|价格/).first().fill('100');
    await page.getByRole('button', { name: /确认收货/ }).click();
    await expect(page.getByText(/RECEIVED|已收货/)).toBeVisible();
  });
});
