/**
 * AI-powered thesis parser with retry logic and input validation.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  Strategy, Direction, SUPPORTED_ASSETS, ParseError,
  validateStrategy, ValidationError
} from './vibe-types';
import { withRetry, CircuitBreaker, Logger, nullLogger } from './vibe-utils';

const MAX_THESIS_LENGTH = 500;
const MIN_THESIS_LENGTH = 10;

const SYSTEM_PROMPT = `You are a trading thesis parser. Convert natural language trading ideas into structured JSON.

Output format:
{
  "asset": "ETH",
  "direction": "long",
  "leverage": 3,
  "sizeUsd": 1000,
  "trigger": {
    "price": {
      "asset": "BTC",
      "operator": ">",
      "price": 100000
    }
  },
  "risk": {
    "stopLossPercent": -0.05,
    "takeProfitPercent": 0.15
  }
}

Rules:
- If no trigger specified, use immediate execution (trigger: {})
- If no size specified, default to 1000 USD
- If no leverage specified, default to 1
- Percentages as decimals: 5% = 0.05, -5% = -0.05
- "stop at -5%" means stopLossPercent: -0.05
- "take profit at 15%" means takeProfitPercent: 0.15
- "if BTC breaks 100k" means price.operator: "crosses_above"
- "if BTC drops below 90k" means price.operator: "crosses_below"
- Supported operators: ">", "<", ">=", "<=", "crosses_above", "crosses_below"
- Supported assets: ${SUPPORTED_ASSETS.join(', ')}
- Max leverage: 20

Return ONLY valid JSON, no explanation.`;

export interface ThesisParserConfig {
  apiKey?: string;
  maxRetries?: number;
  timeoutMs?: number;
  logger?: Logger;
}

export class ThesisParser {
  private client: Anthropic;
  private circuit: CircuitBreaker;
  private logger: Logger;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(config: ThesisParserConfig = {}) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.logger = config.logger || nullLogger;
    this.maxRetries = config.maxRetries || 3;
    this.timeoutMs = config.timeoutMs || 30000;
    this.circuit = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
    }, this.logger);
  }

  async parse(thesis: string): Promise<Strategy> {
    this.validateInput(thesis);

    const sanitized = this.sanitize(thesis);
    this.logger.info('Parsing thesis', { length: sanitized.length });

    const parsed = await this.circuit.execute(
      () => this.callAI(sanitized),
      'thesis_parse'
    );

    const strategy = this.buildStrategy(sanitized, parsed);
    validateStrategy(strategy);

    this.logger.info('Strategy parsed successfully', {
      id: strategy.id,
      asset: strategy.asset,
      direction: strategy.direction,
    });

    return strategy;
  }

  private validateInput(thesis: string): void {
    if (!thesis || typeof thesis !== 'string') {
      throw new ValidationError('Thesis must be a non-empty string');
    }
    if (thesis.length < MIN_THESIS_LENGTH) {
      throw new ValidationError(`Thesis too short (min ${MIN_THESIS_LENGTH} chars)`);
    }
    if (thesis.length > MAX_THESIS_LENGTH) {
      throw new ValidationError(`Thesis too long (max ${MAX_THESIS_LENGTH} chars)`);
    }
  }

  private sanitize(thesis: string): string {
    return thesis
      .trim()
      .replace(/[\x00-\x1F\x7F]/g, '')
      .substring(0, MAX_THESIS_LENGTH);
  }

  private async callAI(thesis: string): Promise<ParsedThesis> {
    return withRetry(
      async () => {
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: thesis }],
        });

        const text = response.content[0].type === 'text'
          ? response.content[0].text
          : '';

        if (!text) {
          throw new ParseError('Empty response from AI');
        }

        try {
          return JSON.parse(text) as ParsedThesis;
        } catch {
          throw new ParseError('Invalid JSON from AI', { response: text.substring(0, 200) });
        }
      },
      'ai_parse',
      {
        maxAttempts: this.maxRetries,
        timeoutMs: this.timeoutMs,
        retryOn: (err) => {
          if (err instanceof ValidationError) return false;
          if (err.message.includes('rate_limit')) return true;
          if (err.message.includes('overloaded')) return true;
          return true;
        },
      },
      this.logger
    );
  }

  private buildStrategy(thesis: string, parsed: ParsedThesis): Strategy {
    if (!parsed.asset) {
      throw new ParseError('AI did not provide asset');
    }
    if (!parsed.direction) {
      throw new ParseError('AI did not provide direction');
    }

    return {
      id: crypto.randomUUID(),
      thesis,
      asset: parsed.asset.toUpperCase(),
      direction: parsed.direction.toLowerCase() as Direction,
      leverage: Math.max(1, Math.min(20, parsed.leverage || 1)),
      sizeUsd: Math.max(10, Math.min(100000, parsed.sizeUsd || 1000)),
      trigger: parsed.trigger || {},
      risk: {
        stopLossPercent: parsed.risk?.stopLossPercent,
        takeProfitPercent: parsed.risk?.takeProfitPercent,
        trailingStopPercent: parsed.risk?.trailingStopPercent,
      },
      expiresAt: parsed.expiresAt ?? undefined,
      status: 'pending',
      createdAt: Date.now(),
    };
  }

  getCircuitState(): string {
    return this.circuit.getState();
  }
}

interface ParsedThesis {
  asset: string;
  direction: string;
  leverage?: number;
  sizeUsd?: number;
  trigger?: Strategy['trigger'];
  risk?: Strategy['risk'];
  expiresAt?: number | null;
}
