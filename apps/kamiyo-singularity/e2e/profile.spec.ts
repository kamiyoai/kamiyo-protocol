import { test, expect } from '@playwright/test';

const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/profile/${TEST_WALLET}`);
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveURL(`/profile/${TEST_WALLET}`);
  });

  test('has correct page title with truncated address', async ({ page }) => {
    await expect(page).toHaveTitle(/7xKXtg.*AsU.*neuralminds/i);
  });

  test('displays container with proper layout', async ({ page }) => {
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });
});
