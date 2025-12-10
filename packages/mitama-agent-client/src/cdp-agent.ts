// CDP Autonomous Agent - Demand-side discovery, reasoning, and payment

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AutonomousServiceAgent, AgentConfig } from './index';

// Coinbase SDK types (optional dependency)
interface CoinbaseSDK {
  getDefaultWallet(): Promise<CoinbaseWallet | null>;
  createWallet(opts: { networkId: string }): Promise<CoinbaseWallet>;
}

interface CoinbaseWallet {
  getDefaultAddress(): Promise<CoinbaseAddress>;
}

interface CoinbaseAddress {
  export(): Promise<string>;
  getBalance(asset: string): Promise<number>;
  faucet(): Promise<{ getTransactionHash(): string }>;
}

export interface CDPAgentConfig extends Omit<AgentConfig, 'keypair'> {
  apiKeyName: string;
  apiKeySecret: string;
  networkId?: string;
}

export interface ToolCall {
  name: string;
  endpoint: string;
  cost: number;
  expectedQuality: number;
  dependencies: string[];
}

export interface ReasoningResult {
  selectedTools: ToolCall[];
  totalCost: number;
  expectedOutcome: string;
  confidence: number;
}

export class CDPAutonomousAgent {
  private coinbase: CoinbaseSDK | null = null;
  private wallet: CoinbaseWallet | null = null;
  private agent: AutonomousServiceAgent | null = null;
  private config: CDPAgentConfig;

  constructor(config: CDPAgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Dynamic import for optional Coinbase SDK
    let Coinbase: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@coinbase/coinbase-sdk');
      Coinbase = sdk.Coinbase;
    } catch {
      throw new Error('Coinbase SDK not installed. Run: npm install @coinbase/coinbase-sdk');
    }

    this.coinbase = new Coinbase({
      apiKeyName: this.config.apiKeyName,
      apiKeySecret: this.config.apiKeySecret
    });

    this.wallet = await this.coinbase!.getDefaultWallet() ||
                  await this.coinbase!.createWallet({
                    networkId: this.config.networkId || 'solana-devnet'
                  });

    const address = await this.wallet!.getDefaultAddress();
    console.log(`[CDP Agent] Wallet initialized: ${address}`);

    const keypair = await this.exportKeypair(address);

