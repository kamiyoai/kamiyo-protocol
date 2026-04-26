import { defineConfig } from 'vitest/config';

// Smoke-test config — opt-in via SAEP_SMOKE_ENABLED=1.
// Hits real Solana mainnet RPC; never run in regular CI without explicit gating.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/smoke/**/*.smoke.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
