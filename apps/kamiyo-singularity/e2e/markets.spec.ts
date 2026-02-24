import { test, expect } from '@playwright/test';

test.describe('Markets Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/markets');
  });

  test('displays page title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /all markets/i })).toBeVisible();
  });

  test('displays category filter buttons', async ({ page }) => {
    // Category filters should be visible - using first() to handle duplicates
    const allBtn = page.getByRole('button', { name: 'All' }).first();
    await expect(allBtn).toBeVisible();
  });

  test('displays sort tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Trending' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ending Soon' })).toBeVisible();
  });

  test('displays market count', async ({ page }) => {
    await expect(page.getByText(/\d+ markets/i)).toBeVisible();
  });

  test('can switch sort mode to new', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: 'New' });
    await newBtn.click();
    await expect(newBtn).toHaveClass(/bg-accent/);
  });

  test('can switch sort mode to ending soon', async ({ page }) => {
    const endingBtn = page.getByRole('button', { name: 'Ending Soon' });
    await endingBtn.click();
    await expect(endingBtn).toHaveClass(/bg-accent/);
  });

  test('can navigate via category query param', async ({ page }) => {
    await page.goto('/markets?category=crypto');
    await expect(page.getByRole('heading', { name: /crypto/i })).toBeVisible();
  });
});

test.describe('Market Detail Page', () => {
  test('displays market not found for invalid id', async ({ page }) => {
    await page.goto('/markets/invalid-market-id');
    await expect(page.getByText(/market not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to markets/i })).toBeVisible();
  });

  test('back to markets link works', async ({ page }) => {
    await page.goto('/markets/invalid-market-id');
    await page.getByRole('link', { name: /back to markets/i }).click();
    await expect(page).toHaveURL('/markets');
  });
});
