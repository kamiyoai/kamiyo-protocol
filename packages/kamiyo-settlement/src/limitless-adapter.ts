import { createHash, timingSafeEqual } from 'crypto';
import type { SettlementResult } from './types.js';

const COMMITMENT_DOMAIN = 'limitless-commit-reveal:v1';
const HASH_BYTE_LENGTH = 32;
const SALT_BYTE_LENGTH = 32;

export interface LimitlessCommitmentSubmission {
  settlementId: string;
  oracleId: string;
  commitmentHash: Uint8Array;
}

export interface LimitlessAttestationSubmission {
  settlementId: string;
  oracleId: string;
  score: number;
  salt: Uint8Array;
  metadata?: Record<string, unknown>;
  revealedAt?: number;
}

export interface LimitlessOracleAttestation {
  oracleId: string;
  score: number;
  revealedAt: number;
  metadata?: Record<string, unknown>;
}

export interface LimitlessAttestationProgress {
  settlementId: string;
  threshold: number;
  commitmentCount: number;
  attestationCount: number;
  remainingAttestations: number;
  thresholdMet: boolean;
  settled: boolean;
  attestedOracles: string[];
}

export interface LimitlessThresholdSettlementParams {
  settlementId: string;
  threshold: number;
  attestationCount: number;
  consensusScore: number;
  attestations: LimitlessOracleAttestation[];
}

export interface LimitlessAttestationResult extends LimitlessAttestationProgress {
  settlementTriggered: boolean;
  consensusScore?: number;
  settlementResult?: SettlementResult;
}

export interface LimitlessCommitRevealAdapterConfig {
  threshold: number;
  onThresholdReached: (
    params: LimitlessThresholdSettlementParams
  ) => Promise<SettlementResult>;
  normalizeOracleId?: (oracleId: string) => string;
  now?: () => number;
}

interface OracleCommitmentState {
  commitmentHash: Buffer;
  attestation?: LimitlessOracleAttestation;
}

interface SettlementCommitRevealState {
  commitments: Map<string, OracleCommitmentState>;
  settled: boolean;
  finalizing: boolean;
  consensusScore?: number;
  settlementResult?: SettlementResult;
}

function defaultNormalizeOracleId(oracleId: string): string {
  const normalized = oracleId.trim();
  if (!normalized) {
    throw new Error('oracleId is required');
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function normalizeSettlementId(settlementId: string): string {
  const normalized = settlementId.trim();
  if (!normalized) {
    throw new Error('settlementId is required');
  }
  return normalized;
}

function validateScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error('score must be an integer between 0 and 100');
  }
}

function normalizeSalt(salt: Uint8Array): Buffer {
  if (salt.length !== SALT_BYTE_LENGTH) {
    throw new Error(`salt must be ${SALT_BYTE_LENGTH} bytes`);
  }
  return Buffer.from(salt);
}

function normalizeCommitmentHash(commitmentHash: Uint8Array): Buffer {
  if (commitmentHash.length !== HASH_BYTE_LENGTH) {
    throw new Error(`commitmentHash must be ${HASH_BYTE_LENGTH} bytes`);
  }
  return Buffer.from(commitmentHash);
}

function encodeField(value: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(value.length, 0);
  return Buffer.concat([length, value]);
}

export function computeLimitlessCommitmentHash(
  settlementId: string,
  oracleId: string,
  score: number,
  salt: Uint8Array,
  normalizeOracleId: (oracleId: string) => string = defaultNormalizeOracleId
): Uint8Array {
  const normalizedSettlementId = normalizeSettlementId(settlementId);
  const normalizedOracleId = normalizeOracleId(oracleId);
  validateScore(score);
  const normalizedSalt = normalizeSalt(salt);

  const hash = createHash('sha256');
  hash.update(encodeField(Buffer.from(COMMITMENT_DOMAIN, 'utf8')));
  hash.update(encodeField(Buffer.from(normalizedSettlementId, 'utf8')));
  hash.update(encodeField(Buffer.from(normalizedOracleId, 'utf8')));
  hash.update(Buffer.from([score]));
  hash.update(normalizedSalt);
  return new Uint8Array(hash.digest());
}

