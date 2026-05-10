import { test, expect } from '@playwright/test';
import { stateFor } from './fixtures/auth';

// Storage state is pre-warmed by tests/e2e/global-setup.ts so all spec files
// can read .auth/<role>.json synchronously at worker init.

// Path 1 lives at /my/requests. Form is FormDialog with testid 'my-requests-form'.
// Stock options only exist after admin has done a purchase + receipt; if seed
// has no stocks the test self-skips.
test.describe('Path 1: PLAIN_USER apply for reagent', () => {
  test.use({ storageState: stateFor('plain') });

  test('select reagent + stock → submit → row in PENDING', async ({ page }) => {
    await page.goto('/my/requests');
    await expect(page.getByTestId('my-requests-page')).toBeVisible();

    await page.getByTestId('my-requests-add').click();
    const dialog = page.getByTestId('my-requests-form');
    await expect(dialog).toBeVisible();

    // 打开 reagent select
    await dialog.getByTestId('my-requests-form-reagent').click();
    const nonControlled = page.locator('[role="option"][data-controlled="false"]');
    const ncCount = await nonControlled.count();
    test.skip(ncCount === 0, 'no non-controlled reagent seeded');
    await nonControlled.first().click();

    // 打开 stock select
    await dialog.getByTestId('my-requests-form-stock').click();
    const stockOptions = page.locator('[role="option"]');
    const stockCount = await stockOptions.count();
    test.skip(stockCount === 0, 'reagent has no stock; need admin receipt first');
    await stockOptions.first().click();

    await dialog.getByTestId('my-requests-form-qty').fill('1');
    await dialog.getByTestId('my-requests-form-purpose').fill('e2e test purpose');
    await dialog.getByTestId('my-requests-form-submit').click();

    // FormDialog onSubmit 成功后 caller 调 setFormOpen(false)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // 表里出现 PENDING 行
    await expect(
      page
        .getByTestId('my-requests-table')
        .locator('tbody tr')
        .filter({ hasText: 'PENDING' })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Path 2 lives at /approvals. Buttons read 一审通过/一审拒绝 (and 二审 for
// controlled). Approving a row removes it from the PENDING-only list, so we
// assert the count drops rather than searching for "APPROVED" text.
test.describe('Path 2: LAB_HEAD approve', () => {
  test.use({ storageState: stateFor('labhead') });

  test('approve newest pending', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page.getByTestId('approvals-page')).toBeVisible();

    const items = page.locator('[data-testid^="approvals-item-"]');
    const before = await items.count();
    test.skip(before === 0, 'no pending requests');

    await page.locator('[data-testid^="approvals-tier1-approve-"]').first().click();
    await expect(items).toHaveCount(before - 1, { timeout: 10_000 });
  });
});

// Path 3 lives at /admin/issues. Pending list uses <li data-testid='admin-issues-row-{id}'>;
// 实际量 input + 发放 button per row.
test.describe('Path 3: REAGENT_ADMIN issue → ledger updates', () => {
  test.use({ storageState: stateFor('admin') });

  test('issue → row moves to ledger', async ({ page }) => {
    await page.goto('/admin/issues');
    await expect(page.getByTestId('admin-issues-page')).toBeVisible();

    const pendingRows = page.locator('[data-testid^="admin-issues-row-"]');
    const ledger = page.getByTestId('admin-issues-history-table').locator('tbody tr');
    const pendingBefore = await pendingRows.count();
    test.skip(pendingBefore === 0, 'no APPROVED requests to issue');

    const ledgerBefore = await ledger.count();
    const firstRow = pendingRows.first();
    // 取该行的 id（从 testid 解析）
    const testid = await firstRow.getAttribute('data-testid');
    const id = testid!.replace('admin-issues-row-', '');

    await firstRow.locator(`[data-testid="admin-issues-row-${id}-qty"]`).fill('1');
    await firstRow.locator(`[data-testid="admin-issues-row-${id}-issue"]`).click();

    await expect(ledger).toHaveCount(ledgerBefore + 1, { timeout: 10_000 });
  });
});

// Path 4: admin purchase loop is split across /my/purchases (apply),
// /admin/purchases (merge → receipt), /approvals/purchases (approve batch).
// Smoke admin pages render only.
test.describe('Path 4: REAGENT_ADMIN purchase admin pages render', () => {
  test.use({ storageState: stateFor('admin') });

  test('/admin/purchases shows merge button + page wrapper', async ({ page }) => {
    await page.goto('/admin/purchases');
    await expect(page.getByTestId('admin-purchases-page')).toBeVisible();
    // merge button exists (disabled if nothing picked)
    await expect(page.getByTestId('admin-purchases-merge')).toBeVisible();
  });
});
