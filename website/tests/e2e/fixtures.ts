/**
 * Playwright Test Fixtures
 *
 * Custom fixtures for authentication, test data generation, database seeding,
 * and Stripe test mode helpers. These fixtures provide reusable test setup
 * and teardown logic across all E2E tests.
 *
 * Days 19-21: Testing Suite & Documentation
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { faker } from '@faker-js/faker';
import pg from 'pg';
import Redis from 'ioredis';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import { testEnv, endpoints, generators } from './playwright.config';

/**
 * Test user types
 */
export interface TestUser {
  id?: string;
  email: string;
  username: string;
  password: string;
  tier: 'free' | 'pro' | 'enterprise';
  apiKey?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/**
 * Test exploit data
 */
export interface TestExploit {
  id?: string;
  protocol: string;
  chain: string;
  amount: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  txHash: string;
  timestamp: Date;
}

/**
 * Database fixture
 */
export class DatabaseFixture {
  private pool: pg.Pool;

  constructor() {
    this.pool = new pg.Pool({
      host: testEnv.database.host,
      port: testEnv.database.port,
      database: testEnv.database.name,
      user: testEnv.database.user,
      password: testEnv.database.password,
    });
  }

  async query(sql: string, params?: any[]) {
    const client = await this.pool.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  async createUser(user: TestUser): Promise<string> {
    const result = await this.query(
      `INSERT INTO users (email, username, password_hash, tier, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [user.email, user.username, 'hashed_' + user.password, user.tier]
    );
    return result.rows[0].id;
  }

  async createExploit(exploit: TestExploit): Promise<string> {
    const result = await this.query(
      `INSERT INTO exploits (protocol, chain, amount_usd, severity, description, tx_hash, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        exploit.protocol,
        exploit.chain,
        exploit.amount,
        exploit.severity,
        exploit.description,
        exploit.txHash,
        exploit.timestamp,
      ]
    );
    return result.rows[0].id;
  }

  async createApiKey(userId: string, tier: string): Promise<string> {
    const key = `test_${faker.string.alphanumeric(32)}`;
    await this.query(
      `INSERT INTO api_keys (user_id, key, tier, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, key, tier]
    );
    return key;
  }

  async cleanup() {
    // Delete test data in reverse order of dependencies
    await this.query("DELETE FROM api_keys WHERE key LIKE 'test_%'");
    await this.query("DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@kamiyo.test')");
    await this.query("DELETE FROM users WHERE email LIKE '%@kamiyo.test'");
    await this.query("DELETE FROM exploits WHERE tx_hash LIKE 'test_%'");
  }

  async close() {
    await this.pool.end();
  }

  async seedExploits(count: number = 50): Promise<TestExploit[]> {
    const exploits: TestExploit[] = [];
    const chains = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism'];
    const severities: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];

    for (let i = 0; i < count; i++) {
      const exploit: TestExploit = {
        protocol: faker.company.name(),
        chain: faker.helpers.arrayElement(chains),
        amount: faker.number.int({ min: 10000, max: 50000000 }),
        severity: faker.helpers.arrayElement(severities),
        description: faker.lorem.sentence(),
        txHash: `test_${faker.string.hexadecimal({ length: 64 })}`,
        timestamp: faker.date.recent({ days: 365 }),
      };

      exploit.id = await this.createExploit(exploit);
      exploits.push(exploit);
    }

    return exploits;
  }
}

/**
 * Redis fixture
 */
export class RedisFixture {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: testEnv.redis.host,
      port: testEnv.redis.port,
      db: testEnv.redis.db,
    });
  }

  async set(key: string, value: string, ttl?: number) {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async delete(key: string) {
    await this.client.del(key);
  }

  async cleanup() {
    const keys = await this.client.keys('test:*');
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async close() {
    await this.client.quit();
  }
}

/**
 * Stripe fixture
 */
export class StripeFixture {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(testEnv.stripe.secretKey, {
      apiVersion: '2023-10-16',
    });
  }

  async createCustomer(user: TestUser): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.username,
      metadata: {
        test: 'true',
        userId: user.id || '',
      },
    });
    return customer.id;
  }

  async createSubscription(
    customerId: string,
    priceId: string
  ): Promise<{ subscriptionId: string; status: string }> {
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
    });

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
    };
  }

  async createTestPrice(tier: 'pro' | 'enterprise'): Promise<string> {
    const amount = tier === 'pro' ? 4900 : 29900;
    const product = await this.stripe.products.create({
      name: `Kamiyo ${tier.charAt(0).toUpperCase() + tier.slice(1)} (Test)`,
      metadata: { test: 'true', tier },
    });

    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { test: 'true' },
    });

    return price.id;
  }

  async simulatePaymentSuccess(paymentIntentId: string) {
    await this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa', // Test payment method
    });
  }

  async simulateWebhook(event: string, data: any) {
    // Create a webhook event for testing
    const webhookEvent = this.stripe.webhooks.constructEvent(
      JSON.stringify({ type: event, data }),
      'test-signature',
      testEnv.stripe.webhookSecret
    );
    return webhookEvent;
  }

  async cleanup() {
    // Delete test customers and subscriptions
    const customers = await this.stripe.customers.list({
      limit: 100,
    });

    for (const customer of customers.data) {
      if (customer.metadata?.test === 'true') {
        await this.stripe.customers.del(customer.id);
      }
    }

    // Delete test products
    const products = await this.stripe.products.list({ limit: 100 });
    for (const product of products.data) {
      if (product.metadata?.test === 'true') {
        await this.stripe.products.update(product.id, { active: false });
      }
    }
  }
}

/**
 * Email fixture (using Mailhog for testing)
 */
export class EmailFixture {
  private transporter: nodemailer.Transporter;
  private apiUrl: string;

  constructor() {
    this.apiUrl = testEnv.email.apiUrl;
    this.transporter = nodemailer.createTransport({
      host: testEnv.email.smtpHost,
      port: testEnv.email.smtpPort,
      ignoreTLS: true,
    });
  }

  async getLatestEmail(to: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/api/v2/messages`);
    const data = await response.json();

    const messages = data.items || [];
    const message = messages.find((m: any) =>
      m.To.some((recipient: any) => recipient.Mailbox + '@' + recipient.Domain === to)
    );

    return message;
  }

  async waitForEmail(to: string, timeout: number = 10000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const email = await this.getLatestEmail(to);
      if (email) {
        return email;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Email to ${to} not received within ${timeout}ms`);
  }

  async cleanup() {
    // Delete all test emails
    await fetch(`${this.apiUrl}/api/v1/messages`, { method: 'DELETE' });
  }
}

/**
 * WebSocket mock server
 */
export class WebSocketMock {
  private server: any;
  private clients: Set<any> = new Set();

  async start(port: number = 8001) {
    const WebSocket = require('ws');
    this.server = new WebSocket.Server({ port });

    this.server.on('connection', (ws: any) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  broadcast(data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        // OPEN
        client.send(message);
      }
    });
  }

  async stop() {
    this.server?.close();
    this.clients.clear();
  }
}

/**
 * Custom fixtures for Playwright tests
 */
type CustomFixtures = {
  database: DatabaseFixture;
  redis: RedisFixture;
  stripe: StripeFixture;
  email: EmailFixture;
  websocket: WebSocketMock;
  authenticatedUser: TestUser;
  freeUser: TestUser;
  proUser: TestUser;
  enterpriseUser: TestUser;
  testExploits: TestExploit[];
};

/**
 * Extend Playwright test with custom fixtures
 */
export const test = base.extend<CustomFixtures>({
  // Database fixture
  database: async ({}, use) => {
    const db = new DatabaseFixture();
    await use(db);
    await db.cleanup();
    await db.close();
  },

  // Redis fixture
  redis: async ({}, use) => {
    const redis = new RedisFixture();
    await use(redis);
    await redis.cleanup();
    await redis.close();
  },

  // Stripe fixture
  stripe: async ({}, use) => {
    const stripe = new StripeFixture();
    await use(stripe);
    await stripe.cleanup();
  },

  // Email fixture
  email: async ({}, use) => {
    const email = new EmailFixture();
    await use(email);
    await email.cleanup();
  },

  // WebSocket mock
  websocket: async ({}, use) => {
    const ws = new WebSocketMock();
    await ws.start();
    await use(ws);
    await ws.stop();
  },

  // Authenticated user (free tier)
  authenticatedUser: async ({ database }, use) => {
    const user: TestUser = {
      email: generators.randomEmail(),
      username: generators.randomUsername(),
      password: generators.randomPassword(),
      tier: 'free',
    };

    user.id = await database.createUser(user);
    user.apiKey = await database.createApiKey(user.id, user.tier);

    await use(user);
  },

  // Free tier user
  freeUser: async ({ database }, use) => {
    const user: TestUser = {
      email: generators.randomEmail(),
      username: generators.randomUsername(),
      password: generators.randomPassword(),
      tier: 'free',
    };

    user.id = await database.createUser(user);
    user.apiKey = await database.createApiKey(user.id, user.tier);

    await use(user);
  },

  // Pro tier user
  proUser: async ({ database, stripe }, use) => {
    const user: TestUser = {
      email: generators.randomEmail(),
      username: generators.randomUsername(),
      password: generators.randomPassword(),
      tier: 'pro',
    };

    user.id = await database.createUser(user);
    user.apiKey = await database.createApiKey(user.id, user.tier);
    user.stripeCustomerId = await stripe.createCustomer(user);

    await use(user);
  },

  // Enterprise tier user
  enterpriseUser: async ({ database, stripe }, use) => {
    const user: TestUser = {
      email: generators.randomEmail(),
      username: generators.randomUsername(),
      password: generators.randomPassword(),
      tier: 'enterprise',
    };

    user.id = await database.createUser(user);
    user.apiKey = await database.createApiKey(user.id, user.tier);
    user.stripeCustomerId = await stripe.createCustomer(user);

    await use(user);
  },

  // Test exploits
  testExploits: async ({ database }, use) => {
    const exploits = await database.seedExploits(50);
    await use(exploits);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper functions for common test operations
 */
export const helpers = {
  // Login helper
  async login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  },

  // Logout helper
  async logout(page: Page) {
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    await page.waitForURL('/');
  },

  // Wait for API response
  async waitForApiResponse(page: Page, endpoint: string) {
    return await page.waitForResponse((response) =>
      response.url().includes(endpoint) && response.status() === 200
    );
  },

  // Screenshot helper
  async takeScreenshot(page: Page, name: string) {
    await page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true,
    });
  },

  // Accessibility check helper
  async checkAccessibility(page: Page) {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page }).analyze();
    return results;
  },

  // Performance metrics helper
  async getWebVitals(page: Page) {
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Wait for page load
        if (document.readyState === 'complete') {
          resolve(performance.getEntriesByType('navigation')[0]);
        } else {
          window.addEventListener('load', () => {
            resolve(performance.getEntriesByType('navigation')[0]);
          });
        }
      });
    });
    return metrics;
  },
};
