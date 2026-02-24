import { test, expect } from '@playwright/test';

test.describe('Legal Pages', () => {
  test('terms page loads', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page).toHaveURL('/legal/terms');
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page).toHaveURL('/legal/privacy');
  });

  test('disclaimer page loads', async ({ page }) => {
    await page.goto('/legal/disclaimer');
    await expect(page).toHaveURL('/legal/disclaimer');
  });

  test('main legal page loads', async ({ page }) => {
    await page.goto('/legal');
    await expect(page).toHaveURL('/legal');
  });
});
