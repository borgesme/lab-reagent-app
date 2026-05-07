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

// Path 1 lives at /my/requests (NOT /reagents). The form uses native <select>
// for reagent + stock; submit is a <button>提交</button>. Stock options only
// exist after admin has done a purchase + receipt; if seed has no stocks the
// test self-skips.
test.describe('Path 1: PLAIN_USER apply for reagent', () => {
  test.use({ storageState: stateFor('plain') });

  test('select reagent + stock → submit → row in PENDING', async ({ page }) => {
    await page.goto('/my/requests');
    await expect(page.getByRole('heading', { name: '我的申请' })).toBeVisible();

    const reagentSelect = page.locator('select').nth(0);
    const stockSelect = page.locator('select').nth(1);

    const reagentOptions = await reagentSelect.locator('option').count();
    test.skip(reagentOptions <= 1, 'no reagents seeded');

    // pick first non-controlled reagent (label without 管控)
    const labels = await reagentSelect.locator('option').allTextContents();
    const idx = labels.findIndex((t, i) => i > 0 && !t.includes('管控'));
    test.skip(idx < 1, 'no non-controlled reagent available');
    await reagentSelect.selectOption({ index: idx });

    const stockOptions = await stockSelect.locator('option').count();
    test.skip(stockOptions <= 1, 'reagent has no stock; need admin receipt first');
    await stockSelect.selectOption({ index: 1 });

    await page.getByPlaceholder('数量').fill('1');
    await page.getByPlaceholder(/用途/).fill('e2e test');
    await page.getByRole('button', { name: '提交' }).click();

    await expect(
      page.locator('table tbody tr').filter({ hasText: 'PENDING' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Path 2 lives at /approvals. Buttons read 一审通过 / 一审拒绝 (and 二审 for
// controlled). Approving a row removes it from the PENDING-only list, so we
// assert the count drops rather than searching for "APPROVED" text.
test.describe('Path 2: LAB_HEAD approve', () => {
  test.use({ storageState: stateFor('labhead') });

  test('approve newest pending', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page.getByRole('heading', { name: '待我审批' })).toBeVisible();

    const items = page.locator('main ul > li');
    const before = await items.count();
    test.skip(before === 0, 'no pending requests');

    await page.getByRole('button', { name: '一审通过' }).first().click();
    await expect(items).toHaveCount(before - 1, { timeout: 10_000 });
  });
});

// Path 3 lives at /admin/issues. The waiting list uses <li> rows; each has an
// 实际量 input (placeholder includes the unit) + a 发放 button.
test.describe('Path 3: REAGENT_ADMIN issue → ledger updates', () => {
  test.use({ storageState: stateFor('admin') });

  test('issue → row moves to ledger', async ({ page }) => {
    await page.goto('/admin/issues');
    await expect(page.getByRole('heading', { name: '发放管理' })).toBeVisible();

    const pendingRows = page.locator('h3:has-text("待发放") + ul > li');
    const ledgerRows = page.locator('table tbody tr');
    const pendingBefore = await pendingRows.count();
    test.skip(pendingBefore === 0, 'no APPROVED requests to issue');

    const ledgerBefore = await ledgerRows.count();
    const firstRow = pendingRows.first();
    await firstRow.locator('input[placeholder*="实际量"]').fill('1');
    await firstRow.getByRole('button', { name: '发放' }).click();

    await expect(ledgerRows).toHaveCount(ledgerBefore + 1, { timeout: 10_000 });
  });
});

// Path 4: admin purchase loop is split across /my/purchases (apply),
// /admin/purchases (merge → receipt), /approvals/purchases (approve batch).
// The full chain needs ≥1 PENDING purchase + LAB_HEAD approval; we only smoke
// the admin pages here so the test is independent of seed state.
test.describe('Path 4: REAGENT_ADMIN purchase admin pages render', () => {
  test.use({ storageState: stateFor('admin') });

  test('/admin/purchases shows pending + batches sections', async ({ page }) => {
    await page.goto('/admin/purchases');
    await expect(
      page.getByRole('heading', { name: '待合并采购申请' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '批次' })).toBeVisible();
  });
});
