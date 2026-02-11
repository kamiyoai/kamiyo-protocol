import type { Strategy, TransactionResult, DeadlineConfig } from '../types.js';
import { MoltbookClient } from '../moltbook.js';
import { JobDatabase } from '../db.js';

export interface OrchestratorResult {
  success: boolean;
  result?: TransactionResult;
  elapsed: number;
  strategiesTriggered: string[];
  error?: string;
}

export class DeadlineTransactionOrchestrator {
  private strategies: Strategy[] = [];
  private config: DeadlineConfig;
  private moltbook: MoltbookClient;
  private db: JobDatabase;
  private startTime = 0;
  private running = false;
  private result: TransactionResult | null = null;

  constructor(params: {
    config: DeadlineConfig;
    strategies: Strategy[];
    moltbook: MoltbookClient;
    db: JobDatabase;
  }) {
    this.config = params.config;
    this.strategies = params.strategies.sort((a, b) => a.priority - b.priority);
    this.moltbook = params.moltbook;
    this.db = params.db;
  }

  async run(): Promise<OrchestratorResult> {
    this.startTime = Date.now();
    this.running = true;
    const deadline = this.startTime + this.config.deadlineMs;
    const triggeredStrategies: string[] = [];
    const executedStrategies = new Set<string>();

    console.log(`[Orchestrator] Mission started. Deadline: ${new Date(deadline).toISOString()}`);
    console.log(`[Orchestrator] Strategies: ${this.strategies.map(s => s.name).join(', ')}`);
    console.log(`[Orchestrator] Budget: ${this.config.budgetSol} SOL`);
    console.log('');

    while (this.running && Date.now() < deadline) {
      const elapsed = Date.now() - this.startTime;

      for (const strategy of this.strategies) {
        if (elapsed < strategy.activateAfterMs) continue;
        if (executedStrategies.has(strategy.name)) continue;

        const canExec = await strategy.canExecute();
        if (!canExec) {
          console.log(`[Orchestrator] ${strategy.name}: cannot execute (prerequisites not met)`);
          executedStrategies.add(strategy.name);
          continue;
        }

        console.log(`[Orchestrator] Activating: ${strategy.name}`);
        triggeredStrategies.push(strategy.name);
        executedStrategies.add(strategy.name);

        try {
          const result = await strategy.execute();
          if (result.success) {
            this.result = result;
            return this.finalize(result, triggeredStrategies);
          }
        } catch (err) {
          console.error(`[Orchestrator] ${strategy.name} execution error:`, err);
        }
      }

      for (const strategy of this.strategies) {
        if (!executedStrategies.has(strategy.name)) continue;

        try {
          const result = await strategy.poll();
          if (result?.success) {
            this.result = result;
            return this.finalize(result, triggeredStrategies);
          }
        } catch (err) {
          console.error(`[Orchestrator] ${strategy.name} poll error:`, err);
        }
      }

      const hoursLeft = ((deadline - Date.now()) / (1000 * 60 * 60)).toFixed(1);
      const statusLines = this.strategies
        .filter(s => executedStrategies.has(s.name))
        .map(s => `  ${s.name}: ${s.getStatus()}`);

      console.log(`[Orchestrator] ${hoursLeft}h remaining | Active strategies:`);
      statusLines.forEach(l => console.log(l));
      console.log('');

      await new Promise(r => setTimeout(r, this.config.pollIntervalMs));
    }

    this.running = false;
    console.error('[Orchestrator] DEADLINE REACHED — mission failed');

    return {
      success: false,
      elapsed: Date.now() - this.startTime,
      strategiesTriggered: triggeredStrategies,
      error: 'Deadline reached without completing a transaction',
    };
  }

  stop(): void {
    this.running = false;
  }

  getResult(): TransactionResult | null {
    return this.result;
  }

  private async finalize(
    result: TransactionResult,
    triggeredStrategies: string[]
  ): Promise<OrchestratorResult> {
    this.running = false;
    const elapsed = Date.now() - this.startTime;

    console.log('');
    console.log('========================================');
    console.log('  MISSION COMPLETE');
    console.log('========================================');
    console.log(`  TX Hash: ${result.txHash}`);
    console.log(`  Payment: ${result.amountSol} SOL (${result.paymentType})`);
    console.log(`  Counterparty: ${result.counterpartyAgent ?? 'self'}`);
    console.log(`  Elapsed: ${this.formatDuration(elapsed)}`);
    console.log('========================================');
    console.log('');

    try {
      this.db.run(
        `INSERT INTO transaction_log
          (job_id, post_id, escrow_address, create_tx, release_tx, amount_sol, requester_wallet, provider_agent, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        0,
        result.moltbookPostId ?? '',
        result.escrowAddress ?? '',
        result.txHash ?? '',
        result.txHash ?? '',
        result.amountSol,
        '',
        result.counterpartyAgent ?? '',
        this.startTime,
        Date.now()
      );
    } catch (err) {
      console.error('[Orchestrator] DB log failed:', err);
    }

    await this.postCelebration(result, elapsed);

    return {
      success: true,
      result,
      elapsed,
      strategiesTriggered: triggeredStrategies,
    };
  }

  private async postCelebration(result: TransactionResult, elapsed: number): Promise<void> {
    try {
      const isSelf = result.counterpartyAgent === 'kamiyo';
      const title = isSelf
        ? 'On-Chain Escrow Transaction Verified'
        : 'Agent-to-Agent Paid Transaction Complete';

      const body = `## ${title}\n\n` +
        `**TX Hash:** \`${result.txHash}\`\n` +
        `**Amount:** ${result.amountSol} SOL\n` +
        `**Type:** ${result.paymentType}\n` +
        (result.counterpartyAgent && !isSelf
          ? `**Counterparty:** @${result.counterpartyAgent}\n`
          : '') +
        (result.escrowAddress
          ? `**Escrow:** \`${result.escrowAddress}\`\n`
          : '') +
        `**Time:** ${this.formatDuration(elapsed)}\n` +
        `**Verify:** https://solscan.io/tx/${result.txHash}`;

      await this.moltbook.createPost({
        title,
        body,
        submolt: 'agents',
      });
    } catch (err) {
      console.error('[Orchestrator] Celebration post failed:', err);
    }
  }

  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}