function medianScore(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export class LimitlessCommitRevealAdapter {
  private readonly threshold: number;
  private readonly onThresholdReached: (
    params: LimitlessThresholdSettlementParams
  ) => Promise<SettlementResult>;
  private readonly normalizeOracleId: (oracleId: string) => string;
  private readonly now: () => number;
  private readonly state = new Map<string, SettlementCommitRevealState>();

  constructor(config: LimitlessCommitRevealAdapterConfig) {
    if (!Number.isInteger(config.threshold) || config.threshold < 1) {
      throw new Error('threshold must be an integer greater than 0');
    }
    this.threshold = config.threshold;
    this.onThresholdReached = config.onThresholdReached;
    this.normalizeOracleId = config.normalizeOracleId ?? defaultNormalizeOracleId;
    this.now = config.now ?? (() => Date.now());
  }

  submitCommitment(
    input: LimitlessCommitmentSubmission
  ): LimitlessAttestationProgress {
    const settlementId = normalizeSettlementId(input.settlementId);
    const oracleId = this.normalizeOracleId(input.oracleId);
    const commitmentHash = normalizeCommitmentHash(input.commitmentHash);
    const state = this.getOrCreateState(settlementId);

    if (state.settled) {
      throw new Error('Settlement is already resolved');
    }
    if (state.finalizing) {
      throw new Error('Settlement finalization is in progress');
    }
    if (state.commitments.has(oracleId)) {
      throw new Error(`Commitment already submitted by oracle ${oracleId}`);
    }

    state.commitments.set(oracleId, {
      commitmentHash,
    });

    return this.buildProgress(settlementId, state);
  }

  async submitAttestation(
    input: LimitlessAttestationSubmission
  ): Promise<LimitlessAttestationResult> {
    const settlementId = normalizeSettlementId(input.settlementId);
    const oracleId = this.normalizeOracleId(input.oracleId);
    validateScore(input.score);
    const salt = normalizeSalt(input.salt);

    const state = this.state.get(settlementId);
    if (!state) {
      throw new Error(`No commitments found for settlement ${settlementId}`);
    }
    if (state.settled) {
      throw new Error('Settlement is already resolved');
    }

    const commitmentState = state.commitments.get(oracleId);
    if (!commitmentState) {
      throw new Error(`No commitment found for oracle ${oracleId}`);
    }
    if (commitmentState.attestation) {
      throw new Error(`Attestation already revealed for oracle ${oracleId}`);
    }

    const expectedHash = Buffer.from(
      computeLimitlessCommitmentHash(
        settlementId,
        oracleId,
        input.score,
        salt,
        this.normalizeOracleId
      )
    );
    if (!timingSafeEqual(expectedHash, commitmentState.commitmentHash)) {
      throw new Error('Commitment hash mismatch');
    }

    commitmentState.attestation = {
      oracleId,
      score: input.score,
      revealedAt: input.revealedAt ?? this.now(),
      metadata: input.metadata,
    };

    return this.finalize(settlementId);
  }

  async finalize(settlementId: string): Promise<LimitlessAttestationResult> {
    const normalizedSettlementId = normalizeSettlementId(settlementId);
    const state = this.state.get(normalizedSettlementId);
    if (!state) {
      throw new Error(`No commitments found for settlement ${normalizedSettlementId}`);
    }

    const attestations = this.getAttestations(state);
    const progress = this.buildProgress(normalizedSettlementId, state, attestations);

    if (state.settled) {
      return {
        ...progress,
        settlementTriggered: false,
        consensusScore: state.consensusScore,
        settlementResult: state.settlementResult,
      };
    }
    if (!progress.thresholdMet || state.finalizing) {
      return {
        ...progress,
        settlementTriggered: false,
      };
    }

    state.finalizing = true;
    try {
      const consensusScore = medianScore(attestations.map((entry) => entry.score));
      const settlementResult = await this.onThresholdReached({
        settlementId: normalizedSettlementId,
        threshold: this.threshold,
        attestationCount: attestations.length,
        consensusScore,
        attestations,
      });

      state.settled = true;
      state.consensusScore = consensusScore;
      state.settlementResult = settlementResult;

      const finalizedProgress = this.buildProgress(
        normalizedSettlementId,
        state,
        attestations
      );
      return {
        ...finalizedProgress,
        settlementTriggered: true,
        consensusScore,
        settlementResult,
      };
    } finally {
      state.finalizing = false;
    }
  }

  getProgress(settlementId: string): LimitlessAttestationProgress | null {
    const normalizedSettlementId = normalizeSettlementId(settlementId);
    const state = this.state.get(normalizedSettlementId);
    if (!state) {
      return null;
    }
    return this.buildProgress(normalizedSettlementId, state);
  }

  clear(settlementId?: string): void {
    if (settlementId === undefined) {
      this.state.clear();
      return;
    }
    this.state.delete(normalizeSettlementId(settlementId));
  }

  private getOrCreateState(settlementId: string): SettlementCommitRevealState {
    const existing = this.state.get(settlementId);
    if (existing) {
      return existing;
    }
    const created: SettlementCommitRevealState = {
      commitments: new Map(),
      settled: false,
      finalizing: false,
    };
    this.state.set(settlementId, created);
    return created;
  }

  private getAttestations(
    state: SettlementCommitRevealState
  ): LimitlessOracleAttestation[] {
    return [...state.commitments.values()]
      .map((entry) => entry.attestation)
      .filter((entry): entry is LimitlessOracleAttestation => entry !== undefined)
      .sort((a, b) => a.revealedAt - b.revealedAt);
  }

  private buildProgress(
    settlementId: string,
    state: SettlementCommitRevealState,
    attestations: LimitlessOracleAttestation[] = this.getAttestations(state)
  ): LimitlessAttestationProgress {
    const attestationCount = attestations.length;
    return {
      settlementId,
      threshold: this.threshold,
      commitmentCount: state.commitments.size,
      attestationCount,
      remainingAttestations: Math.max(this.threshold - attestationCount, 0),
      thresholdMet: attestationCount >= this.threshold,
      settled: state.settled,
      attestedOracles: attestations.map((entry) => entry.oracleId),
    };
  }
}
