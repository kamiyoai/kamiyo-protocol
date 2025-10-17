/**
 * Playwright Global Teardown
 *
 * Runs once after all tests. Cleans up test data, closes connections,
 * and performs any other global cleanup.
 */

import { FullConfig } from '@playwright/test';
import { DatabaseFixture, RedisFixture } from './fixtures';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Running global teardown...');

  // Cleanup test database
  const db = new DatabaseFixture();
  await db.cleanup();
  await db.close();

  // Cleanup Redis
  const redis = new RedisFixture();
  await redis.cleanup();
  await redis.close();

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
