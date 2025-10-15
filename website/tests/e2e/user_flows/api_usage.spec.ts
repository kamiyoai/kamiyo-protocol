/**
 * E2E Test: API Usage Flow
 *
 * Tests API key management and usage including:
 * - Generating API keys
 * - Making API requests
 * - Rate limiting verification
 * - Usage tracking
 * - API key revocation
 *
 * Days 19-21: Testing Suite & Documentation
 */

import { test, expect, helpers } from '../fixtures';

test.describe('API Usage Flow', () => {
  test('should generate new API key', async ({ page, freeUser }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/dashboard/api-keys');

    await page.click('[data-testid="generate-key"]');
    await page.fill('[name="keyName"]', 'Test API Key');
    await page.click('[data-testid="confirm-generate"]');

    // Should show new key (only once)
    await expect(page.locator('[data-testid="new-api-key"]')).toBeVisible();
    const apiKey = await page.locator('[data-testid="new-api-key"]').textContent();
    expect(apiKey).toMatch(/^test_[a-zA-Z0-9]{32}$/);

    // Should show copy button
    await page.click('[data-testid="copy-key"]');
    await expect(page.locator('[data-testid="copy-success"]')).toBeVisible();
  });

  test('should make successful API request', async ({ page, freeUser }) => {
    const response = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.exploits).toBeDefined();
    expect(Array.isArray(data.exploits)).toBe(true);
  });

  test('should reject request without API key', async ({ page }) => {
    const response = await page.request.get('/api/exploits');

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('API key required');
  });

  test('should reject request with invalid API key', async ({ page }) => {
    const response = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': 'invalid_key' },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('Invalid API key');
  });

  test('should enforce rate limits', async ({ page, freeUser }) => {
    let successCount = 0;
    let rateLimitHit = false;

    // Make 105 requests (free tier limit is 100/day)
    for (let i = 0; i < 105; i++) {
      const response = await page.request.get('/api/exploits', {
        headers: { 'X-API-Key': freeUser.apiKey },
      });

      if (response.status() === 200) {
        successCount++;
      } else if (response.status() === 429) {
        rateLimitHit = true;
        break;
      }
    }

    expect(successCount).toBeGreaterThanOrEqual(100);
    expect(rateLimitHit).toBe(true);
  });

  test('should track API usage in dashboard', async ({ page, freeUser }) => {
    // Make some API requests
    for (let i = 0; i < 10; i++) {
      await page.request.get('/api/exploits', {
        headers: { 'X-API-Key': freeUser.apiKey },
      });
    }

    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/dashboard');

    // Check usage stats
    await expect(page.locator('[data-testid="api-usage"]')).toBeVisible();
    await expect(page.locator('[data-testid="requests-today"]')).toContainText('10');
    await expect(page.locator('[data-testid="remaining-requests"]')).toContainText('90');
  });

  test('should revoke API key', async ({ page, freeUser, database }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/dashboard/api-keys');

    // Revoke key
    await page.click('[data-testid="revoke-key"]');
    await page.click('[data-testid="confirm-revoke"]');

    await expect(page.locator('[data-testid="revoke-success"]')).toBeVisible();

    // Try to use revoked key
    const response = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    expect(response.status()).toBe(401);
  });

  test('should show API documentation link', async ({ page, freeUser }) => {
    await helpers.login(page, freeUser.email, freeUser.password);
    await page.goto('/dashboard/api-keys');

    const docsLink = page.locator('[data-testid="api-docs-link"]');
    await expect(docsLink).toBeVisible();
    await expect(docsLink).toHaveAttribute('href', '/docs/api');
  });

  test('should display rate limit headers', async ({ page, freeUser }) => {
    const response = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    const headers = response.headers();
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
  });

  test('should support pagination in API', async ({ page, freeUser }) => {
    const response = await page.request.get('/api/exploits?page=1&limit=10', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.exploits.length).toBeLessThanOrEqual(10);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.total).toBeGreaterThan(0);
  });

  test('should support filtering in API', async ({ page, freeUser }) => {
    const response = await page.request.get('/api/exploits?chain=ethereum&severity=critical', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    data.exploits.forEach((exploit: any) => {
      expect(exploit.chain).toBe('ethereum');
      expect(exploit.severity).toBe('critical');
    });
  });

  test('should support sorting in API', async ({ page, freeUser }) => {
    const response = await page.request.get('/api/exploits?sort=amount&order=desc', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    // Verify descending order
    for (let i = 1; i < data.exploits.length; i++) {
      expect(data.exploits[i - 1].amount).toBeGreaterThanOrEqual(data.exploits[i].amount);
    }
  });
});

test.describe('API Performance', () => {
  test('should respond within 500ms', async ({ page, freeUser }) => {
    const startTime = Date.now();

    const response = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    const duration = Date.now() - startTime;

    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(500);
  });

  test('should cache responses', async ({ page, freeUser }) => {
    // First request
    const response1 = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    const cacheHeader1 = response1.headers()['x-cache'];

    // Second request (should be cached)
    const response2 = await page.request.get('/api/exploits', {
      headers: { 'X-API-Key': freeUser.apiKey },
    });

    const cacheHeader2 = response2.headers()['x-cache'];

    expect(cacheHeader1).toBe('MISS');
    expect(cacheHeader2).toBe('HIT');
  });
});
