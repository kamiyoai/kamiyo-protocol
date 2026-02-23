import { sha256Hex } from './hash.js';
import type {
  TruthCourtFactor,
  TruthCourtOracle,
  TruthCourtOracleRequest,
  TruthCourtOracleResponse,
  TruthCourtVerdict,
} from './types.js';

interface CompletionChoice {
  message?: {
    content?: unknown;
  };
}

interface CompletionResponse {
  id?: string;
  model?: string;
  choices?: CompletionChoice[];
}

export type ClawProvider = 'openclaw' | 'nanoclaw' | 'ironclaw';

export interface ClawDisputeOracleConfig {
  provider: ClawProvider;
  apiKey: string;
  model?: string;
  baseUrl: string;
  oracleName?: string;
  timeoutMs?: number;
  maxInputChars?: number;
  maxOutputChars?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT =
  'You are a deterministic dispute oracle for a trust protocol. Output strict JSON only.';

const REQUIRED_VERDICTS: TruthCourtVerdict[] = [
  'client_wins',
  'provider_wins',
  'split',
  'insufficient_evidence',
];

const DEFAULT_MODELS: Record<ClawProvider, string> = {
  openclaw: 'openclaw:main',
  nanoclaw: 'nanoclaw:main',
  ironclaw: 'ironclaw:main',
};

const PROVIDER_LABEL: Record<ClawProvider, string> = {
  openclaw: 'OpenClaw',
  nanoclaw: 'NanoClaw',
  ironclaw: 'IronClaw',
};

function toVerdict(value: unknown): TruthCourtVerdict {
  if (typeof value !== 'string') {
    throw new Error('verdict must be a string');
  }

  if (!REQUIRED_VERDICTS.includes(value as TruthCourtVerdict)) {
    throw new Error(`invalid verdict: ${value}`);
  }

  return value as TruthCourtVerdict;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function normalizeFactors(value: unknown): TruthCourtFactor[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('factors must be a non-empty array');
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`factors[${index}] must be an object`);
    }

    const raw = entry as Record<string, unknown>;
    const name = raw.name;
    const impact = raw.impact;
    const evidence = raw.evidence;

    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`factors[${index}].name is required`);
    }
    if (typeof evidence !== 'string' || !evidence.trim()) {
      throw new Error(`factors[${index}].evidence is required`);
    }

    return {
      name: name.trim(),
      impact: asNumber(impact, `factors[${index}].impact`),
      evidence: evidence.trim(),
    };
  });
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks = content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          const candidate = (item as Record<string, unknown>).text;
          if (typeof candidate === 'string') {
            return candidate;
          }
        }
        return '';
      })
      .filter(Boolean);
    return chunks.join('\n');
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return '';
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('empty oracle response');
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('oracle response did not contain JSON');
    }
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function normalizeConfidence(value: unknown): number {
  const confidence = asNumber(value, 'confidence');
  if (confidence < 0 || confidence > 1) {
    throw new Error('confidence must be in [0, 1]');
  }
  return confidence;
}

function buildPrompt(request: TruthCourtOracleRequest): string {
  return JSON.stringify(
    {
      task: 'evaluate_dispute',
      policy: {
        output_format: 'json',
        allowed_verdicts: REQUIRED_VERDICTS,
      },
      case: {
        transactionId: request.input.transactionId,
        missionTag: request.input.missionTag ?? null,
        qualityScore: request.input.qualityScore,
        requestedRefundPercentage: request.input.requestedRefundPercentage,
        claimant: request.input.claimant,
        respondent: request.input.respondent ?? null,
        context: request.input.context ?? null,
        evidence: request.input.evidence,
        featureVector: request.input.featureVector,
      },
      integrity: {
        caseHash: request.caseHash,
        evidenceHash: request.evidenceHash,
        featureHash: request.featureHash,
      },
      requiredFields: ['verdict', 'confidence', 'factors', 'reasoningRef'],
    },
    null,
    2
  );
}

export class ClawDisputeOracle implements TruthCourtOracle {
  readonly name: string;

  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxInputChars: number;
  private readonly maxOutputChars: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly providerLabel: string;

  constructor(private readonly config: ClawDisputeOracleConfig) {
    if (!config.apiKey) {
      throw new Error(`${PROVIDER_LABEL[config.provider]} API key is required`);
    }
    if (!config.baseUrl) {
      throw new Error(`${PROVIDER_LABEL[config.provider]} base URL is required`);
    }

    this.name = config.oracleName ?? `${config.provider}-dispute-oracle`;
    this.providerLabel = PROVIDER_LABEL[config.provider];
    this.model = config.model ?? DEFAULT_MODELS[config.provider];
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.maxInputChars = config.maxInputChars ?? 20000;
    this.maxOutputChars = config.maxOutputChars ?? 30000;
    this.maxRetries = config.maxRetries ?? 1;
    this.retryDelayMs = config.retryDelayMs ?? 400;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private createNonRetriableError(message: string): Error & { nonRetriable: true } {
    const error = new Error(message) as Error & { nonRetriable: true };
    error.nonRetriable = true;
    return error;
  }

  private async requestCompletion(prompt: string, signal: AbortSignal): Promise<Response> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
          signal,
        });

        if (response.ok) {
          return response;
        }

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(
            `${this.providerLabel} transient failure: ${response.status} ${response.statusText}`
          );
          if (attempt <= this.maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
            continue;
          }
        }

        throw this.createNonRetriableError(
          `${this.providerLabel} request failed: ${response.status} ${response.statusText}`
        );
      } catch (error: any) {
        lastError = error;
        if (signal.aborted || attempt > this.maxRetries || error?.nonRetriable) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${this.providerLabel} request failed`);
  }

  async evaluate(request: TruthCourtOracleRequest): Promise<TruthCourtOracleResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const prompt = buildPrompt(request);
      if (prompt.length > this.maxInputChars) {
        throw new Error(`prompt exceeds maxInputChars (${this.maxInputChars})`);
      }

      const response = await this.requestCompletion(prompt, controller.signal);
      const payload = (await response.json()) as CompletionResponse;
      if (!payload.choices?.length) {
        throw new Error(`${this.providerLabel} response did not include choices`);
      }

      const rawContent = extractTextContent(payload.choices?.[0]?.message?.content);
      if (!rawContent) {
        throw new Error(`${this.providerLabel} response content was empty`);
      }
      if (rawContent.length > this.maxOutputChars) {
        throw new Error(`response exceeds maxOutputChars (${this.maxOutputChars})`);
      }

      const parsed = parseJsonFromText(rawContent);
      const verdict = toVerdict(parsed.verdict);
      const confidence = normalizeConfidence(parsed.confidence);
      const factors = normalizeFactors(parsed.factors);

      const reasoningRef =
        typeof parsed.reasoningRef === 'string' && parsed.reasoningRef.trim()
          ? parsed.reasoningRef.trim()
          : `${this.config.provider}://${sha256Hex(rawContent).slice(0, 24)}`;

      const model = payload.model ?? this.model;
      const modelHash = sha256Hex(`${model}:${payload.id ?? ''}`);

      return {
        oracle: this.name,
        provider: this.config.provider,
        model,
        modelHash,
        verdict,
        confidence,
        factors,
        evidenceHash: request.evidenceHash,
        featureHash: request.featureHash,
        reasoningRef,
        generatedAt: Date.now(),
        rawOutput: rawContent,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`${this.providerLabel} request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
