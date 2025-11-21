import { Connection, PublicKey } from '@solana/web3.js';
import { AgentIdentity, TestEnvironment, Strategy, TestResult } from './interfaces';

export class SurfpoolTestEnvironment implements TestEnvironment {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  async bootstrap(agent: AgentIdentity, amount: number): Promise<void> {
    const response = await fetch(this.connection.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'surfnet_setBalance',
        params: [agent.pda.toString(), amount],
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Bootstrap failed: ${response.statusText}`);
    }
  }

  async execute(strategy: Strategy): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const result = await strategy.execute(this.connection, new PublicKey('11111111111111111111111111111111'));
      const executionTime = Date.now() - startTime;

      const gasUsed = result.unitsConsumed || 5000;
      const profitable = result.success;

      return {
        profitable,
        pnl: profitable ? 0.01 : 0,
        gasUsed,
        transactions: [],
        executionResult: result
      };
    } catch (error) {
      return {
        profitable: false,
        pnl: 0,
        gasUsed: 0,
        transactions: [],
        executionResult: {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  async timeTravel(slot: number): Promise<void> {
    const response = await fetch(this.connection.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'surfnet_warpToSlot',
        params: [slot],
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Time travel failed: ${response.statusText}`);
    }
  }
}
