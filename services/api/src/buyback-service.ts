// Buyback: SOL -> KAMIYO via Jupiter, burn 50%, stake 50%

import Database from 'better-sqlite3';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, createBurnCheckedInstruction, createTransferCheckedInstruction, getAccount } from '@solana/spl-token';
import { logger } from './logger';
import {
  buybackExecutionTotal,
  buybackSolSpentTotal,
  buybackKamiyoPurchasedTotal,
  buybackKamiyoBurnedTotal,
  buybackKamiyoStakingTotal,
  buybackExecutionDuration,
  buybackTreasuryBalance,
  buybackLastExecution,
  buybackPriceImpact,
} from './metrics';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/companion.db`;

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const KAMIYO_DECIMALS = 6;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  description: string = 'operation',
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`${description} failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

const STAKING_REWARDS_VAULT = process.env.STAKING_REWARDS_VAULT || '';

export interface BuybackConfig {
  minThresholdLamports: number;
  maxSlippageBps: number;
  cooldownSeconds: number;
  burnBps: number;
  isPaused: boolean;
  lastBuybackAt: number;
}

export interface BuybackRecord {
  id: number;
  sol_spent: number;
  kamiyo_purchased: string;
  kamiyo_burned: string;
  kamiyo_to_staking: string;
  swap_signature: string | null;
  burn_signature: string | null;
  staking_signature: string | null;
  status: 'pending' | 'swapped' | 'distributed' | 'failed';
  error: string | null;
  created_at: number;
}

export interface BuybackStats {
  totalSolSpent: number;
  totalKamiyoPurchased: string;
  totalKamiyoBurned: string;
  totalKamiyoToStaking: string;
  buybackCount: number;
  lastBuybackAt: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    initTables();
  }
  return db;
}

