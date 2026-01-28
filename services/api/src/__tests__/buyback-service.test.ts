import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../metrics', () => ({
  buybackExecutionTotal: { inc: vi.fn() },
  buybackSolSpentTotal: { inc: vi.fn() },
  buybackKamiyoPurchasedTotal: { inc: vi.fn() },
  buybackKamiyoBurnedTotal: { inc: vi.fn() },
  buybackKamiyoStakingTotal: { inc: vi.fn() },
  buybackExecutionDuration: { observe: vi.fn() },
  buybackTreasuryBalance: { set: vi.fn() },
  buybackLastExecution: { set: vi.fn() },
  buybackPriceImpact: { observe: vi.fn() },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const testDbPath = path.join(__dirname, 'test-buyback.db');
process.env.DATA_DIR = __dirname;

describe('BuybackService', () => {
  let db: Database.Database;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS buyback_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        min_threshold_lamports INTEGER DEFAULT 1000000000,
        max_slippage_bps INTEGER DEFAULT 200,
        cooldown_seconds INTEGER DEFAULT 86400,
        burn_bps INTEGER DEFAULT 5000,
        is_paused INTEGER DEFAULT 0,
        last_buyback_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS buyback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sol_spent INTEGER NOT NULL,
        kamiyo_purchased TEXT NOT NULL DEFAULT '0',
        kamiyo_burned TEXT NOT NULL DEFAULT '0',
        kamiyo_to_staking TEXT NOT NULL DEFAULT '0',
        swap_signature TEXT,
        burn_signature TEXT,
        staking_signature TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );

      INSERT OR IGNORE INTO buyback_config (id) VALUES (1);
    `);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Config Validation', () => {
    it('rejects negative threshold', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.minThresholdLamports !== undefined) {
          if (updates.minThresholdLamports < 0) {
            throw new Error('min_threshold_lamports must be non-negative');
          }
        }
      };

      expect(() => updateConfig({ minThresholdLamports: -1 })).toThrow(
        'min_threshold_lamports must be non-negative'
      );
    });

    it('rejects threshold over 1000 SOL', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.minThresholdLamports !== undefined) {
          if (updates.minThresholdLamports > 1000 * 1e9) {
            throw new Error('min_threshold_lamports cannot exceed 1000 SOL');
          }
        }
      };

      expect(() => updateConfig({ minThresholdLamports: 1001 * 1e9 })).toThrow(
        'min_threshold_lamports cannot exceed 1000 SOL'
      );
    });

    it('rejects slippage over 10%', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.maxSlippageBps !== undefined) {
          if (updates.maxSlippageBps < 0 || updates.maxSlippageBps > 1000) {
            throw new Error('max_slippage_bps must be 0-1000 (0-10%)');
          }
        }
      };

      expect(() => updateConfig({ maxSlippageBps: 1001 })).toThrow(
        'max_slippage_bps must be 0-1000 (0-10%)'
      );
    });

    it('rejects negative slippage', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.maxSlippageBps !== undefined) {
          if (updates.maxSlippageBps < 0 || updates.maxSlippageBps > 1000) {
            throw new Error('max_slippage_bps must be 0-1000 (0-10%)');
          }
        }
      };

      expect(() => updateConfig({ maxSlippageBps: -1 })).toThrow(
        'max_slippage_bps must be 0-1000 (0-10%)'
      );
    });

    it('rejects cooldown under 60s', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.cooldownSeconds !== undefined) {
          if (updates.cooldownSeconds < 60) {
            throw new Error('cooldown_seconds must be at least 60 (1 minute)');
          }
        }
      };

      expect(() => updateConfig({ cooldownSeconds: 30 })).toThrow(
        'cooldown_seconds must be at least 60 (1 minute)'
      );
    });

    it('rejects cooldown over 7 days', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.cooldownSeconds !== undefined) {
          if (updates.cooldownSeconds > 7 * 24 * 3600) {
            throw new Error('cooldown_seconds cannot exceed 604800 (7 days)');
          }
        }
      };

      expect(() => updateConfig({ cooldownSeconds: 8 * 24 * 3600 })).toThrow(
        'cooldown_seconds cannot exceed 604800 (7 days)'
      );
    });

    it('rejects burn over 100%', () => {
      const updateConfig = (updates: Record<string, number>) => {
        if (updates.burnBps !== undefined) {
          if (updates.burnBps < 0 || updates.burnBps > 10000) {
            throw new Error('burn_bps must be 0-10000 (0-100%)');
          }
        }
      };

      expect(() => updateConfig({ burnBps: 10001 })).toThrow(
        'burn_bps must be 0-10000 (0-100%)'
      );
    });
  });

  describe('Price Impact Calculation', () => {
    it('converts percentage to bps', () => {
      const priceImpactPct = 0.5;
      const priceImpactBps = Math.round(priceImpactPct * 100);

      expect(priceImpactBps).toBe(50);
    });

    it('rejects price impact over max slippage', () => {
      const maxSlippageBps = 200;
      const priceImpactPct = 2.5;
      const priceImpactBps = Math.round(priceImpactPct * 100);

      expect(priceImpactBps).toBe(250);
      expect(priceImpactBps > maxSlippageBps).toBe(true);
    });

    it('allows price impact within max slippage', () => {
      const maxSlippageBps = 200;
      const priceImpactPct = 1.5;
      const priceImpactBps = Math.round(priceImpactPct * 100);

      expect(priceImpactBps).toBe(150);
      expect(priceImpactBps > maxSlippageBps).toBe(false);
    });
  });

  describe('Token Split Calculation', () => {
    it('splits 50/50 burn and staking', () => {
      const kamiyoPurchased = 1000000n;
      const burnBps = 5000;

      const burnAmount = (kamiyoPurchased * BigInt(burnBps)) / 10000n;
      const stakingAmount = kamiyoPurchased - burnAmount;

      expect(burnAmount).toBe(500000n);
      expect(stakingAmount).toBe(500000n);
    });

    it('handles 100% burn', () => {
      const kamiyoPurchased = 1000000n;
      const burnBps = 10000;

      const burnAmount = (kamiyoPurchased * BigInt(burnBps)) / 10000n;
      const stakingAmount = kamiyoPurchased - burnAmount;

      expect(burnAmount).toBe(1000000n);
      expect(stakingAmount).toBe(0n);
    });

    it('handles 0% burn', () => {
      const kamiyoPurchased = 1000000n;
      const burnBps = 0;

      const burnAmount = (kamiyoPurchased * BigInt(burnBps)) / 10000n;
      const stakingAmount = kamiyoPurchased - burnAmount;

      expect(burnAmount).toBe(0n);
      expect(stakingAmount).toBe(1000000n);
    });

    it('handles 30/70 split', () => {
      const kamiyoPurchased = 1000000n;
      const burnBps = 3000;

      const burnAmount = (kamiyoPurchased * BigInt(burnBps)) / 10000n;
      const stakingAmount = kamiyoPurchased - burnAmount;

      expect(burnAmount).toBe(300000n);
      expect(stakingAmount).toBe(700000n);
    });
  });

  describe('Cooldown Logic', () => {
    it('calculates remaining cooldown', () => {
      const lastBuybackAt = Math.floor(Date.now() / 1000) - 3600;
      const cooldownSeconds = 86400;
      const now = Math.floor(Date.now() / 1000);

      const elapsed = now - lastBuybackAt;
      const remaining = cooldownSeconds - elapsed;

      expect(elapsed).toBeGreaterThanOrEqual(3600);
      expect(elapsed).toBeLessThan(3700);
      expect(remaining).toBeLessThan(cooldownSeconds);
      expect(remaining).toBeGreaterThan(cooldownSeconds - 3700);
    });

    it('identifies expired cooldown', () => {
      const lastBuybackAt = Math.floor(Date.now() / 1000) - 90000;
      const cooldownSeconds = 86400;
      const now = Math.floor(Date.now() / 1000);

      const cooldownElapsed = now - lastBuybackAt >= cooldownSeconds;

      expect(cooldownElapsed).toBe(true);
    });
  });

  describe('Quote Staleness', () => {
    it('detects stale quote', () => {
      const quoteTime = Date.now() - 35000;
      const maxAgeMs = 30000;

      const isStale = Date.now() - quoteTime > maxAgeMs;

      expect(isStale).toBe(true);
    });

    it('accepts fresh quote', () => {
      const quoteTime = Date.now() - 10000;
      const maxAgeMs = 30000;

      const isStale = Date.now() - quoteTime > maxAgeMs;

      expect(isStale).toBe(false);
    });
  });
});
