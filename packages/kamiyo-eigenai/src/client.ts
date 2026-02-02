import { PublicKey } from '@solana/web3.js';
import { EigenAIClient, InferenceResponse } from './eigenai-client.js';
import { EscrowHandler } from './escrow.js';
import {
  KamiyoEigenAIConfig,
  InferenceParams,
  InferenceResult,
  EscrowParams,
  EscrowResult,
  DisputeEvidence,
  EigenAIError,
  EigenAIAttestation,
  EIGENAI_DEFAULTS,
  QUALITY_TIERS,
  LIMITS,
} from './types.js';

function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `eigenai-${timestamp}-${random}`;
}

function validateInferenceParams(params: InferenceParams): void {
  if (!params.messages?.length) {
    throw EigenAIError.invalidInput('messages', 'At least one message is required');
  }
  if (params.messages.length > LIMITS.MAX_MESSAGES) {
    throw EigenAIError.invalidInput('messages', `Maximum ${LIMITS.MAX_MESSAGES} messages allowed`);
  }
  for (const msg of params.messages) {
    if (msg.content.length > LIMITS.MAX_MESSAGE_LENGTH) {
      throw EigenAIError.invalidInput('messages', `Message exceeds ${LIMITS.MAX_MESSAGE_LENGTH} characters`);
    }
  }
  if (params.escrowAmount < LIMITS.MIN_ESCROW_SOL) {
    throw EigenAIError.invalidInput('escrowAmount', `Minimum ${LIMITS.MIN_ESCROW_SOL} SOL`);
  }
  if (params.escrowAmount > LIMITS.MAX_ESCROW_SOL) {
    throw EigenAIError.invalidInput('escrowAmount', `Maximum ${LIMITS.MAX_ESCROW_SOL} SOL`);
  }
  if (params.timeLockSeconds !== undefined) {
    if (params.timeLockSeconds < LIMITS.MIN_TIME_LOCK_SECONDS) {
      throw EigenAIError.invalidInput('timeLockSeconds', `Minimum ${LIMITS.MIN_TIME_LOCK_SECONDS} seconds`);
    }
    if (params.timeLockSeconds > LIMITS.MAX_TIME_LOCK_SECONDS) {
      throw EigenAIError.invalidInput('timeLockSeconds', `Maximum ${LIMITS.MAX_TIME_LOCK_SECONDS} seconds`);
    }
  }
  if (params.timeoutMs !== undefined) {
    if (params.timeoutMs < LIMITS.MIN_TIMEOUT_MS) {
      throw EigenAIError.invalidInput('timeoutMs', `Minimum ${LIMITS.MIN_TIMEOUT_MS}ms`);
    }
    if (params.timeoutMs > LIMITS.MAX_TIMEOUT_MS) {
      throw EigenAIError.invalidInput('timeoutMs', `Maximum ${LIMITS.MAX_TIMEOUT_MS}ms`);
    }
  }
  if (params.transactionId && params.transactionId.length > LIMITS.MAX_TRANSACTION_ID_LENGTH) {
    throw EigenAIError.invalidInput('transactionId', `Maximum ${LIMITS.MAX_TRANSACTION_ID_LENGTH} characters`);
  }
  if (params.qualityThreshold !== undefined && (params.qualityThreshold < 0 || params.qualityThreshold > 100)) {
    throw EigenAIError.invalidInput('qualityThreshold', 'Must be between 0 and 100');
  }
  if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
    throw EigenAIError.invalidInput('temperature', 'Must be between 0 and 2');
  }
}

export class KamiyoEigenAI {
  private readonly eigenAi: EigenAIClient;
  private readonly escrow: EscrowHandler;
  private readonly config: Required<
    Pick<
      KamiyoEigenAIConfig,
      | 'defaultEscrowAmount'
      | 'defaultQualityThreshold'
      | 'defaultTimeLockSeconds'
      | 'defaultTimeoutMs'
      | 'debug'
    >
  > &
    KamiyoEigenAIConfig;

  private readonly activeEscrows = new Map<
    string,
    {
      provider: PublicKey;
      attestation?: EigenAIAttestation;
      prompt: string;
    }
  >();

  constructor(config: KamiyoEigenAIConfig) {
    if (!config.eigenAiApiKey) {
      throw EigenAIError.invalidInput('eigenAiApiKey', 'API key is required');
    }

    this.config = {
      ...config,
      defaultEscrowAmount: config.defaultEscrowAmount ?? EIGENAI_DEFAULTS.ESCROW_AMOUNT_SOL,
      defaultQualityThreshold:
        config.defaultQualityThreshold ?? EIGENAI_DEFAULTS.QUALITY_THRESHOLD,
      defaultTimeLockSeconds:
        config.defaultTimeLockSeconds ?? EIGENAI_DEFAULTS.TIME_LOCK_SECONDS,
      defaultTimeoutMs: config.defaultTimeoutMs ?? EIGENAI_DEFAULTS.TIMEOUT_MS,
      debug: config.debug ?? false,
    };

    this.eigenAi = new EigenAIClient(
      config.eigenAiApiKey,
      config.eigenAiBaseUrl,
      this.config.defaultTimeoutMs
    );

    this.escrow = new EscrowHandler({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });
  }

