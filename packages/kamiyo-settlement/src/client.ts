import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type {
  SettlementClientConfig,
  SettlementRequest,
  SettlementResult,
  SettlementState,
  SettlementResponse,
  EligibilityResult,
} from './types.js';
import { SettlementStatus } from './types.js';
import {
  calculateRefund,
  validateViolation,
  type Violation,
} from './violations.js';
import {
  KAMIYO_PROGRAM_ID,
  RESPONSE_TIMEOUT_MS,
  deriveSettlementPDA,
  generateSettlementId,
  isExpired,
  toPublicKey,
} from './utils.js';

const settlementStore = new Map<string, SettlementState>();

export class SettlementClient {
  private connection: Connection;
  private wallet?: Keypair;
  private programId: PublicKey;

  constructor(config: SettlementClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? KAMIYO_PROGRAM_ID;
  }

  async checkEligibility(paymentRef: string): Promise<EligibilityResult> {
    if (!paymentRef || paymentRef.length < 10 || paymentRef.length > 256) {
      return { eligible: false, reason: 'Invalid payment reference' };
    }
    if (!/^[a-zA-Z0-9_\-:.]+$/.test(paymentRef)) {
      return { eligible: false, reason: 'Payment reference contains invalid characters' };
    }

    const existing = Array.from(settlementStore.values()).find(
      (s) => s.paymentRef === paymentRef
    );
    if (existing) {
      return { eligible: false, reason: 'Settlement already exists for this payment' };
    }

    return { eligible: true };
  }

  async requestSettlement(request: SettlementRequest): Promise<SettlementResult> {
    if (!this.wallet) {
      throw new Error('Wallet required to request settlement');
    }

    const validation = validateViolation(request.violation);
    if (!validation.valid) {
      throw new Error(`Invalid violation: ${validation.error}`);
    }

    const eligibility = await this.checkEligibility(request.paymentRef);
    if (!eligibility.eligible) {
      throw new Error(`Not eligible for settlement: ${eligibility.reason}`);
    }

    const provider = toPublicKey(request.provider);
    const [settlementPda] = deriveSettlementPDA(
      this.wallet.publicKey,
      request.paymentRef,
      this.programId
    );

    const settlementId = generateSettlementId(this.wallet.publicKey, request.paymentRef);
    const refundPercent = calculateRefund(request.violation);

    const state: SettlementState = {
      id: settlementId,
      paymentRef: request.paymentRef,
      agent: this.wallet.publicKey,
      provider,
      violation: request.violation,
      status: SettlementStatus.Pending,
      refundPercent,
      createdAt: Date.now(),
      respondByDeadline: Date.now() + RESPONSE_TIMEOUT_MS,
    };

    settlementStore.set(settlementId, state);

    return {
      settlementId,
      txSignature: `sim_${settlementId}`,
      status: SettlementStatus.Pending,
      refundPercent,
    };
  }

  async getStatus(settlementId: string): Promise<SettlementState | null> {
    const state = settlementStore.get(settlementId);
    if (!state) return null;

    if (state.status === SettlementStatus.Pending && isExpired(state.respondByDeadline)) {
      state.status = SettlementStatus.DefaultedToAgent;
      state.resolvedAt = Date.now();
      settlementStore.set(settlementId, state);
    }

    return state;
  }

  async respondToSettlement(
    settlementId: string,
    response: SettlementResponse
  ): Promise<SettlementResult> {
    const state = settlementStore.get(settlementId);
    if (!state) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    if (state.status !== SettlementStatus.Pending) {
      throw new Error(`Cannot respond to settlement in ${state.status} status`);
    }

    if (isExpired(state.respondByDeadline)) {
      throw new Error('Response deadline has passed');
    }

    if (response.accept) {
      state.status = SettlementStatus.Accepted;
      state.resolvedAt = Date.now();
    } else {
      state.status = SettlementStatus.Contested;
    }

    settlementStore.set(settlementId, state);

    return {
      settlementId,
      txSignature: `sim_response_${settlementId}`,
      status: state.status,
      refundPercent: state.refundPercent,
    };
  }

  async escalateToOracles(settlementId: string): Promise<SettlementResult> {
    const state = settlementStore.get(settlementId);
    if (!state) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    if (state.status !== SettlementStatus.Contested) {
      throw new Error('Only contested settlements can be escalated');
    }

    state.status = SettlementStatus.Escalated;
    settlementStore.set(settlementId, state);

    return {
      settlementId,
      txSignature: `sim_escalate_${settlementId}`,
      status: SettlementStatus.Escalated,
      refundPercent: state.refundPercent,
    };
  }

  async resolveWithOracleScore(settlementId: string, oracleScore: number): Promise<SettlementResult> {
    if (!Number.isFinite(oracleScore) || oracleScore < 0 || oracleScore > 100) {
      throw new Error('Oracle score must be 0-100');
    }

    const state = settlementStore.get(settlementId);
    if (!state) {
      throw new Error(`Settlement not found: ${settlementId}`);
    }

    if (state.status !== SettlementStatus.Escalated) {
      throw new Error('Only escalated settlements can be resolved by oracles');
    }

    state.oracleScore = oracleScore;
    state.status = SettlementStatus.Resolved;
    state.resolvedAt = Date.now();

    if (oracleScore >= 50 && oracleScore < 70) {
      state.refundPercent = Math.floor(state.refundPercent * 0.5);
    } else if (oracleScore < 50) {
      state.refundPercent = 0;
    }

    settlementStore.set(settlementId, state);

    return {
      settlementId,
      txSignature: `sim_resolve_${settlementId}`,
      status: SettlementStatus.Resolved,
      refundPercent: state.refundPercent,
    };
  }

  clearStore(): void {
    settlementStore.clear();
  }
}
