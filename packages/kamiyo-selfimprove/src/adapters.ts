export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface Counter {
  inc(labels?: Record<string, string | number>, value?: number): void;
}

export interface Histogram {
  observe(labels: Record<string, string | number>, value: number): void;
}

export interface MetricsAdapter {
  variantsCreated: Counter;
  variantEntries: Counter;
  variantPromotions: Counter;
  variantTournaments: Counter;
  banditDecisions: Counter;
  banditSweepPromotions: Counter;
  judgeCalls: Counter;
  judgeCostUsd: Counter;
  judgeLatency: Histogram;
}

export interface PreparedStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Transaction<T> {
  (): T;
}

export interface DatabaseAdapter {
  prepare(sql: string): PreparedStatement;
  transaction<T>(fn: () => T): Transaction<T>;
  exec(sql: string): void;
}

export type JudgeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type JudgeResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export interface JudgeLLM {
  generate(params: {
    model: string;
    system: string;
    messages: JudgeMessage[];
    maxTokens: number;
    temperature: number;
  }): Promise<JudgeResponse>;
}

export function createNoopLogger(): Logger {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop };
}

export function createNoopMetrics(): MetricsAdapter {
  const noopCounter: Counter = { inc: () => {} };
  const noopHistogram: Histogram = { observe: () => {} };
  return {
    variantsCreated: noopCounter,
    variantEntries: noopCounter,
    variantPromotions: noopCounter,
    variantTournaments: noopCounter,
    banditDecisions: noopCounter,
    banditSweepPromotions: noopCounter,
    judgeCalls: noopCounter,
    judgeCostUsd: noopCounter,
    judgeLatency: noopHistogram,
  };
}
