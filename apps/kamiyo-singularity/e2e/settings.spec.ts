import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('displays settings heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('displays preferences section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
    await expect(page.getByText('Dark Mode')).toBeVisible();
    await expect(page.getByText('Push Notifications')).toBeVisible();
  });

  test('displays network section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Network' })).toBeVisible();
    await expect(page.getByText(/solana devnet/i)).toBeVisible();
    await expect(page.getByText(/RPC:/i)).toBeVisible();
  });

  test('displays about section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByText('Version')).toBeVisible();
    await expect(page.getByText('Build')).toBeVisible();
  });

  test('does not display wallet section when not connected', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Wallet' })).not.toBeVisible();
  });
});