function initTables(): void {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS buyback_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      min_threshold_lamports INTEGER DEFAULT 100000000,
      max_slippage_bps INTEGER DEFAULT 200,
      cooldown_seconds INTEGER DEFAULT 3600,
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

    CREATE INDEX IF NOT EXISTS idx_buyback_status ON buyback_history(status);
    CREATE INDEX IF NOT EXISTS idx_buyback_created ON buyback_history(created_at);

    INSERT OR IGNORE INTO buyback_config (id) VALUES (1);
  `);
}

export const BUYBACK_BETA = true;

export class BuybackService {
  private db: Database.Database;
  private connection: Connection;
  private treasuryAddress: PublicKey | null;
  private executing = false;

  constructor() {
    this.db = getDb();
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    const treasury = process.env.BUYBACK_TREASURY_ADDRESS;
    this.treasuryAddress = treasury ? new PublicKey(treasury) : null;
  }

  getConfig(): BuybackConfig {
    const row = this.db.prepare('SELECT * FROM buyback_config WHERE id = 1').get() as {
      min_threshold_lamports: number;
      max_slippage_bps: number;
      cooldown_seconds: number;
      burn_bps: number;
      is_paused: number;
      last_buyback_at: number;
    };

    return {
      minThresholdLamports: row.min_threshold_lamports,
      maxSlippageBps: row.max_slippage_bps,
      cooldownSeconds: row.cooldown_seconds,
      burnBps: row.burn_bps,
      isPaused: row.is_paused === 1,
      lastBuybackAt: row.last_buyback_at,
    };
  }

  updateConfig(updates: Partial<Omit<BuybackConfig, 'lastBuybackAt'>>): void {
    const fields: string[] = [];
    const values: (number | string)[] = [];

    if (updates.minThresholdLamports !== undefined) {
      if (updates.minThresholdLamports < 0) {
        throw new Error('min_threshold_lamports must be non-negative');
      }
      if (updates.minThresholdLamports > 1000 * 1e9) {
        throw new Error('min_threshold_lamports cannot exceed 1000 SOL');
      }
      fields.push('min_threshold_lamports = ?');
      values.push(updates.minThresholdLamports);
    }

    if (updates.maxSlippageBps !== undefined) {
      if (updates.maxSlippageBps < 0 || updates.maxSlippageBps > 1000) {
        throw new Error('max_slippage_bps must be 0-1000 (0-10%)');
      }
      fields.push('max_slippage_bps = ?');
      values.push(updates.maxSlippageBps);
    }

    if (updates.cooldownSeconds !== undefined) {
      if (updates.cooldownSeconds < 60) {
        throw new Error('cooldown_seconds must be at least 60 (1 minute)');
      }
      if (updates.cooldownSeconds > 7 * 24 * 3600) {
        throw new Error('cooldown_seconds cannot exceed 604800 (7 days)');
      }
      fields.push('cooldown_seconds = ?');
      values.push(updates.cooldownSeconds);
    }

    if (updates.burnBps !== undefined) {
      if (updates.burnBps < 0 || updates.burnBps > 10000) {
        throw new Error('burn_bps must be 0-10000 (0-100%)');
      }
      fields.push('burn_bps = ?');
      values.push(updates.burnBps);
    }

    if (updates.isPaused !== undefined) {
      fields.push('is_paused = ?');
      values.push(updates.isPaused ? 1 : 0);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = unixepoch()');
    this.db.prepare(`UPDATE buyback_config SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  }

  pause(): void {
    this.updateConfig({ isPaused: true });
    logger.info('Buyback paused');
  }

  unpause(): void {
    this.updateConfig({ isPaused: false });
    logger.info('Buyback resumed');
  }

  async getTreasuryBalance(): Promise<number> {
    if (!this.treasuryAddress) return 0;
    return this.connection.getBalance(this.treasuryAddress);
  }

  async withdrawTreasury(destinationAddress: string, lamports: number): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (this.executing) {
      return { success: false, error: 'Buyback execution in progress' };
    }

    const authority = this.loadAuthority();
    if (!authority) {
      return { success: false, error: 'BUYBACK_AUTHORITY_SECRET not set' };
    }

    if (!this.treasuryAddress) {
      return { success: false, error: 'BUYBACK_TREASURY_ADDRESS not set' };
    }

    // Authority must be the treasury owner for this to work
    if (!authority.publicKey.equals(this.treasuryAddress)) {
      return { success: false, error: 'Authority does not own treasury wallet' };
    }

    try {
      const { Transaction, SystemProgram, sendAndConfirmTransaction } = await import('@solana/web3.js');
      const destination = new PublicKey(destinationAddress);

      const balance = await this.getTreasuryBalance();
      const minRent = 890880; // minimum for rent exemption
      const maxWithdraw = Math.max(0, balance - minRent);

      if (lamports > maxWithdraw) {
        return { success: false, error: `Can withdraw max ${maxWithdraw} lamports (${maxWithdraw / 1e9} SOL)` };
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: destination,
          lamports,
        })
      );

      const signature = await sendAndConfirmTransaction(this.connection, tx, [authority], { commitment: 'confirmed' });
      logger.info('Treasury withdrawal', { lamports, destination: destinationAddress, signature });

      return { success: true, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Treasury withdrawal failed', { error });
      return { success: false, error };
    }
  }

  isExecuting(): boolean {
    return this.executing;
  }

  async checkAndExecute(): Promise<{ executed: boolean; reason?: string; record?: BuybackRecord }> {
    if (this.executing) {
      return { executed: false, reason: 'execution already in progress' };
    }

    const config = this.getConfig();

    if (config.isPaused) {
      return { executed: false, reason: 'paused' };
    }

    // Atomic cooldown check
    const now = Math.floor(Date.now() / 1000);
    const cooldownThreshold = now - config.cooldownSeconds;

    const updateResult = this.db.prepare(`
      UPDATE buyback_config
      SET last_buyback_at = ?
      WHERE id = 1 AND last_buyback_at <= ?
    `).run(now, cooldownThreshold);

    if (updateResult.changes === 0) {
      const currentConfig = this.getConfig();
      const remaining = config.cooldownSeconds - (now - currentConfig.lastBuybackAt);
      return { executed: false, reason: `cooldown (${Math.max(0, remaining)}s remaining)` };
    }

    if (!this.treasuryAddress) {
      return { executed: false, reason: 'BUYBACK_TREASURY_ADDRESS not set' };
    }

    const balance = await this.getTreasuryBalance();
    buybackTreasuryBalance.set(balance);

    if (balance < config.minThresholdLamports) {
      return { executed: false, reason: `below threshold (${balance} < ${config.minThresholdLamports})` };
    }

    const dryRun = process.env.BUYBACK_DRY_RUN === 'true';
    if (dryRun) {
      logger.info('Buyback dry run', { balance, threshold: config.minThresholdLamports });
      this.db.prepare('UPDATE buyback_config SET last_buyback_at = 0 WHERE id = 1').run();
      return { executed: false, reason: 'dry run mode' };
    }

    this.executing = true;
    try {
      return await this.executeBuyback(balance, config);
    } finally {
      this.executing = false;
    }
  }

  private async executeBuyback(
    solAmount: number,
    config: BuybackConfig,
  ): Promise<{ executed: boolean; reason?: string; record?: BuybackRecord }> {
    const recordId = this.createRecord(solAmount);
    const executionStart = Date.now();

    try {
      const authority = this.loadAuthority();
      if (!authority) {
        this.updateRecord(recordId, { status: 'failed', error: 'BUYBACK_AUTHORITY_SECRET not set' });
        return { executed: false, reason: 'authority not configured' };
      }

      const { JupiterSwap, SOL_MINT, KAMIYO_MINT: KAMIYO_MINT_STR } = await import('@kamiyo/x402-client');
      const jupiter = new JupiterSwap(this.connection, authority, {
        slippageBps: config.maxSlippageBps,
      });

      const quoteTime = Date.now();
      logger.info('Fetching Jupiter quote', { inputMint: SOL_MINT, outputMint: KAMIYO_MINT_STR, amount: solAmount });
      const quote = await jupiter.quote(SOL_MINT, KAMIYO_MINT_STR, solAmount);
      if (!quote) {
        logger.error('Jupiter quote returned null', { inputMint: SOL_MINT, outputMint: KAMIYO_MINT_STR, amount: solAmount });
        this.updateRecord(recordId, { status: 'failed', error: 'Jupiter quote failed' });
        return { executed: false, reason: 'quote failed' };
      }
      logger.info('Jupiter quote received', { outputAmount: quote.outputAmount, priceImpact: quote.priceImpactPct });

      const priceImpactPct = parseFloat(quote.priceImpactPct || '0');
      const priceImpactBps = Math.round(priceImpactPct * 100);

      buybackPriceImpact.observe(priceImpactBps);

      if (priceImpactBps > config.maxSlippageBps) {
        this.updateRecord(recordId, {
          status: 'failed',
          error: `Price impact too high: ${priceImpactPct}%`,
        });
        return { executed: false, reason: `price impact ${priceImpactPct}% exceeds max ${config.maxSlippageBps / 100}%` };
      }

      const QUOTE_MAX_AGE_MS = 30000;
      if (Date.now() - quoteTime > QUOTE_MAX_AGE_MS) {
        this.updateRecord(recordId, { status: 'failed', error: 'Quote expired before execution' });
        return { executed: false, reason: 'quote expired' };
      }

      const swapResult = await withRetry(async () => {
        const result = await jupiter.swap(SOL_MINT, KAMIYO_MINT_STR, solAmount);
        if (!result.success) {
          throw new Error(result.error || 'swap failed');
        }
        return result;
      }, MAX_RETRIES, 'Jupiter swap');

      if (swapResult.signature) {
        const confirmation = await withRetry(
          () => this.connection.confirmTransaction(swapResult.signature!, 'confirmed'),
          MAX_RETRIES,
          'Transaction confirmation',
        );
        if (confirmation.value.err) {
          this.updateRecord(recordId, {
            status: 'failed',
            error: `Swap transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
          });
          return { executed: false, reason: 'swap transaction failed on-chain' };
        }
      }

      const kamiyoPurchased = BigInt(swapResult.outputAmount);
      this.updateRecord(recordId, {
        kamiyo_purchased: kamiyoPurchased.toString(),
        swap_signature: swapResult.signature || null,
        status: 'swapped',
      });

      logger.info('Buyback swap executed', {
        solSpent: solAmount,
        kamiyoPurchased: kamiyoPurchased.toString(),
        signature: swapResult.signature,
      });

      const burnAmount = (kamiyoPurchased * BigInt(config.burnBps)) / 10000n;
      const stakingAmount = kamiyoPurchased - burnAmount;

      const authorityAta = await getAssociatedTokenAddress(
        KAMIYO_MINT,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      let burnSig: string | null = null;
      if (burnAmount > 0n) {
        try {
          const { Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
          const burnIx = createBurnCheckedInstruction(
            authorityAta,
            KAMIYO_MINT,
            authority.publicKey,
            burnAmount,
            KAMIYO_DECIMALS,
            [],
            TOKEN_2022_PROGRAM_ID,
          );
          const tx = new Transaction().add(burnIx);
          burnSig = await sendAndConfirmTransaction(this.connection, tx, [authority], { commitment: 'confirmed' });

          logger.info('Buyback burn executed', {
            burned: burnAmount.toString(),
            signature: burnSig,
          });
        } catch (err) {
          logger.error('Buyback burn failed', { error: String(err) });
        }
      }

      let stakingSig: string | null = null;
      if (stakingAmount > 0n && STAKING_REWARDS_VAULT) {
        try {
          const { Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
          const stakingVault = new PublicKey(STAKING_REWARDS_VAULT);
          const transferIx = createTransferCheckedInstruction(
            authorityAta,
            KAMIYO_MINT,
            stakingVault,
            authority.publicKey,
            stakingAmount,
            KAMIYO_DECIMALS,
            [],
            TOKEN_2022_PROGRAM_ID,
          );
          const tx = new Transaction().add(transferIx);
          stakingSig = await sendAndConfirmTransaction(this.connection, tx, [authority], { commitment: 'confirmed' });

          logger.info('Buyback staking transfer executed', {
            amount: stakingAmount.toString(),
            signature: stakingSig,
          });
        } catch (err) {
          logger.error('Buyback staking transfer failed', { error: String(err) });
        }
      }

      this.updateRecord(recordId, {
        kamiyo_burned: burnAmount.toString(),
        kamiyo_to_staking: stakingAmount.toString(),
        burn_signature: burnSig,
        staking_signature: stakingSig,
        status: 'distributed',
      });

      const now = Math.floor(Date.now() / 1000);
      buybackLastExecution.set(now);

      const executionDuration = (Date.now() - executionStart) / 1000;
      buybackExecutionDuration.observe(executionDuration);
      buybackExecutionTotal.inc({ status: 'success' });
      buybackSolSpentTotal.inc(solAmount);
      buybackKamiyoPurchasedTotal.inc(Number(kamiyoPurchased));
      buybackKamiyoBurnedTotal.inc(Number(burnAmount));
      buybackKamiyoStakingTotal.inc(Number(stakingAmount));

      const record = this.getRecord(recordId);
      return { executed: true, record: record || undefined };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('Buyback execution failed', { error });
      this.updateRecord(recordId, { status: 'failed', error });

      buybackExecutionTotal.inc({ status: 'failed' });
      const executionDuration = (Date.now() - executionStart) / 1000;
      buybackExecutionDuration.observe(executionDuration);

      return { executed: false, reason: error };
    }
  }

  private loadAuthority(): Keypair | null {
    const secret = process.env.BUYBACK_AUTHORITY_SECRET;
    if (!secret) return null;

    try {
      return Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    } catch {
      logger.error('Invalid BUYBACK_AUTHORITY_SECRET format');
      return null;
    }
  }

  private createRecord(solSpent: number): number {
    const result = this.db.prepare(
      'INSERT INTO buyback_history (sol_spent) VALUES (?)'
    ).run(solSpent);
    return result.lastInsertRowid as number;
  }

  private updateRecord(id: number, updates: Record<string, string | number | null>): void {
    const fields = Object.keys(updates).map(k => `${k} = ?`);
    const values = Object.values(updates);
    this.db.prepare(`UPDATE buyback_history SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  }

  private getRecord(id: number): BuybackRecord | null {
    return this.db.prepare('SELECT * FROM buyback_history WHERE id = ?').get(id) as BuybackRecord | null;
  }

  getFailedRecords(limit = 10): BuybackRecord[] {
    return this.db.prepare(
      'SELECT * FROM buyback_history WHERE status = ? ORDER BY created_at DESC LIMIT ?'
    ).all('failed', limit) as BuybackRecord[];
  }

  async retryRecord(recordId: number): Promise<{ success: boolean; reason?: string; record?: BuybackRecord }> {
    const record = this.getRecord(recordId);
    if (!record) {
      return { success: false, reason: 'Record not found' };
    }
    if (record.status !== 'failed') {
      return { success: false, reason: `Cannot retry record with status: ${record.status}` };
    }

    if (this.executing) {
      return { success: false, reason: 'Another execution is in progress' };
    }

    const config = this.getConfig();
    if (config.isPaused) {
      return { success: false, reason: 'Buyback is paused' };
    }

    this.executing = true;
    try {
      this.db.prepare('DELETE FROM buyback_history WHERE id = ?').run(recordId);
      const result = await this.executeBuyback(record.sol_spent, config);
      return { success: result.executed, reason: result.reason, record: result.record };
    } finally {
      this.executing = false;
    }
  }

  getStats(): BuybackStats {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(sol_spent), 0) as total_sol,
        COALESCE(SUM(CAST(kamiyo_purchased AS INTEGER)), 0) as total_purchased,
        COALESCE(SUM(CAST(kamiyo_burned AS INTEGER)), 0) as total_burned,
        COALESCE(SUM(CAST(kamiyo_to_staking AS INTEGER)), 0) as total_staking,
        COUNT(*) as count
      FROM buyback_history
      WHERE status = 'distributed'
    `).get() as {
      total_sol: number;
      total_purchased: number;
      total_burned: number;
      total_staking: number;
      count: number;
    };

    const config = this.getConfig();

    return {
      totalSolSpent: row.total_sol,
      totalKamiyoPurchased: String(row.total_purchased),
      totalKamiyoBurned: String(row.total_burned),
      totalKamiyoToStaking: String(row.total_staking),
      buybackCount: row.count,
      lastBuybackAt: config.lastBuybackAt,
    };
  }

  getHistory(limit = 20, offset = 0): BuybackRecord[] {
    return this.db.prepare(
      'SELECT * FROM buyback_history ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as BuybackRecord[];
  }
}

let buybackService: BuybackService | null = null;

export function getBuybackService(): BuybackService {
  if (!buybackService) {
    buybackService = new BuybackService();
  }
  return buybackService;
}

let workerInterval: NodeJS.Timeout | null = null;
const DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000;

export function startBuybackWorker(): void {
  const enabled = process.env.BUYBACK_ENABLED === 'true';
  if (!enabled) {
    logger.info('Buyback worker disabled (set BUYBACK_ENABLED=true)');
    return;
  }

  if (!process.env.BUYBACK_AUTHORITY_SECRET) {
    logger.warn('Buyback worker disabled: BUYBACK_AUTHORITY_SECRET not set');
    return;
  }

  if (!process.env.BUYBACK_TREASURY_ADDRESS) {
    logger.warn('Buyback worker disabled: BUYBACK_TREASURY_ADDRESS not set');
    return;
  }

  const checkInterval = parseInt(process.env.BUYBACK_CHECK_INTERVAL || String(DEFAULT_CHECK_INTERVAL), 10);
  const service = getBuybackService();

  logger.info('Starting buyback worker', {
    interval: `${checkInterval / 1000}s`,
    config: service.getConfig(),
  });

  runCheck(service);
  workerInterval = setInterval(() => runCheck(service), checkInterval);
}

async function runCheck(service: BuybackService): Promise<void> {
  try {
    const result = await service.checkAndExecute();
    if (result.executed) {
      logger.info('Buyback executed', {
        record: result.record?.id,
        solSpent: result.record?.sol_spent,
        purchased: result.record?.kamiyo_purchased,
      });
    } else {
      logger.debug('Buyback check skipped', { reason: result.reason });
    }
  } catch (err) {
    logger.error('Buyback check failed', { error: String(err) });
  }
}

export async function stopBuybackWorker(): Promise<void> {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;

    if (buybackService?.isExecuting()) {
      logger.info('Waiting for in-progress buyback...');
      const maxWait = 60000;
      const start = Date.now();
      while (buybackService.isExecuting() && Date.now() - start < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (buybackService.isExecuting()) {
        logger.warn('Buyback execution still in progress after timeout');
      }
    }

    logger.info('Buyback worker stopped');
  }
}
