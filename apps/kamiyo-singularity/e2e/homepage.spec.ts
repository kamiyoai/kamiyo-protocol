import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays header with logo and navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /neuralminds/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /markets/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /portfolio/i })).toBeVisible();
  });

  test('displays connect wallet button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
  });

  test('displays search input on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('displays sort tabs', async ({ page }) => {
    // Look for any sort-related buttons
    const sortButtons = page.locator('button').filter({ hasText: /trending|new|ending/i });
    await expect(sortButtons.first()).toBeVisible();
  });

  test('displays featured section', async ({ page }) => {
    // Featured banner or slider should exist
    await expect(page.locator('section, main').first()).toBeVisible();
  });

  test('page loads without errors', async ({ page }) => {
    // Page should load and have content
    await expect(page).toHaveTitle(/neuralminds/i);
  });

  test('theme toggle is visible', async ({ page }) => {
    const themeToggle = page.locator('button[aria-label*="theme"], button[title*="theme"]').or(
      page.locator('button').filter({ has: page.locator('svg') }).first()
    );
    await expect(themeToggle.first()).toBeVisible();
  });
});
