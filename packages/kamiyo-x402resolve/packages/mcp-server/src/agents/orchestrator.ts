import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';

export interface Agent {
  id: string;
  role: 'buyer' | 'seller' | 'arbiter' | 'quality_assessor';
  capabilities: string[];
  reputation: number;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'proposal' | 'acceptance' | 'rejection' | 'dispute' | 'resolution';
  payload: any;
  timestamp: number;
}

export interface Transaction {
  id: string;
  buyer: Agent;
  seller: Agent;
  arbiter: Agent;
  amount: number;
  status: 'proposed' | 'accepted' | 'executing' | 'completed' | 'disputed' | 'resolved';
  messages: AgentMessage[];
  escrowAddress?: string;
  qualityScore?: number;
  createdAt: number;
  updatedAt: number;
}

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private messageQueue: AgentMessage[] = [];

  constructor(private program: X402Program) {}

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  async proposeTransaction(
    buyerId: string,
    sellerId: string,
    amount: number,
    apiEndpoint: string
  ): Promise<Transaction> {
    const buyer = this.agents.get(buyerId);
    const seller = this.agents.get(sellerId);

    if (!buyer || !seller) {
      throw new Error('Invalid agent IDs');
    }

    const arbiter: Agent = {
      id: 'system_arbiter',
      role: 'arbiter',
      capabilities: ['escrow_management', 'dispute_resolution'],
      reputation: 100,
    };

    const transaction: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      buyer,
      seller,
      arbiter,
      amount,
      status: 'proposed',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.transactions.set(transaction.id, transaction);

    const proposalMessage: AgentMessage = {
      from: buyerId,
      to: sellerId,
      type: 'proposal',
      payload: {
        transactionId: transaction.id,
        amount,
        apiEndpoint,
        terms: {
          timelock: 3600,
          qualityThreshold: 70,
          disputeWindow: 7200,
        },
      },
      timestamp: Date.now(),
    };

    this.sendMessage(proposalMessage);

    return transaction;
  }

  async acceptTransaction(transactionId: string, sellerId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.seller.id !== sellerId) throw new Error('Unauthorized');

    const acceptanceMessage: AgentMessage = {
      from: sellerId,
      to: transaction.buyer.id,
      type: 'acceptance',
      payload: { transactionId },
      timestamp: Date.now(),
    };

    this.sendMessage(acceptanceMessage);
    transaction.status = 'accepted';
    transaction.updatedAt = Date.now();

    await this.executeTransaction(transaction);
  }

  private async executeTransaction(transaction: Transaction): Promise<void> {
    transaction.status = 'executing';
    transaction.updatedAt = Date.now();

    try {
      const sellerPubkey = new PublicKey(transaction.seller.id);

      const result = await this.program.initializeEscrow({
        api: sellerPubkey,
        amount: transaction.amount * 1_000_000_000,
        timeLock: 3600,
        transactionId: transaction.id,
      });

      transaction.escrowAddress = result.escrowPDA.toBase58();
      transaction.status = 'completed';
      transaction.updatedAt = Date.now();

      const completionMessage: AgentMessage = {
        from: transaction.arbiter.id,
        to: transaction.buyer.id,
        type: 'resolution',
        payload: {
          transactionId: transaction.id,
          escrowAddress: transaction.escrowAddress,
          signature: result.signature,
        },
        timestamp: Date.now(),
      };

      this.sendMessage(completionMessage);
    } catch (error: any) {
      transaction.status = 'disputed';
      throw error;
    }
  }

  async assessQualityAndResolve(
    transactionId: string,
    apiResponse: any,
    expectedFields: string[]
  ): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');

    const qualityScore = this.calculateQualityScore(apiResponse, expectedFields);
    transaction.qualityScore = qualityScore;
    transaction.updatedAt = Date.now();

    if (qualityScore < 70) {
      await this.initiateDispute(transaction, qualityScore);
    } else {
      await this.releaseFunds(transaction);
    }
  }

  private calculateQualityScore(response: any, expectedFields: string[]): number {
    if (!response) return 0;

    let score = 0;
    let foundFields = 0;

    for (const field of expectedFields) {
      const value = this.getNestedValue(response, field);
      if (value !== undefined && value !== null) {
        foundFields++;
      }
    }

    const completeness = (foundFields / expectedFields.length) * 100;
    score += completeness * 0.5;

    const freshness = this.assessFreshness(response);
    score += freshness * 0.3;

    const validity = this.assessValidity(response);
    score += validity * 0.2;

    return Math.round(score);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private assessFreshness(response: any): number {
    if (response.timestamp) {
      const age = Date.now() - new Date(response.timestamp).getTime();
      const hourAge = age / (1000 * 60 * 60);
      if (hourAge < 1) return 100;
      if (hourAge < 24) return 80;
      if (hourAge < 168) return 50;
      return 20;
    }
    return 50;
  }

  private assessValidity(response: any): number {
    let score = 100;
    if (typeof response !== 'object') score -= 30;
    if (Object.keys(response).length === 0) score -= 50;
    return Math.max(0, score);
  }

  private async initiateDispute(transaction: Transaction, qualityScore: number): Promise<void> {
    transaction.status = 'disputed';
    transaction.updatedAt = Date.now();

    const disputeMessage: AgentMessage = {
      from: transaction.buyer.id,
      to: transaction.arbiter.id,
      type: 'dispute',
      payload: {
        transactionId: transaction.id,
        qualityScore,
        evidence: {
          expectedQuality: 70,
          actualQuality: qualityScore,
          reason: 'Quality threshold not met',
        },
      },
      timestamp: Date.now(),
    };

    this.sendMessage(disputeMessage);

    const refundPercentage = Math.max(0, 100 - qualityScore);

    console.log(`Dispute filed for transaction ${transaction.id}`);
    console.log(`Quality: ${qualityScore}/100, Refund: ${refundPercentage}%`);
  }

  private async releaseFunds(transaction: Transaction): Promise<void> {
    if (!transaction.escrowAddress) {
      throw new Error('No escrow address found');
    }

    await this.program.releaseFunds(transaction.id);

    transaction.status = 'completed';
    transaction.updatedAt = Date.now();
  }

  private sendMessage(message: AgentMessage): void {
    this.messageQueue.push(message);
    const transaction = this.transactions.get(
      message.payload.transactionId || message.payload.transactionId
    );
    if (transaction) {
      transaction.messages.push(message);
    }
    console.log(`[${message.from} -> ${message.to}] ${message.type}:`, message.payload);
  }

  getTransaction(transactionId: string): Transaction | undefined {
    return this.transactions.get(transactionId);
  }

  getAllTransactions(): Transaction[] {
    return Array.from(this.transactions.values());
  }

  getMessageHistory(transactionId: string): AgentMessage[] {
    const transaction = this.transactions.get(transactionId);
    return transaction?.messages || [];
  }

  async simulateMultiAgentWorkflow(): Promise<Transaction> {
    const buyer: Agent = {
      id: 'agent_buyer_001',
      role: 'buyer',
      capabilities: ['payment', 'quality_assessment'],
      reputation: 85,
    };

    const seller: Agent = {
      id: 'agent_seller_001',
      role: 'seller',
      capabilities: ['api_provision', 'data_delivery'],
      reputation: 92,
    };

    this.registerAgent(buyer);
    this.registerAgent(seller);

    console.log('=== Multi-Agent Workflow Simulation ===\n');

    const transaction = await this.proposeTransaction(
      buyer.id,
      seller.id,
      0.001,
      'https://api.example.com/data'
    );
    console.log(`Transaction proposed: ${transaction.id}\n`);

    await this.acceptTransaction(transaction.id, seller.id);
    console.log(`Transaction accepted by seller\n`);

    const mockApiResponse = {
      data: { temperature: 72, humidity: 65 },
      timestamp: new Date().toISOString(),
      status: 'success',
    };

    await this.assessQualityAndResolve(transaction.id, mockApiResponse, [
      'data.temperature',
      'data.humidity',
      'timestamp',
      'status',
    ]);

    return transaction;
  }
}
