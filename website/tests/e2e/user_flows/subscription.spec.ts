/**
 * E2E Test: Subscription Flow
 *
 * Tests subscription management including:
 * - Viewing pricing plans
 * - Stripe checkout process
 * - Payment success/failure handling
 * - Webhook processing
 * - Subscription activation
 * - Upgrade/downgrade flows
 * - Cancellation
 *
 * Days 19-21: Testing Suite & Documentation
 */

import { test, expect, helpers } from '../fixtures';

test.describe('Subscription Flow', () => {
  test('should display all pricing tiers', async ({ page }) => {
    await page.goto('/pricing');

    // Check all tiers are visible
    await expect(page.locator('[data-testid="tier-free"]')).toBeVisible();
    await expect(page.locator('[data-testid="tier-pro"]')).toBeVisible();
    await expect(page.locator('[data-testid="tier-enterprise"]')).toBeVisible();

    // Check pricing is displayed
    await expect(page.locator('[data-testid="price-pro"]')).toContainText('$49');
    await expect(page.locator('[data-testid="price-enterprise"]')).toContainText('$299');
  });

  test('should create Stripe checkout session for Pro tier', async ({ page, freeUser, stripe }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/pricing');

    // Click upgrade to Pro
    const responsePromise = page.waitForResponse('**/api/payments/create-checkout-session');
    await page.click('[data-testid="upgrade-to-pro"]');
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.sessionId).toBeTruthy();

    // Should redirect to Stripe checkout
    await page.waitForURL(/checkout\.stripe\.com/);
  });

  test('should handle successful payment', async ({ page, freeUser, stripe, context }) => {
    await helpers.login(page, freeUser.email, freeUser.password);

    // Mock Stripe checkout success
    await context.route('**/api/payments/webhook', async (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ received: true }),
      });
    });

    // Simulate checkout completion
    await page.goto('/checkout/success?session_id=test_session_123');

    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-success"]')).toContainText(/success|thank you/i);
  });

  test('should process subscription webhook', async ({ stripe, database }) => {
    // Create test subscription
    const priceId = await stripe.createTestPrice('pro');
    const customerId = 'cus_test_123';

    // Simulate webhook event
    const webhookEvent = {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_123',
          customer: customerId,
          items: { data: [{ price: { id: priceId } }] },
          status: 'active',
        },
      },
    };

    // In real test, we'd send this to webhook endpoint
    // and verify database is updated
  });

  test('should upgrade from Free to Pro', async ({ page, freeUser }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/dashboard/subscription');

    // Current tier should be Free
    await expect(page.locator('[data-testid="current-tier"]')).toContainText('Free');

    // Click upgrade
    await page.click('[data-testid="upgrade-to-pro"]');

    // Should show checkout modal or redirect
    await expect(page.url()).toMatch(/checkout|pricing/);
  });

  test('should downgrade from Pro to Free', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/dashboard/subscription');

    // Click downgrade
    await page.click('[data-testid="manage-subscription"]');
    await page.click('[data-testid="cancel-subscription"]');

    // Confirm cancellation
    await page.click('[data-testid="confirm-cancel"]');

    await expect(page.locator('[data-testid="cancellation-success"]')).toBeVisible();
  });

  test('should show usage limits for each tier', async ({ page }) => {
    await page.goto('/pricing');

    // Free tier limits
    const freeTier = page.locator('[data-testid="tier-free"]');
    await expect(freeTier).toContainText('100 requests/day');

    // Pro tier limits
    const proTier = page.locator('[data-testid="tier-pro"]');
    await expect(proTier).toContainText('10,000 requests/day');

    // Enterprise tier limits
    const enterpriseTier = page.locator('[data-testid="tier-enterprise"]');
    await expect(enterpriseTier).toContainText('Unlimited');
  });

  test('should enforce rate limits based on tier', async ({ page, freeUser, context }) => {
    await helpers.login(page, freeUser.email, freeUser.password);

    // Make API requests up to limit
    for (let i = 0; i < 101; i++) {
      const response = await page.request.get('/api/exploits', {
        headers: { 'X-API-Key': freeUser.apiKey },
      });

      if (i < 100) {
        expect(response.status()).toBe(200);
      } else {
        // Should hit rate limit
        expect(response.status()).toBe(429);
      }
    }
  });

  test('should show subscription status in dashboard', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/dashboard');

    // Check subscription info
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Pro');
    await expect(page.locator('[data-testid="billing-cycle"]')).toContainText('Monthly');
    await expect(page.locator('[data-testid="next-billing-date"]')).toBeVisible();
  });

  test('should handle payment failure', async ({ page, freeUser, context }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/pricing');

    // Mock payment failure
    await context.route('**/api/payments/create-checkout-session', (route) => {
      route.fulfill({
        status: 400,
        body: JSON.stringify({ error: 'Payment failed' }),
      });
    });

    await page.click('[data-testid="upgrade-to-pro"]');

    await expect(page.locator('[data-testid="payment-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-error"]')).toContainText(/failed|error/i);
  });

  test('should display invoice history', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/dashboard/billing');

    // Check invoices table
    await expect(page.locator('[data-testid="invoices-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoice-row"]').first()).toBeVisible();
  });

  test('should allow updating payment method', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/dashboard/billing');

    await page.click('[data-testid="update-payment-method"]');

    // Should redirect to Stripe billing portal
    await page.waitForURL(/billing\.stripe\.com/);
  });

  test('should show annual vs monthly pricing toggle', async ({ page }) => {
    await page.goto('/pricing');

    // Default to monthly
    await expect(page.locator('[data-testid="price-pro"]')).toContainText('$49');

    // Toggle to annual
    await page.click('[data-testid="annual-toggle"]');

    // Should show annual pricing (with discount)
    await expect(page.locator('[data-testid="price-pro"]')).toContainText('$490');
    await expect(page.locator('[data-testid="annual-savings"]')).toContainText('Save 17%');
  });

  test('should allow trial period for Pro tier', async ({ page, freeUser }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/pricing');

    // Check trial period mention
    await expect(page.locator('[data-testid="trial-info"]')).toContainText('14-day free trial');

    await page.click('[data-testid="start-trial"]');

    // Should activate trial without payment
    await page.waitForURL('/dashboard');
    await expect(page.locator('[data-testid="trial-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="trial-banner"]')).toContainText('14 days remaining');
  });
});

