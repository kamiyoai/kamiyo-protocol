import { PublicKey } from '@solana/web3.js';
import { EigenAIClient, InferenceResponse } from './eigenai-client.js';
import { EscrowHandler } from './escrow.js';
import {
  KamiyoEigenAIConfig,
  InferenceParams,
  InferenceResult,
  EscrowParams,
  EscrowResult,
  ReleaseParams,
  DisputeEvidence,
  EigenAIError,
  EigenAIAttestation,
  EIGENAI_DEFAULTS,
  QUALITY_TIERS,
  LIMITS,
} from './types.js';

function validateInferenceParams(params: InferenceParams): void {
  if (!params.messages?.length)
    throw EigenAIError.invalidInput('messages', 'At least one message required');
  if (params.messages.length > LIMITS.MAX_MESSAGES)
    throw EigenAIError.invalidInput('messages', `Max ${LIMITS.MAX_MESSAGES} messages`);

  for (const msg of params.messages) {
    if (msg.content.length > LIMITS.MAX_MESSAGE_LENGTH)
      throw EigenAIError.invalidInput('messages', `Message exceeds ${LIMITS.MAX_MESSAGE_LENGTH} chars`);
  }

  const escrowAmt = params.escrowAmount;
  if (typeof escrowAmt !== 'number' || !Number.isFinite(escrowAmt) || escrowAmt <= 0)
    throw EigenAIError.invalidInput('escrowAmount', 'Must be positive number');
  if (escrowAmt < LIMITS.MIN_ESCROW_SOL)
    throw EigenAIError.invalidInput('escrowAmount', `Min ${LIMITS.MIN_ESCROW_SOL} SOL`);
  if (escrowAmt > LIMITS.MAX_ESCROW_SOL)
    throw EigenAIError.invalidInput('escrowAmount', `Max ${LIMITS.MAX_ESCROW_SOL} SOL`);

  if (params.timeLockSeconds !== undefined) {
    if (params.timeLockSeconds < LIMITS.MIN_TIME_LOCK_SECONDS)
      throw EigenAIError.invalidInput('timeLockSeconds', `Min ${LIMITS.MIN_TIME_LOCK_SECONDS}s`);
    if (params.timeLockSeconds > LIMITS.MAX_TIME_LOCK_SECONDS)
      throw EigenAIError.invalidInput('timeLockSeconds', `Max ${LIMITS.MAX_TIME_LOCK_SECONDS}s`);
  }

  if (params.timeoutMs !== undefined) {
    if (params.timeoutMs < LIMITS.MIN_TIMEOUT_MS)
      throw EigenAIError.invalidInput('timeoutMs', `Min ${LIMITS.MIN_TIMEOUT_MS}ms`);
    if (params.timeoutMs > LIMITS.MAX_TIMEOUT_MS)
      throw EigenAIError.invalidInput('timeoutMs', `Max ${LIMITS.MAX_TIMEOUT_MS}ms`);
  }

  if (params.sessionId && params.sessionId.length !== LIMITS.SESSION_ID_LENGTH)
    throw EigenAIError.invalidInput('sessionId', `Must be ${LIMITS.SESSION_ID_LENGTH} bytes`);
  if (params.qualityThreshold !== undefined && (params.qualityThreshold < 0 || params.qualityThreshold > 100))
    throw EigenAIError.invalidInput('qualityThreshold', 'Must be 0-100');
  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2))
    throw EigenAIError.invalidInput('temperature', 'Must be 0-2');
}

export class KamiyoEigenAI {
  private readonly eigenAi: EigenAIClient;
  private readonly escrow: EscrowHandler;
  private readonly config: Required<Pick<KamiyoEigenAIConfig,
    'defaultEscrowAmount' | 'defaultQualityThreshold' | 'defaultTimeLockSeconds' | 'defaultTimeoutMs' | 'debug'
  >> & KamiyoEigenAIConfig;

