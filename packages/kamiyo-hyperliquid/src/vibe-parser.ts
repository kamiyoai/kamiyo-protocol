import Anthropic from '@anthropic-ai/sdk';
import { Strategy, Direction, SUPPORTED_ASSETS } from './vibe-types';

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

export class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyValidationError';
  }
}

export function validateStrategy(s: Strategy): void {
  if (!SUPPORTED_ASSETS.includes(s.asset)) {
    throw new StrategyValidationError(`Unsupported asset: ${s.asset}`);
  }
  if (s.direction !== 'long' && s.direction !== 'short') {
    throw new StrategyValidationError(`Invalid direction: ${s.direction}`);
  }
  if (s.leverage < 1 || s.leverage > 20) {
    throw new StrategyValidationError(`Leverage must be 1-20, got ${s.leverage}`);
  }
  if (s.sizeUsd < 10 || s.sizeUsd > 100_000) {
    throw new StrategyValidationError(`Size must be $10-$100,000`);
  }
  if (s.risk.stopLossPercent !== undefined && (s.risk.stopLossPercent >= 0 || s.risk.stopLossPercent < -1)) {
    throw new StrategyValidationError('Stop loss must be between -100% and 0%');
  }
  if (s.risk.takeProfitPercent !== undefined && s.risk.takeProfitPercent <= 0) {
    throw new StrategyValidationError('Take profit must be positive');
  }
}

export class ThesisParser {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  async parse(thesis: string): Promise<Strategy> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: thesis }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse AI response: ${text}`);
    }

    const strategy: Strategy = {
      id: crypto.randomUUID(),
      thesis,
      asset: parsed.asset,
      direction: parsed.direction as Direction,
      leverage: parsed.leverage || 1,
      sizeUsd: parsed.sizeUsd || 1000,
      trigger: parsed.trigger || {},
      risk: parsed.risk || {},
      expiresAt: parsed.expiresAt ?? undefined,
      status: 'pending',
      createdAt: Date.now(),
    };

    validateStrategy(strategy);
    return strategy;
  }
}