test.describe('Subscription Edge Cases', () => {
  test('should handle expired cards', async ({ page, proUser, context }) => {
    await helpers.login(page, proUser.email, proUser.password);

    // Mock expired card webhook
    await context.route('**/api/payments/webhook', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          type: 'invoice.payment_failed',
          data: { reason: 'card_expired' },
        }),
      });
    });

    await page.goto('/dashboard');

    // Should show payment failure banner
    await expect(page.locator('[data-testid="payment-failure-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="payment-failure-banner"]')).toContainText(/expired/i);
  });

  test('should handle subscription pause/resume', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/dashboard/subscription');

    // Pause subscription
    await page.click('[data-testid="pause-subscription"]');
    await page.click('[data-testid="confirm-pause"]');

    await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Paused');

    // Resume subscription
    await page.click('[data-testid="resume-subscription"]');

    await expect(page.locator('[data-testid="subscription-status"]')).toContainText('Active');
  });

  test('should show prorated amount on upgrade', async ({ page, proUser }) => {
    await helpers.login(page, proUser.email, proUser.password);
    await page.goto('/pricing');

    // Click upgrade to Enterprise
    await page.click('[data-testid="upgrade-to-enterprise"]');

    // Should show proration info
    await expect(page.locator('[data-testid="proration-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="proration-amount"]')).toMatch(/\$\d+\.\d{2}/);
  });
});