  private readonly activeEscrows = new Map<string, { sessionId: Uint8Array; treasury: PublicKey; attestation?: EigenAIAttestation; prompt: string; output?: string }>();

  constructor(config: KamiyoEigenAIConfig) {
    this.config = {
      ...config,
      defaultEscrowAmount: config.defaultEscrowAmount ?? EIGENAI_DEFAULTS.ESCROW_AMOUNT_SOL,
      defaultQualityThreshold: config.defaultQualityThreshold ?? EIGENAI_DEFAULTS.QUALITY_THRESHOLD,
      defaultTimeLockSeconds: config.defaultTimeLockSeconds ?? EIGENAI_DEFAULTS.TIME_LOCK_SECONDS,
      defaultTimeoutMs: config.defaultTimeoutMs ?? EIGENAI_DEFAULTS.TIMEOUT_MS,
      debug: config.debug ?? false,
    };
    this.eigenAi = new EigenAIClient(config.eigenAiAuth, config.eigenAiBaseUrl, this.config.defaultTimeoutMs);
    this.escrow = new EscrowHandler({ connection: config.connection, wallet: config.wallet, programId: config.programId });
  }

  async inferenceWithEscrow(
    params: InferenceParams,
    userTokenAccount: PublicKey,
    treasury: PublicKey
  ): Promise<InferenceResult> {
    validateInferenceParams(params);

    const startTime = Date.now();
    const sessionId = params.sessionId || this.escrow.generateSessionId();
    const escrowId = Buffer.from(sessionId).toString('hex');
    const escrowAmount = params.escrowAmount ?? this.config.defaultEscrowAmount;
    const qualityThreshold = params.qualityThreshold ?? this.config.defaultQualityThreshold;
    const timeoutMs = params.timeoutMs ?? this.config.defaultTimeoutMs;

    const balance = await this.escrow.getBalance();
    if (balance < escrowAmount) {
      return {
        success: false,
        error: EigenAIError.insufficientFunds(escrowAmount, balance),
      };
    }

    this.log(`Creating escrow: ${escrowAmount} SOL`);
    const escrowResult = await this.escrow.create({
      sessionId,
      amount: escrowAmount,
      treasury,
      userTokenAccount,
    });

    if (!escrowResult.success) {
      return {
        success: false,
        escrowId,
        error: escrowResult.error,
      };
    }

    const promptText = params.messages.map((m) => m.content).join('\n');
    this.activeEscrows.set(escrowId, { sessionId, treasury, prompt: promptText });

    let inferenceResponse: InferenceResponse;
    try {
      this.log(`Calling EigenAI: ${params.model}`);
      inferenceResponse = await this.eigenAi.inference({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        timeoutMs,
        seed: params.seed,
      });
    } catch (error) {
      this.log(`EigenAI failed: ${error}`);
      this.activeEscrows.delete(escrowId);
      return {
        success: false,
        escrowId,
        escrowPda: escrowResult.escrowPda,
        latencyMs: Date.now() - startTime,
        error:
          error instanceof EigenAIError
            ? error
            : EigenAIError.apiError(error instanceof Error ? error.message : 'Unknown error'),
      };
    }

    const escrowData = this.activeEscrows.get(escrowId);
    if (escrowData) { escrowData.attestation = inferenceResponse.attestation; escrowData.output = inferenceResponse.content; }

    const attestationValid = await this.eigenAi.verifyAttestation(inferenceResponse.attestation);
    if (!attestationValid) {
      this.log(`Invalid attestation for ${escrowId}`);
      this.activeEscrows.delete(escrowId);
      return {
        success: false,
        response: inferenceResponse.content,
        attestation: inferenceResponse.attestation,
        escrowId,
        escrowPda: escrowResult.escrowPda,
        latencyMs: Date.now() - startTime,
        error: EigenAIError.attestationInvalid('Verification failed'),
      };
    }

    const latencyMs = Date.now() - startTime;
    const autoRelease = qualityThreshold <= 0;

    if (autoRelease) {
      this.log(`Auto-releasing escrow: ${escrowId}`);
      const releaseResult = await this.escrow.rateAndRelease({ sessionId, rating: 5, treasury });
      this.activeEscrows.delete(escrowId);

      if (!releaseResult.success) {
        return {
          success: false,
          response: inferenceResponse.content,
          attestation: inferenceResponse.attestation,
          escrowId,
          escrowPda: escrowResult.escrowPda,
          latencyMs,
          error: releaseResult.error,
        };
      }

      return {
        success: true,
        response: inferenceResponse.content,
        attestation: inferenceResponse.attestation,
        escrowId,
        escrowPda: escrowResult.escrowPda,
        autoReleased: true,
        latencyMs,
      };
    }

    return {
      success: true,
      response: inferenceResponse.content,
      attestation: inferenceResponse.attestation,
      escrowId,
      escrowPda: escrowResult.escrowPda,
      autoReleased: false,
      latencyMs,
    };
  }

