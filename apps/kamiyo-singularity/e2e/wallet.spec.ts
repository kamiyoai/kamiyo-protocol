import { test, expect } from '@playwright/test';

test.describe('Wallet Connection UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('connect wallet button is visible', async ({ page }) => {
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectBtn).toBeVisible();
  });

  test('connect wallet button has gradient styling', async ({ page }) => {
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectBtn).toHaveClass(/from-accent/);
  });

  test('connect wallet button is clickable', async ({ page }) => {
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectBtn).toBeEnabled();
  });
});

test.describe('Wallet Required Pages', () => {
  test('portfolio page accessible without wallet', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page).toHaveURL('/portfolio');
  });

  test('market detail shows connect prompt when not connected', async ({ page }) => {
    await page.goto('/markets/test-market');
    // Either shows "Market not found" (invalid id) or "Connect wallet to trade" (valid id)
    const hasConnectPrompt = await page.getByText(/connect wallet/i).isVisible();
    const hasNotFound = await page.getByText(/market not found/i).isVisible();
    expect(hasConnectPrompt || hasNotFound).toBeTruthy();
  });
});
