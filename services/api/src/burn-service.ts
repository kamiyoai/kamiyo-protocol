// BurnService - Track $KAMIYO burns from API usage
// 1% of all paid API fees contribute to deflationary pressure

import Database from 'better-sqlite3';
import { logger } from './logger';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/companion.db`;

// Get shared database instance
let db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    initBurnTables();
  }
  return db;
}

// Token constants
const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';
const KAMIYO_DECIMALS = 6;
const BURN_RATE_BPS = 100; // 1% = 100 basis points

// Credit to KAMIYO conversion (1M KAMIYO = $10 credits)
const KAMIYO_PER_DOLLAR = 100_000; // 1M / $10

export interface BurnRecord {
  id: number;
  source: 'api_credits' | 'api_x402' | 'on_chain';
  wallet: string | null;
  endpoint: string | null;
  usd_value: number;
  kamiyo_amount: string; // Raw amount with decimals
  kamiyo_formatted: string; // Human-readable
  status: 'pending' | 'executed' | 'batched';
  tx_signature: string | null;
  created_at: number;
}

export interface BurnStats {
  totalBurnedKamiyo: string;
  totalBurnedKamiyoFormatted: string;
  totalUsdValue: number;
  burnCount: number;
  burns24h: number;
  pendingBurns: number;
}

function initBurnTables(): void {
  const database = db!;
  database.exec(`
    CREATE TABLE IF NOT EXISTS kamiyo_burns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      wallet TEXT,
      endpoint TEXT,
      usd_value REAL NOT NULL,
      kamiyo_amount TEXT NOT NULL,
      kamiyo_formatted TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_signature TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_burns_source ON kamiyo_burns(source);
    CREATE INDEX IF NOT EXISTS idx_burns_wallet ON kamiyo_burns(wallet);
    CREATE INDEX IF NOT EXISTS idx_burns_status ON kamiyo_burns(status);
    CREATE INDEX IF NOT EXISTS idx_burns_created ON kamiyo_burns(created_at);
  `);
}

export class BurnService {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  /**
   * Calculate burn amount from USD value
   * Returns raw token amount (with decimals)
   */
  calculateBurnAmount(usdValue: number): bigint {
    // Convert USD to KAMIYO
    const kamiyoTokens = usdValue * KAMIYO_PER_DOLLAR;
    // Apply 1% burn rate
    const burnTokens = kamiyoTokens * BURN_RATE_BPS / 10_000;
    // Convert to raw amount with decimals
    return BigInt(Math.floor(burnTokens * Math.pow(10, KAMIYO_DECIMALS)));
  }

  /**
   * Format raw token amount for display
   */
  formatTokenAmount(rawAmount: bigint): string {
    const divisor = BigInt(Math.pow(10, KAMIYO_DECIMALS));
    const whole = rawAmount / divisor;
    const fraction = rawAmount % divisor;

    if (fraction === 0n) {
      return whole.toLocaleString();
    }

    const fractionStr = fraction.toString().padStart(KAMIYO_DECIMALS, '0').replace(/0+$/, '');
    return `${whole.toLocaleString()}.${fractionStr}`;
  }

  /**
   * Record a burn from API credit usage
   */
  recordCreditBurn(
    wallet: string,
    endpoint: string,
    usdValue: number
  ): BurnRecord | null {
    if (usdValue <= 0) return null;

    const burnAmount = this.calculateBurnAmount(usdValue);
    if (burnAmount === 0n) return null;

    const formatted = this.formatTokenAmount(burnAmount);

    try {
      const result = this.db.prepare(`
        INSERT INTO kamiyo_burns (source, wallet, endpoint, usd_value, kamiyo_amount, kamiyo_formatted, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'api_credits',
        wallet,
        endpoint,
        usdValue,
        burnAmount.toString(),
        formatted,
        'pending'
      );

      logger.info('Burn recorded', {
        source: 'api_credits',
        wallet: wallet.slice(0, 10) + '...',
        endpoint,
        usdValue,
        kamiyoBurned: formatted,
      });

      return this.getBurn(result.lastInsertRowid as number);
    } catch (err) {
      logger.error('Failed to record burn', { error: String(err) });
      return null;
    }
  }

  /**
   * Record a burn from x402 payment
   */
  recordX402Burn(
    payer: string | undefined,
    endpoint: string,
    usdValue: number
  ): BurnRecord | null {
    if (usdValue <= 0) return null;

    const burnAmount = this.calculateBurnAmount(usdValue);
    if (burnAmount === 0n) return null;

    const formatted = this.formatTokenAmount(burnAmount);

    try {
      const result = this.db.prepare(`
        INSERT INTO kamiyo_burns (source, wallet, endpoint, usd_value, kamiyo_amount, kamiyo_formatted, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'api_x402',
        payer || null,
        endpoint,
        usdValue,
        burnAmount.toString(),
        formatted,
        'pending'
      );

      logger.info('Burn recorded', {
        source: 'api_x402',
        payer: payer?.slice(0, 10),
        endpoint,
        usdValue,
        kamiyoBurned: formatted,
      });

      return this.getBurn(result.lastInsertRowid as number);
    } catch (err) {
      logger.error('Failed to record burn', { error: String(err) });
      return null;
    }
  }

  /**
   * Get a single burn record
   */
  getBurn(id: number): BurnRecord | null {
    return this.db.prepare('SELECT * FROM kamiyo_burns WHERE id = ?').get(id) as BurnRecord | null;
  }

  /**
   * Get burn history with optional filtering
   */
  getBurns(options: {
    source?: string;
    wallet?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): BurnRecord[] {
    const { source, wallet, status, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM kamiyo_burns WHERE 1=1';
    const params: (string | number)[] = [];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }
    if (wallet) {
      query += ' AND wallet = ?';
      params.push(wallet);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(query).all(...params) as BurnRecord[];
  }

  /**
   * Get aggregated burn statistics
   */
  getStats(): BurnStats {
    const totals = this.db.prepare(`
      SELECT
        COALESCE(SUM(CAST(kamiyo_amount AS INTEGER)), 0) as total_kamiyo,
        COALESCE(SUM(usd_value), 0) as total_usd,
        COUNT(*) as burn_count
      FROM kamiyo_burns
    `).get() as { total_kamiyo: number; total_usd: number; burn_count: number };

    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;

    const recent = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM kamiyo_burns
      WHERE created_at >= ?
    `).get(dayAgo) as { count: number };

    const pending = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM kamiyo_burns
      WHERE status = 'pending'
    `).get() as { count: number };

    const totalKamiyo = BigInt(totals.total_kamiyo || 0);

    return {
      totalBurnedKamiyo: totalKamiyo.toString(),
      totalBurnedKamiyoFormatted: this.formatTokenAmount(totalKamiyo),
      totalUsdValue: totals.total_usd,
      burnCount: totals.burn_count,
      burns24h: recent.count,
      pendingBurns: pending.count,
    };
  }

  /**
   * Mark burns as executed (for batch processing)
   */
  markBurnsExecuted(ids: number[], txSignature: string): number {
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db.prepare(`
      UPDATE kamiyo_burns
      SET status = 'executed', tx_signature = ?
      WHERE id IN (${placeholders})
    `).run(txSignature, ...ids);

    return result.changes;
  }

  /**
   * Get pending burns for batch execution
   */
  getPendingBurns(limit = 100): BurnRecord[] {
    return this.db.prepare(`
      SELECT * FROM kamiyo_burns
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as BurnRecord[];
  }

  /**
   * Get total pending burn amount
   */
  getPendingBurnTotal(): bigint {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(CAST(kamiyo_amount AS INTEGER)), 0) as total
      FROM kamiyo_burns
      WHERE status = 'pending'
    `).get() as { total: number };

    return BigInt(result.total || 0);
  }
}

// Singleton instance
let burnService: BurnService | null = null;

export function getBurnService(): BurnService {
  if (!burnService) {
    burnService = new BurnService();
  }
  return burnService;
}

// Burn execution worker
let burnWorkerInterval: NodeJS.Timeout | null = null;
const BURN_WORKER_INTERVAL = 60 * 60 * 1000; // 1 hour
const MIN_BURN_AMOUNT = 1_000_000n; // 1 KAMIYO minimum to execute

interface BurnWorkerConfig {
  enabled: boolean;
  authoritySecret: string | null;
  rpcUrl: string;
  kamiyoMint: string;
}

function getBurnWorkerConfig(): BurnWorkerConfig {
  return {
    enabled: process.env.BURN_EXECUTION_ENABLED === 'true',
    authoritySecret: process.env.AUTHORITY_WALLET_SECRET || null,
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    kamiyoMint: KAMIYO_MINT,
  };
}

async function executePendingBurns(): Promise<{ success: boolean; txSignature?: string; burnedAmount?: string; burnCount?: number; error?: string }> {
  const config = getBurnWorkerConfig();

  if (!config.enabled) {
    return { success: false, error: 'Burn execution disabled' };
  }

  if (!config.authoritySecret) {
    return { success: false, error: 'AUTHORITY_WALLET_SECRET not configured' };
  }

  const burnService = getBurnService();
  const pendingBurns = burnService.getPendingBurns(100);

  if (pendingBurns.length === 0) {
    logger.debug('No pending burns to execute');
    return { success: true, burnedAmount: '0', burnCount: 0 };
  }

  // Calculate total burn amount
  const totalBurn = pendingBurns.reduce((sum, b) => sum + BigInt(b.kamiyo_amount), 0n);

  if (totalBurn < MIN_BURN_AMOUNT) {
    logger.debug('Pending burn amount below minimum threshold', {
      pending: totalBurn.toString(),
      minimum: MIN_BURN_AMOUNT.toString(),
    });
    return { success: true, burnedAmount: totalBurn.toString(), burnCount: pendingBurns.length };
  }

  try {
    // Import Solana/Anchor dependencies
    const { Connection, Keypair, PublicKey } = await import('@solana/web3.js');
    const { AnchorProvider, Wallet, BN } = await import('@coral-xyz/anchor');
    const { MitamaClient } = await import('@kamiyo/kamiyo-mitama');

    // Load authority keypair
    let authority: InstanceType<typeof Keypair>;
    try {
      const secretKeyBytes = Buffer.from(config.authoritySecret, 'base64');
      authority = Keypair.fromSecretKey(secretKeyBytes);
    } catch {
      return { success: false, error: 'Invalid AUTHORITY_WALLET_SECRET format' };
    }

    // Create Mitama client
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const wallet = new Wallet(authority);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const client = new MitamaClient(provider);

    // Get treasury balance to verify sufficient funds
    const [registryPDA] = MitamaClient.getRegistryPDA();
    const [treasuryVault] = MitamaClient.getTreasuryPDA(registryPDA);
    const treasuryBalance = await connection.getTokenAccountBalance(treasuryVault);
    const balance = BigInt(treasuryBalance.value.amount);

    if (balance < totalBurn) {
      logger.warn('Insufficient treasury balance for burn', {
        balance: balance.toString(),
        required: totalBurn.toString(),
      });
      return { success: false, error: `Insufficient treasury balance: ${balance.toString()} < ${totalBurn.toString()}` };
    }

    // Execute treasury burn via SDK
    const kamiyoMint = new PublicKey(config.kamiyoMint);
    const signature = await client.burnFromTreasury(
      authority,
      new BN(totalBurn.toString()),
      kamiyoMint
    );

    // Mark burns as executed
    const burnIds = pendingBurns.map(b => b.id);
    const updated = burnService.markBurnsExecuted(burnIds, signature);

    logger.info('Treasury burns executed on-chain', {
      signature,
      burnedAmount: burnService.formatTokenAmount(totalBurn),
      burnCount: updated,
      pendingCount: pendingBurns.length,
    });

    return {
      success: true,
      txSignature: signature,
      burnedAmount: totalBurn.toString(),
      burnCount: updated,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to execute treasury burns', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

export function startBurnWorker(): void {
  const config = getBurnWorkerConfig();

  if (!config.enabled) {
    logger.info('Burn execution worker disabled (set BURN_EXECUTION_ENABLED=true)');
    return;
  }

  if (!config.authoritySecret) {
    logger.warn('Burn execution worker disabled: AUTHORITY_WALLET_SECRET not set');
    return;
  }

  logger.info('Starting burn execution worker', {
    interval: BURN_WORKER_INTERVAL / 1000 / 60 + ' minutes',
    minBurn: getBurnService().formatTokenAmount(MIN_BURN_AMOUNT) + ' KAMIYO',
  });

  // Run immediately on start
  executePendingBurns().catch(err => {
    logger.error('Initial burn execution failed', { error: String(err) });
  });

  // Schedule periodic execution
  burnWorkerInterval = setInterval(() => {
    executePendingBurns().catch(err => {
      logger.error('Scheduled burn execution failed', { error: String(err) });
    });
  }, BURN_WORKER_INTERVAL);
}

export function stopBurnWorker(): void {
  if (burnWorkerInterval) {
    clearInterval(burnWorkerInterval);
    burnWorkerInterval = null;
    logger.info('Burn execution worker stopped');
  }
}

// Export for manual triggering via API
export { executePendingBurns };

export default BurnService;