  async createEscrowForInference(params: EscrowParams): Promise<EscrowResult> {
    return this.escrow.create(params);
  }

  async callEigenAI(
    params: Omit<InferenceParams, 'escrowAmount' | 'provider'>
  ): Promise<InferenceResponse> {
    return this.eigenAi.inference({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      timeoutMs: params.timeoutMs ?? this.config.defaultTimeoutMs,
      seed: params.seed,
    });
  }

  async releaseEscrow(escrowId: string, rating: number): Promise<EscrowResult> {
    const escrowData = this.activeEscrows.get(escrowId);
    if (!escrowData) {
      return {
        success: false,
        error: EigenAIError.invalidInput('escrowId', 'No active escrow with this ID'),
      };
    }

    const result = await this.escrow.rateAndRelease({
      sessionId: escrowData.sessionId,
      rating,
      treasury: escrowData.treasury,
    });

    if (result.success) this.activeEscrows.delete(escrowId);
    return result;
  }

  async disputeWithAttestation(escrowId: string): Promise<EscrowResult> {
    const escrowData = this.activeEscrows.get(escrowId);
    if (!escrowData) {
      return {
        success: false,
        error: EigenAIError.invalidInput('escrowId', 'No active escrow with this ID'),
      };
    }

    return this.escrow.dispute(escrowData.sessionId);
  }

  getDisputeEvidence(escrowId: string): DisputeEvidence | null {
    const escrowData = this.activeEscrows.get(escrowId);
    if (!escrowData?.attestation) return null;
    return { attestation: escrowData.attestation, prompt: escrowData.prompt, output: escrowData.output || '' };
  }

  async getEscrowStatus(escrowId: string) {
    const escrowData = this.activeEscrows.get(escrowId);
    return escrowData ? this.escrow.getStatus(escrowData.sessionId) : { exists: false };
  }

  getBalance(): Promise<number> { return this.escrow.getBalance(); }
  getActiveEscrows(): string[] { return Array.from(this.activeEscrows.keys()); }

  getQualityTier(score: number): { tier: string; refundPercent: number } {
    if (score >= QUALITY_TIERS.EXCELLENT.min) return { tier: 'excellent', refundPercent: QUALITY_TIERS.EXCELLENT.refundPercent };
    if (score >= QUALITY_TIERS.GOOD.min) return { tier: 'good', refundPercent: QUALITY_TIERS.GOOD.refundPercent };
    if (score >= QUALITY_TIERS.POOR.min) return { tier: 'poor', refundPercent: QUALITY_TIERS.POOR.refundPercent };
    return { tier: 'failed', refundPercent: QUALITY_TIERS.FAILED.refundPercent };
  }

  generateSessionId(): Uint8Array { return this.escrow.generateSessionId(); }
  private log(msg: string): void { if (this.config.debug) console.log(`[KamiyoEigenAI] ${msg}`); }
}

export function createKamiyoEigenAI(config: KamiyoEigenAIConfig): KamiyoEigenAI {
  return new KamiyoEigenAI(config);
}
