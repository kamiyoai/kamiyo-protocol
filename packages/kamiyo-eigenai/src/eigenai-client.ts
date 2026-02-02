import { Keypair } from '@solana/web3.js';
import { privateKeyToAccount, signMessage } from 'viem/accounts';
import { toHex } from 'viem';
import {
  ChatMessage,
  EigenAIAttestation,
  EigenAIError,
  EigenAIModel,
  EIGENAI_DEFAULTS,
} from './types.js';

interface EigenAIRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  seed?: number;
  grantMessage: string;
  grantSignature: string;
  walletAddress: string;
}

interface EigenAIChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

interface EigenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: EigenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  attestation?: {
    model_hash: string;
    input_hash: string;
    output_hash: string;
    signature: string;
    tee_quote?: string;
  };
}

interface GrantMessageResponse {
  message: string;
}

export interface InferenceOptions {
  model: EigenAIModel;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  seed?: number;
}

export interface InferenceResponse {
  content: string;
  attestation: EigenAIAttestation;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class EigenAIClient {
  private readonly wallet: Keypair;
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;
  private cachedGrant: { message: string; signature: string; expiresAt: number } | null = null;

  constructor(wallet: Keypair, baseUrl?: string, defaultTimeout?: number) {
    if (!wallet) {
      throw EigenAIError.invalidInput('wallet', 'Wallet keypair is required');
    }
    const url = baseUrl || EIGENAI_DEFAULTS.BASE_URL;
    if (!url.startsWith('https://')) {
      throw EigenAIError.invalidInput('baseUrl', 'Must use HTTPS');
    }
    this.wallet = wallet;
    this.baseUrl = url;
    this.defaultTimeout = defaultTimeout || EIGENAI_DEFAULTS.TIMEOUT_MS;
  }

  async inference(options: InferenceOptions): Promise<InferenceResponse> {
    const {
      model,
      messages,
      temperature = EIGENAI_DEFAULTS.TEMPERATURE,
      maxTokens = EIGENAI_DEFAULTS.MAX_TOKENS,
      timeoutMs = this.defaultTimeout,
      seed,
    } = options;

    if (model !== EIGENAI_DEFAULTS.MODEL) {
      throw EigenAIError.invalidInput('model', `Unsupported model: ${model}`);
    }
    if (!messages.length) {
      throw EigenAIError.invalidInput('messages', 'At least one message is required');
    }

    const { grantMessage, grantSignature } = await this.getGrant(timeoutMs);
    const walletAddress = this.getEthAddress();

    const body: EigenAIRequestBody = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      grantMessage,
      grantSignature,
      walletAddress,
    };

    if (seed !== undefined) {
      body.seed = seed;
    }

    const response = await this.request<EigenAIResponse>(
      '/api/chat/completions',
      body,
      timeoutMs
    );

    if (!response.choices?.length) {
      throw EigenAIError.apiError('No response choices returned');
    }

    const choice = response.choices[0];
    if (!choice.message?.content) {
      throw EigenAIError.apiError('Empty response content');
    }

    const attestation = this.parseAttestation(response, model);

    return {
      content: choice.message.content,
      attestation,
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  // Structural validation only. Cryptographic verification happens on-chain via EigenLayer AVS.
  async verifyAttestation(attestation: EigenAIAttestation): Promise<boolean> {
    if (!attestation.signature || !attestation.modelHash || !attestation.outputHash) {
      return false;
    }

    const isStructurallyValid =
      attestation.signature.length >= 64 &&
      attestation.modelHash.startsWith('0x') &&
      attestation.outputHash.startsWith('0x') &&
      attestation.timestamp > 0;

    return isStructurallyValid;
  }

  private async getGrant(timeoutMs: number): Promise<{ grantMessage: string; grantSignature: string }> {
    if (this.cachedGrant && Date.now() < this.cachedGrant.expiresAt) {
      return { grantMessage: this.cachedGrant.message, grantSignature: this.cachedGrant.signature };
    }

    const messageResponse = await this.request<GrantMessageResponse>(
      '/message',
      null,
      timeoutMs,
      'GET'
    );

    if (!messageResponse.message) {
      throw EigenAIError.authFailed('Failed to get grant message');
    }

    const signature = await this.signEthMessage(messageResponse.message);

    this.cachedGrant = {
      message: messageResponse.message,
      signature,
      expiresAt: Date.now() + 45 * 60 * 1000,
    };

    return { grantMessage: messageResponse.message, grantSignature: signature };
  }

  // EigenAI uses Ethereum-style signatures; derive from Solana keypair's first 32 bytes
  private getEthAddress(): string {
    const privateKeyBytes = this.wallet.secretKey.slice(0, 32);
    const account = privateKeyToAccount(toHex(privateKeyBytes));
    return account.address;
  }

  private async signEthMessage(message: string): Promise<string> {
    const privateKeyBytes = this.wallet.secretKey.slice(0, 32);
    const account = privateKeyToAccount(toHex(privateKeyBytes));
    const signature = await signMessage({
      message,
      privateKey: account.source as `0x${string}`,
    });
    return signature;
  }

  private parseAttestation(
    response: EigenAIResponse,
    model: string
  ): EigenAIAttestation {
    if (response.attestation) {
      return {
        model,
        modelHash: response.attestation.model_hash,
        inputHash: response.attestation.input_hash,
        outputHash: response.attestation.output_hash,
        timestamp: response.created,
        signature: response.attestation.signature,
        teeQuote: response.attestation.tee_quote,
      };
    }

    return {
      model,
      modelHash: `0x${Buffer.from(model).toString('hex')}`,
      inputHash: '0x0',
      outputHash: '0x0',
      timestamp: response.created,
      signature: response.id,
    };
  }

  private async request<T>(
    endpoint: string,
    body: unknown,
    timeoutMs: number,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        };

        if (body && method === 'POST') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (response.status === 429 || response.status === 503) {
          if (attempt < maxRetries) {
            clearTimeout(timeout);
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw EigenAIError.apiError(`Service unavailable after ${attempt + 1} attempts`);
        }

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw EigenAIError.apiError(
            `EigenAI API error ${response.status}: ${errorBody || response.statusText}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof EigenAIError) {
          throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw EigenAIError.timeout('EigenAI inference', timeoutMs);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw EigenAIError.networkError(lastError?.message || 'Unknown error', lastError);
  }
}
