import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { MitamaClient, MitamaUtils } from '@mitama/sdk';

const MITAMA_PROGRAM_ID = new PublicKey('8z97gUtmy43FXLs5kWvqDAA6BjsHYDwKXFoM6LsngXoC');

export interface AgentConfig {
  keypair: Keypair;
  connection: Connection;
  programId: PublicKey;
  qualityThreshold: number;
  maxPrice: number;
  autoDispute: boolean;
}

export interface QualityResult {
  score: number;
  completeness: number;
  accuracy: number;
  freshness: number;
}

export interface ConsumeResult<T> {
  data: T;
  quality: number;
  cost: number;
  disputed: boolean;
}

export class AutonomousServiceAgent {
  private mitamaClient: MitamaClient;

  constructor(private config: AgentConfig) {
    const wallet = new anchor.Wallet(this.config.keypair);
    this.mitamaClient = new MitamaClient({
      programId: this.config.programId || MITAMA_PROGRAM_ID,
      connection: this.config.connection,
      wallet
    });
  }

  async consumeAPI<T>(
    endpoint: string,
    query: any,
    expectedSchema: any
  ): Promise<ConsumeResult<T>> {
    const providerPubkey = await this.getProviderPubkey(endpoint);

    const initialResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });

    if (initialResponse.status === 402) {
      const paymentInfo = await initialResponse.json() as { amount?: number; service?: string };
      const price = paymentInfo.amount || this.config.maxPrice;

      if (price > this.config.maxPrice) {
        throw new Error(`Price ${price} exceeds max ${this.config.maxPrice}`);
      }

      console.log(`[Agent] Creating agreement for ${price} SOL`);

      const transactionId = MitamaUtils.generateTransactionId('agent');
      const [agreementPubkey] = this.mitamaClient.deriveAgreementAddress(transactionId);

      await this.mitamaClient.createAgreement({
        amount: MitamaUtils.solToLamports(price),
        timeLockSeconds: MitamaUtils.hoursToSeconds(24),
        transactionId,
        provider: providerPubkey
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': agreementPubkey.toString()
        },
        body: JSON.stringify(query)
      });

      if (!response.ok) {
        throw new Error(`Service request failed: ${response.statusText}`);
      }

      const data = await response.json() as { data?: T };
      const quality = this.assessQuality(data, expectedSchema, query);

      console.log(`[Agent] Quality score: ${quality.score}/100`);

      let disputed = false;
      let actualCost = price;

      if (quality.score < this.config.qualityThreshold && this.config.autoDispute) {
        console.log(`[Agent] Quality ${quality.score} < threshold ${this.config.qualityThreshold}`);
        console.log(`[Agent] Filing dispute autonomously`);

        const refund = await this.fileDispute(
          endpoint,
          agreementPubkey,
          quality.score,
          data,
          expectedSchema
        );

        disputed = true;
        actualCost = price * (quality.score / 100);
        console.log(`[Agent] Refund: ${refund.percentage}%`);
      }

      return {
        data: (data.data || data) as T,
        quality: quality.score,
        cost: actualCost,
        disputed
      };
    }

    const data = await initialResponse.json() as { data?: T };
    const quality = this.assessQuality(data, expectedSchema, query);

    return {
      data: (data.data || data) as T,
      quality: quality.score,
      cost: 0,
      disputed: false
    };
  }

  private assessQuality(
    received: any,
    expected: any,
    query: any
  ): QualityResult {
    const completeness = this.checkCompleteness(received, expected);
    const accuracy = this.checkAccuracy(received, query);
    const freshness = this.checkFreshness(received);

    const score = completeness * 0.4 + accuracy * 0.3 + freshness * 0.3;

    return {
      score: Math.round(score),
      completeness,
      accuracy,
      freshness
    };
  }

  private checkCompleteness(received: any, expected: any): number {
    const data = received.data || received;
    const expectedFields = Object.keys(expected);

    if (Array.isArray(data) && data.length === 0) {
      return 0;
    }

    const target = Array.isArray(data) ? data[0] : data;
    const receivedFields = Object.keys(target || {});

    const missing = expectedFields.filter(f => !receivedFields.includes(f));
    return ((expectedFields.length - missing.length) / expectedFields.length) * 100;
  }

  private checkAccuracy(received: any, query: any): number {
    const data = received.data || received;

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return 0;
    }

    const target = Array.isArray(data) ? data[0] : data;

    if (query.chain && target.chain && target.chain !== query.chain) {
      return 40;
    }

    if (query.severity && target.severity && target.severity !== query.severity) {
      return 60;
    }

    if (query.protocol_address && target.protocol_address) {
      const queryAddr = query.protocol_address.toLowerCase();
      const targetAddr = String(target.protocol_address).toLowerCase();
      if (!targetAddr.includes(queryAddr.slice(0, 6))) {
        return 50;
      }
    }

    const hasValidValues = Object.values(target).some(v =>
      v !== null && v !== undefined && v !== '' && v !== 0
    );

    return hasValidValues ? 100 : 30;
  }

  private checkFreshness(received: any): number {
    const data = received.data || received;
    const target = Array.isArray(data) ? data[0] : data;

    const timestamp = target?.timestamp;
    if (!timestamp) return 50;

    const age = Date.now() - new Date(timestamp).getTime();
    const maxAge = 3600000;

    return Math.max(0, 100 - (age / maxAge) * 100);
  }

  private async fileDispute(
    endpoint: string,
    escrowPubkey: PublicKey,
    quality: number,
    received: any,
    expected: any
  ): Promise<{ percentage: number }> {
    const disputeEndpoint = endpoint.replace(/\/[^\/]+$/, `/dispute/${escrowPubkey.toString()}`);

    const response = await fetch(disputeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_quality: this.config.qualityThreshold,
        actual_quality: quality,
        evidence: { received, expected }
      })
    });

    if (!response.ok) {
      throw new Error(`Dispute filing failed: ${response.statusText}`);
    }

    const result = await response.json() as { refund?: { percentage?: number } };
    return { percentage: result.refund?.percentage || 0 };
  }

  private async getProviderPubkey(endpoint: string): Promise<PublicKey> {
    return this.config.programId;
  }
}

export { CDPAutonomousAgent, CDPAgentConfig, ToolCall, ReasoningResult } from './cdp-agent';
