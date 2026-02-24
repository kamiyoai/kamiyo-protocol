import { test, expect } from '@playwright/test';

test.describe('Leaderboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leaderboard');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveURL('/leaderboard');
  });

  test('has correct page title in metadata', async ({ page }) => {
    await expect(page).toHaveTitle(/leaderboard.*neuralminds/i);
  });

  test('displays container with proper layout', async ({ page }) => {
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });
});