    this.agent = new AutonomousServiceAgent({
      keypair,
      connection: this.config.connection,
      programId: this.config.programId,
      qualityThreshold: this.config.qualityThreshold,
      maxPrice: this.config.maxPrice,
      autoDispute: this.config.autoDispute
    });
  }

  // Discover Mitama-enabled APIs
  async discoverAPIs(): Promise<ToolCall[]> {
    console.log('[CDP Agent] Discovering Mitama-enabled APIs...');

    const discoveryEndpoints = [
      'https://mitama.kamiyo.ai',
      'https://api.example.com',
    ];

    const availableTools: ToolCall[] = [];

    for (const endpoint of discoveryEndpoints) {
      try {
        const response = await fetch(endpoint);

        if (response.status === 402) {
          const paymentInfo = await response.json() as { service?: string; amount?: number; quality_guarantee?: boolean };

          availableTools.push({
            name: paymentInfo.service || 'Unknown',
            endpoint: endpoint,
            cost: paymentInfo.amount || 0,
            expectedQuality: paymentInfo.quality_guarantee ? 90 : 50,
            dependencies: []
          });

          console.log(`[CDP Agent] Discovered: ${endpoint} (${paymentInfo.amount} SOL)`);
        }
      } catch (error) {
        continue;
      }
    }

    return availableTools;
  }

  // Analyze tool calls and plan execution
  async reasonOverToolCalls(
    query: string,
    availableTools: ToolCall[]
  ): Promise<ReasoningResult> {
    console.log('[CDP Agent] Reasoning over available tools...');

    const selectedTools = availableTools
      .filter(tool => tool.cost <= this.config.maxPrice)
      .filter(tool => tool.expectedQuality >= this.config.qualityThreshold)
      .sort((a, b) => b.expectedQuality - a.expectedQuality)
      .slice(0, 3);

    const totalCost = selectedTools.reduce((sum, tool) => sum + tool.cost, 0);

    const reasoning: ReasoningResult = {
      selectedTools,
      totalCost,
      expectedOutcome: `Will query ${selectedTools.length} tools for: ${query}`,
      confidence: selectedTools.length > 0 ? 0.85 : 0.3
    };

    console.log(`[CDP Agent] Selected ${selectedTools.length} tools (total: ${totalCost} SOL)`);

    return reasoning;
  }

  // Execute tools in sequence with payment
  async executeChainedToolCalls(
    reasoning: ReasoningResult,
    query: any,
    schema: any
  ): Promise<any[]> {
    console.log('[CDP Agent] Executing chained tool calls...');

    const results = [];

    for (const tool of reasoning.selectedTools) {
      console.log(`[CDP Agent] Calling tool: ${tool.name}`);

      try {
        const result = await this.agent!.consumeAPI(
          tool.endpoint,
          query,
          schema
        );

        results.push({
          tool: tool.name,
          data: result.data,
          quality: result.quality,
          cost: result.cost
        });

        console.log(`[CDP Agent] ${tool.name}: Quality ${result.quality}%, Cost ${result.cost} SOL`);

        if (result.quality < this.config.qualityThreshold) {
          console.log(`[CDP Agent] ${tool.name}: Quality below threshold, dispute filed`);
        }

      } catch (error: any) {
        console.log(`[CDP Agent] ${tool.name}: Failed - ${error.message}`);
        results.push({
          tool: tool.name,
          error: error.message,
          quality: 0,
          cost: 0
        });
      }
    }

    return results;
  }

  // Complete autonomous workflow
  async autonomousWorkflow(query: any, schema: any): Promise<{
    reasoning: ReasoningResult;
    results: any[];
    totalCost: number;
    averageQuality: number;
  }> {
    console.log('='.repeat(60));
    console.log('CDP Autonomous Agent - Demand-Side Workflow');
    console.log('='.repeat(60));

    const availableTools = await this.discoverAPIs();
    console.log(`\n[CDP Agent] Discovered ${availableTools.length} Mitama APIs`);

    const reasoning = await this.reasonOverToolCalls(
      JSON.stringify(query),
      availableTools
    );
    console.log(`\n[CDP Agent] Reasoning complete:`);
    console.log(`  - Tools selected: ${reasoning.selectedTools.length}`);
    console.log(`  - Estimated cost: ${reasoning.totalCost} SOL`);
    console.log(`  - Confidence: ${(reasoning.confidence * 100).toFixed(0)}%`);

    console.log(`\n[CDP Agent] Executing chained tool calls...\n`);
    const results = await this.executeChainedToolCalls(
      reasoning,
      query,
      schema
    );

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgQuality = results.reduce((sum, r) => sum + (r.quality || 0), 0) / results.length;

    console.log('\n' + '='.repeat(60));
    console.log('Workflow Complete');
    console.log('='.repeat(60));
    console.log(`Total Cost: ${totalCost} SOL`);
    console.log(`Average Quality: ${avgQuality.toFixed(0)}%`);
    console.log(`Tools Executed: ${results.length}`);

    return {
      reasoning,
      results,
      totalCost,
      averageQuality: avgQuality
    };
  }

  private async exportKeypair(address: CoinbaseAddress): Promise<Keypair> {
    const privateKey = await address.export();
    return Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
  }

  async getBalance(): Promise<number> {
    if (!this.wallet) throw new Error('Agent not initialized');
    const address = await this.wallet.getDefaultAddress();
    const balance = await address.getBalance('sol');
    return balance;
  }

  async requestFaucet(): Promise<void> {
    if (!this.wallet) throw new Error('Agent not initialized');
    const address = await this.wallet.getDefaultAddress();
    const faucet = await address.faucet();
    console.log(`[CDP Agent] Faucet tx: ${faucet.getTransactionHash()}`);
  }
}
