import {
  type DatabaseAdapter,
  type JudgeLLM,
  type Logger,
  type MetricsAdapter,
  createNoopLogger,
  createNoopMetrics,
} from './adapters';

export interface SelfImproveContext {
  db: DatabaseAdapter;
  logger: Logger;
  metrics: MetricsAdapter;
  judgeLLM: JudgeLLM | null;
}

export interface InitOptions {
  db: DatabaseAdapter;
  logger?: Logger;
  metrics?: MetricsAdapter;
  judgeLLM?: JudgeLLM | null;
}

let current: SelfImproveContext | null = null;

export function initSelfImprove(opts: InitOptions): SelfImproveContext {
  current = {
    db: opts.db,
    logger: opts.logger ?? createNoopLogger(),
    metrics: opts.metrics ?? createNoopMetrics(),
    judgeLLM: opts.judgeLLM ?? null,
  };
  return current;
}

export function getContext(): SelfImproveContext {
  if (!current) {
    throw new Error(
      '@kamiyo-org/selfimprove: context not initialized. Call initSelfImprove({ db, ... }) before using the library.'
    );
  }
  return current;
}

export function resetContextForTests(): void {
  current = null;
}
