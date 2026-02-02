import { privateKeyToAccount } from 'viem/accounts';
import { toHex } from 'viem';
import {
  ChatMessage,
  EigenAIAttestation,
  EigenAIError,
  EigenAIModel,
  EigenAIAuthConfig,
  EIGENAI_DEFAULTS,
} from './types.js';

interface EigenAIRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  seed?: number;
}

interface GrantRequestBody extends EigenAIRequestBody {
  grantMessage: string;
  grantSignature: string;
  walletAddress: string;
}

interface EigenAIChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

interface EigenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: EigenAIChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  signature?: string;
}

interface GrantMessageResponse { success: boolean; message: string; address: string }
interface GrantStatusResponse { success: boolean; tokenCount: number; address: string; hasGrant: boolean }

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
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export class EigenAIClient {
  private readonly auth: EigenAIAuthConfig;
  private readonly baseUrl: string;
  private readonly grantApiUrl: string;
  private readonly defaultTimeout: number;
  private cachedGrant?: { message: string; signature: string; expiresAt: number };

  constructor(auth: EigenAIAuthConfig, baseUrl?: string, defaultTimeout?: number) {
    if (auth.type === 'apiKey' && !auth.apiKey)
      throw EigenAIError.invalidInput('apiKey', 'Required');
    if (auth.type === 'grant') {
      if (!auth.privateKey || auth.privateKey.length !== 32)
        throw EigenAIError.invalidInput('privateKey', 'Must be 32 bytes');
      if (!auth.walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(auth.walletAddress))
        throw EigenAIError.invalidInput('walletAddress', 'Invalid ETH address');
    }

    const url = baseUrl || EIGENAI_DEFAULTS.BASE_URL;
    if (!url.startsWith('https://'))
      throw EigenAIError.invalidInput('baseUrl', 'Must use HTTPS');

    this.auth = auth;
    this.baseUrl = url;
    this.grantApiUrl = EIGENAI_DEFAULTS.GRANT_API_URL;
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

    if (!messages.length)
      throw EigenAIError.invalidInput('messages', 'At least one required');

    const body: EigenAIRequestBody = { model, messages, temperature, max_tokens: maxTokens };
    if (seed !== undefined) body.seed = seed;

    const response = this.auth.type === 'grant'
      ? await this.requestWithGrant<EigenAIResponse>(body, timeoutMs)
      : await this.requestWithApiKey<EigenAIResponse>('/v1/chat/completions', body, timeoutMs);

    if (!response.choices?.length)
      throw EigenAIError.apiError('No response choices');
    const choice = response.choices[0];
    if (!choice.message?.content)
      throw EigenAIError.apiError('Empty response');

    return {
      content: choice.message.content,
      attestation: this.parseAttestation(response, model),
      model: response.model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  async checkGrantStatus(): Promise<{ hasGrant: boolean; tokenCount: number }> {
    if (this.auth.type !== 'grant') {
      throw EigenAIError.invalidInput('auth', 'Grant auth required to check grant status');
    }

    const address = encodeURIComponent(this.auth.walletAddress);
    let response: Response;
    try {
      response = await fetch(`${this.grantApiUrl}/checkGrant?address=${address}`);
    } catch (err) {
      throw EigenAIError.networkError(
        'Failed to reach grant API',
        err instanceof Error ? err : undefined
      );
    }

    if (!response.ok) {
      throw EigenAIError.apiError(`Failed to check grant: ${response.status}`);
    }

    const data = (await response.json()) as GrantStatusResponse;
    return { hasGrant: data.hasGrant, tokenCount: data.tokenCount };
  }

  async verifyAttestation(attestation: EigenAIAttestation): Promise<boolean> {
    return !!attestation.signature && attestation.signature.length >= 64 && attestation.timestamp > 0;
  }

  private async getGrantCredentials(): Promise<{ message: string; signature: string }> {
    if (this.auth.type !== 'grant') throw EigenAIError.invalidInput('auth', 'Grant auth required');
    if (this.cachedGrant && this.cachedGrant.expiresAt > Date.now()) return { message: this.cachedGrant.message, signature: this.cachedGrant.signature };

    const address = encodeURIComponent(this.auth.walletAddress);
    let msgResponse: Response;
    try {
      msgResponse = await fetch(`${this.grantApiUrl}/message?address=${address}`);
    } catch (err) {
      throw EigenAIError.networkError(
        'Failed to reach grant API',
        err instanceof Error ? err : undefined
      );
    }

    if (!msgResponse.ok) throw EigenAIError.authFailed(`Failed to get grant message: ${msgResponse.status}`);
    const msgData = (await msgResponse.json()) as GrantMessageResponse;
    if (!msgData.success || !msgData.message) throw EigenAIError.authFailed('No grant message returned');

    const privateKeyHex = toHex(this.auth.privateKey);
    const account = privateKeyToAccount(privateKeyHex);
    const signature = await account.signMessage({ message: msgData.message });

    this.cachedGrant = { message: msgData.message, signature, expiresAt: Date.now() + 4 * 60 * 1000 };
    return { message: msgData.message, signature };
  }

  private async requestWithGrant<T>(body: EigenAIRequestBody, timeoutMs: number): Promise<T> {
    if (this.auth.type !== 'grant') throw EigenAIError.invalidInput('auth', 'Grant auth required');
    const { message, signature } = await this.getGrantCredentials();
    const grantBody: GrantRequestBody = { ...body, grantMessage: message, grantSignature: signature, walletAddress: this.auth.walletAddress };
    return this.request<T>(`${this.grantApiUrl}/api/chat/completions`, grantBody, timeoutMs, {});
  }

  private async requestWithApiKey<T>(endpoint: string, body: EigenAIRequestBody, timeoutMs: number): Promise<T> {
    if (this.auth.type !== 'apiKey') throw EigenAIError.invalidInput('auth', 'API key auth required');
    return this.request<T>(`${this.baseUrl}${endpoint}`, body, timeoutMs, { 'X-API-Key': this.auth.apiKey });
  }

  private parseAttestation(response: EigenAIResponse, model: string): EigenAIAttestation {
    return { model, modelHash: `0x${Buffer.from(model).toString('hex')}`, inputHash: '0x0', outputHash: '0x0', timestamp: response.created, signature: response.signature || response.id };
  }

  private async request<T>(
    url: string,
    body: unknown,
    timeoutMs: number,
    extraHeaders: Record<string, string>
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...extraHeaders,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.status === 429 || response.status === 503) {
          if (attempt < maxRetries) {
            clearTimeout(timeout);
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw EigenAIError.apiError(`Service unavailable after ${attempt + 1} attempts`);
        }

        if (response.status === 401) {
          throw EigenAIError.authFailed('Invalid credentials');
        }

        if (response.status === 402) {
          throw EigenAIError.insufficientFunds(0, 0);
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
