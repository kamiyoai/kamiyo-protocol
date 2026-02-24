import { test, expect } from '@playwright/test';

// Mobile tests
test.describe('Mobile Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('homepage renders correctly on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /neuralminds/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();
  });

  test('page loads on mobile', async ({ page }) => {
    await page.goto('/');
    // Page should load on mobile viewport
    await expect(page.getByRole('button', { name: /connect/i })).toBeVisible();
  });

  test('markets page renders on mobile', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('settings page renders on mobile', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});

// Tablet tests
test.describe('Tablet Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
  });

  test('homepage renders correctly on tablet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /neuralminds/i })).toBeVisible();
  });

  test('navigation is visible on tablet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /markets/i })).toBeVisible();
  });
});

// Desktop tests
test.describe('Desktop Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('homepage renders correctly on desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /neuralminds/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /markets/i })).toBeVisible();
  });

  test('search input is visible on desktop', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();
  });
});

// Viewport breakpoint smoke tests
test.describe('Viewport Breakpoints', () => {
  const viewports = [
    { name: 'mobile-sm', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    test(`homepage loads at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.getByRole('link', { name: /neuralminds/i })).toBeVisible();
    });
  }
});
