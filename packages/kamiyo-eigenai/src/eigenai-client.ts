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
  return_attestation?: boolean;
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

export interface InferenceOptions {
  model: EigenAIModel;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
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
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;

  constructor(apiKey: string, baseUrl?: string, defaultTimeout?: number) {
    if (!apiKey) {
      throw EigenAIError.invalidInput('apiKey', 'API key is required');
    }
    const url = baseUrl || EIGENAI_DEFAULTS.BASE_URL;
    if (!url.startsWith('https://')) {
      throw EigenAIError.invalidInput('baseUrl', 'Must use HTTPS');
    }
    this.apiKey = apiKey;
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
    } = options;

    if (!messages.length) {
      throw EigenAIError.invalidInput('messages', 'At least one message is required');
    }

    const body: EigenAIRequestBody = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      return_attestation: true,
    };

    const response = await this.request<EigenAIResponse>(
      '/chat/completions',
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

    if (!response.attestation) {
      throw EigenAIError.attestationInvalid('No attestation in response');
    }

    const attestation = this.parseAttestation(response.attestation, model, response.created);

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

  private parseAttestation(
    raw: NonNullable<EigenAIResponse['attestation']>,
    model: string,
    timestamp: number
  ): EigenAIAttestation {
    return {
      model,
      modelHash: raw.model_hash,
      inputHash: raw.input_hash,
      outputHash: raw.output_hash,
      timestamp,
      signature: raw.signature,
      teeQuote: raw.tee_quote,
    };
  }

  private async request<T>(
    endpoint: string,
    body: unknown,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw EigenAIError.apiError(
          `EigenAI API error ${response.status}: ${errorBody || response.statusText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof EigenAIError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw EigenAIError.timeout('EigenAI inference', timeoutMs);
      }
      throw EigenAIError.networkError(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
