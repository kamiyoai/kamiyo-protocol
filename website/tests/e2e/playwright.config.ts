/**
 * Playwright E2E Testing Configuration
 *
 * Comprehensive configuration for end-to-end testing across multiple browsers,
 * devices, and environments. Supports parallel execution, retries, screenshots,
 * and video recording for failed tests.
 *
 * Days 19-21: Testing Suite & Documentation
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Read environment variables
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';
const CI = process.env.CI === 'true';

/**
 * Playwright Configuration
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Test file patterns
  testMatch: '**/*.spec.ts',

  // Timeout for each test
  timeout: 60 * 1000, // 60 seconds

  // Timeout for each assertion
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!CI,

  // Retry on CI only
  retries: CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    // Human-readable output
    ['html', { outputFolder: 'test-results/html-report' }],
    // JSON output for programmatic processing
    ['json', { outputFile: 'test-results/test-results.json' }],
    // JUnit XML for CI integration
    ['junit', { outputFile: 'test-results/junit.xml' }],
    // Console output
    ['list'],
    // GitHub Actions annotations
    ...(CI ? [['github']] : []),
  ],

  // Shared settings for all projects
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: BASE_URL,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Browser context options
    contextOptions: {
      // Ignore HTTPS errors (for local testing)
      ignoreHTTPSErrors: true,
    },

    // Action timeout
    actionTimeout: 15 * 1000,

    // Navigation timeout
    navigationTimeout: 30 * 1000,
  },

  // Configure projects for major browsers
  projects: [
    // Setup project for authentication
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Desktop Chrome
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Desktop Firefox
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Desktop Safari
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile Safari
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Tablet
    {
      name: 'iPad',
      use: {
        ...devices['iPad Pro'],
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Branded browsers (optional)
    {
      name: 'Microsoft Edge',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'test-results/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Global setup and teardown
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'global-teardown.ts'),

  // Output directory for test artifacts
  outputDir: 'test-results/artifacts',

  // Folder for test artifacts such as screenshots, videos, traces, etc.
  snapshotDir: 'tests/e2e/__snapshots__',

  // Web server configuration (start dev server before tests)
  webServer: CI ? undefined : [
    // Start API server
    {
      command: 'python -m uvicorn api.main:app --host 0.0.0.0 --port 8000',
      port: 8000,
      timeout: 120 * 1000,
      reuseExistingServer: !CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL: 'postgresql://test:test@localhost:5432/kamiyo_test',
        REDIS_URL: 'redis://localhost:6379/1',
        STRIPE_SECRET_KEY: 'sk_test_fake',
        JWT_SECRET: 'test-secret-key',
      },
    },
    // Start frontend dev server
    {
      command: 'cd frontend-agent && npm run dev',
      port: 3000,
      timeout: 120 * 1000,
      reuseExistingServer: !CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

/**
 * Custom reporter for detailed test metrics
 */
export class CustomReporter {
  onBegin(config, suite) {
    console.log(`Starting test run with ${suite.allTests().length} tests`);
  }

  onTestEnd(test, result) {
    const status = result.status;
    const duration = result.duration;
    console.log(`Test: ${test.title} - ${status} (${duration}ms)`);
  }

  async onEnd(result) {
    console.log(`Test run finished with ${result.status}`);
    console.log(`Total tests: ${result.stats.expected + result.stats.unexpected}`);
    console.log(`Passed: ${result.stats.expected}`);
    console.log(`Failed: ${result.stats.unexpected}`);
    console.log(`Flaky: ${result.stats.flaky}`);
    console.log(`Skipped: ${result.stats.skipped}`);
    console.log(`Duration: ${result.duration}ms`);
  }
}

/**
 * Browser contexts for different test scenarios
 */
export const testContexts = {
  // Anonymous user (not logged in)
  anonymous: {
    storageState: undefined,
  },

  // Free tier user
  freeTier: {
    storageState: 'test-results/.auth/free-user.json',
  },

  // Pro tier user
  proTier: {
    storageState: 'test-results/.auth/pro-user.json',
  },

  // Enterprise tier user
  enterprise: {
    storageState: 'test-results/.auth/enterprise-user.json',
  },

  // Admin user
  admin: {
    storageState: 'test-results/.auth/admin-user.json',
  },
};

/**
 * Test data generators
 */
export const generators = {
  randomEmail: () => `test-${Date.now()}-${Math.random().toString(36)}@kamiyo.test`,
  randomUsername: () => `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  randomPassword: () => `Pass${Math.random().toString(36).substring(2)}!123`,
};

/**
 * API endpoints for testing
 */
export const endpoints = {
  auth: {
    signup: '/api/auth/signup',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    verify: '/api/auth/verify',
  },
  exploits: {
    list: '/api/exploits',
    detail: (id: string) => `/api/exploits/${id}`,
    search: '/api/exploits/search',
  },
  subscriptions: {
    plans: '/api/subscriptions/plans',
    current: '/api/subscriptions/current',
    upgrade: '/api/subscriptions/upgrade',
    cancel: '/api/subscriptions/cancel',
  },
  payments: {
    checkout: '/api/payments/checkout',
    webhook: '/api/payments/webhook',
  },
  apiKeys: {
    list: '/api/keys',
    create: '/api/keys/create',
    revoke: (id: string) => `/api/keys/${id}/revoke`,
  },
};

/**
 * Performance budgets
 */
export const performanceBudgets = {
  // First Contentful Paint (milliseconds)
  fcp: 1800,

  // Largest Contentful Paint (milliseconds)
  lcp: 2500,

  // First Input Delay (milliseconds)
  fid: 100,

  // Cumulative Layout Shift (score)
  cls: 0.1,

  // Time to Interactive (milliseconds)
  tti: 3800,

  // Speed Index (milliseconds)
  speedIndex: 3400,

  // Total Blocking Time (milliseconds)
  tbt: 200,
};

/**
 * Visual regression testing settings
 */
export const visualSettings = {
  // Threshold for visual differences (0-1)
  threshold: 0.2,

  // Maximum differing pixels
  maxDiffPixels: 100,

  // Screenshot options
  fullPage: true,
  animations: 'disabled',
};

/**
 * Accessibility standards
 */
export const a11yStandards = {
  // WCAG level to test against
  wcagLevel: 'AA',

  // Rules to run
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },

  // Rules to disable (if any)
  rules: {},
};

/**
 * Test environment configuration
 */
export const testEnv = {
  // Database
  database: {
    host: 'localhost',
    port: 5432,
    name: 'kamiyo_test',
    user: 'test',
    password: 'test',
  },

  // Redis
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1,
  },

  // Stripe (test mode)
  stripe: {
    publishableKey: 'pk_test_fake',
    secretKey: 'sk_test_fake',
    webhookSecret: 'whsec_test_fake',

    // Test card numbers
    cards: {
      success: '4242424242424242',
      decline: '4000000000000002',
      requiresAuth: '4000002500003155',
      insufficientFunds: '4000000000009995',
    },
  },

  // Email testing
  email: {
    // Use Mailhog for local testing
    smtpHost: 'localhost',
    smtpPort: 1025,
    apiUrl: 'http://localhost:8025',
  },
};