  async inferenceWithEscrow(params: InferenceParams): Promise<InferenceResult> {
    validateInferenceParams(params);

    const startTime = Date.now();
    const transactionId = params.transactionId || generateTransactionId();
    const provider = params.provider || this.config.wallet.publicKey;
    const escrowAmount = params.escrowAmount || this.config.defaultEscrowAmount;
    const qualityThreshold = params.qualityThreshold ?? this.config.defaultQualityThreshold;
    const timeLockSeconds = params.timeLockSeconds ?? this.config.defaultTimeLockSeconds;
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
      provider,
      amount: escrowAmount,
      timeLockSeconds,
      transactionId,
    });

    if (!escrowResult.success) {
      return {
        success: false,
        escrowId: transactionId,
        error: escrowResult.error,
      };
    }

    const promptText = params.messages.map((m) => m.content).join('\n');
    this.activeEscrows.set(transactionId, { provider, prompt: promptText });

    let inferenceResponse: InferenceResponse;
    try {
      this.log(`Calling EigenAI: ${params.model}`);
      inferenceResponse = await this.eigenAi.inference({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        timeoutMs,
      });
    } catch (error) {
      this.log(`EigenAI failed: ${error}`);
      return {
        success: false,
        escrowId: transactionId,
        escrowPda: escrowResult.escrowPda,
        latencyMs: Date.now() - startTime,
        error:
          error instanceof EigenAIError
            ? error
            : EigenAIError.apiError(error instanceof Error ? error.message : 'Unknown error'),
      };
    }

    const escrowData = this.activeEscrows.get(transactionId);
    if (escrowData) {
      escrowData.attestation = inferenceResponse.attestation;
    }

    const attestationValid = await this.eigenAi.verifyAttestation(inferenceResponse.attestation);
    if (!attestationValid) {
      this.log(`Invalid attestation for ${transactionId}`);
      return {
        success: false,
        response: inferenceResponse.content,
        attestation: inferenceResponse.attestation,
        escrowId: transactionId,
        escrowPda: escrowResult.escrowPda,
        latencyMs: Date.now() - startTime,
        error: EigenAIError.attestationInvalid('Verification failed'),
      };
    }

    const latencyMs = Date.now() - startTime;

    const autoRelease = qualityThreshold <= 0;

    if (autoRelease) {
      this.log(`Auto-releasing escrow: ${transactionId}`);
      await this.escrow.release(transactionId, provider);
      this.activeEscrows.delete(transactionId);

      return {
        success: true,
        response: inferenceResponse.content,
        attestation: inferenceResponse.attestation,
        escrowId: transactionId,
        escrowPda: escrowResult.escrowPda,
        autoReleased: true,
        latencyMs,
      };
    }

    return {
      success: true,
      response: inferenceResponse.content,
      attestation: inferenceResponse.attestation,
      escrowId: transactionId,
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
    });
  }

  async releaseEscrow(escrowId: string): Promise<EscrowResult> {
    const escrowData = this.activeEscrows.get(escrowId);
    if (!escrowData) {
      return {
        success: false,
        error: EigenAIError.invalidInput('escrowId', 'No active escrow with this ID'),
      };
    }

    const result = await this.escrow.release(escrowId, escrowData.provider);
    if (result.success) {
      this.activeEscrows.delete(escrowId);
    }
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

    return this.escrow.dispute(escrowId);
  }

  getDisputeEvidence(escrowId: string): DisputeEvidence | null {
    const escrowData = this.activeEscrows.get(escrowId);
    if (!escrowData || !escrowData.attestation) {
      return null;
    }

    return {
      attestation: escrowData.attestation,
      prompt: escrowData.prompt,
      output: '',
    };
  }

  async getEscrowStatus(escrowId: string) {
    return this.escrow.getStatus(escrowId);
  }

  async getBalance(): Promise<number> {
    return this.escrow.getBalance();
  }

  getActiveEscrows(): string[] {
    return Array.from(this.activeEscrows.keys());
  }

  getQualityTier(score: number): { tier: string; refundPercent: number } {
    if (score >= QUALITY_TIERS.EXCELLENT.min) {
      return { tier: 'excellent', refundPercent: QUALITY_TIERS.EXCELLENT.refundPercent };
    }
    if (score >= QUALITY_TIERS.GOOD.min) {
      return { tier: 'good', refundPercent: QUALITY_TIERS.GOOD.refundPercent };
    }
    if (score >= QUALITY_TIERS.POOR.min) {
      return { tier: 'poor', refundPercent: QUALITY_TIERS.POOR.refundPercent };
    }
    return { tier: 'failed', refundPercent: QUALITY_TIERS.FAILED.refundPercent };
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[KamiyoEigenAI] ${message}`);
    }
  }
}

export function createKamiyoEigenAI(config: KamiyoEigenAIConfig): KamiyoEigenAI {
  return new KamiyoEigenAI(config);
}
