import type { LLMProvider } from './provider';
import type { SelfImproveConfig } from './improve';
import type { DB } from './db-types';
import { AgentError } from './errors';

export interface AgentConfig {
  id: string;
  name?: string;

  provider: LLMProvider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;

  maxTurns?: number;
  toolTimeoutMs?: number;

  onError?: 'throw' | 'return';

  db?: DB;
  selfImprove?: SelfImproveConfig;
}

export interface ResolvedConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  maxTurns: number;
  toolTimeoutMs: number;
  onError: 'throw' | 'return';
}

export function resolveConfig(config: AgentConfig): ResolvedConfig {
  if (!config.id || typeof config.id !== 'string') {
    throw new AgentError('AgentConfig.id must be a non-empty string', 'INVALID_CONFIG');
  }
  if (!config.provider || typeof config.provider.chat !== 'function') {
    throw new AgentError('AgentConfig.provider must implement LLMProvider', 'INVALID_CONFIG');
  }

  const temperature = config.temperature ?? 0.7;
  if (temperature < 0 || temperature > 2) {
    throw new AgentError(
      `temperature must be between 0 and 2, got ${temperature}`,
      'INVALID_CONFIG'
    );
  }

  const maxTokens = config.maxTokens ?? 4096;
  if (maxTokens < 1) {
    throw new AgentError(`maxTokens must be >= 1, got ${maxTokens}`, 'INVALID_CONFIG');
  }

  const maxTurns = config.maxTurns ?? 10;
  if (maxTurns < 1) {
    throw new AgentError(`maxTurns must be >= 1, got ${maxTurns}`, 'INVALID_CONFIG');
  }

  const toolTimeoutMs = config.toolTimeoutMs ?? 30_000;
  if (toolTimeoutMs < 100) {
    throw new AgentError(`toolTimeoutMs must be >= 100, got ${toolTimeoutMs}`, 'INVALID_CONFIG');
  }

  return {
    id: config.id,
    name: config.name ?? config.id,
    provider: config.provider,
    model: config.model ?? config.provider.defaultModel,
    systemPrompt: config.systemPrompt ?? '',
    temperature,
    maxTokens,
    maxTurns,
    toolTimeoutMs,
    onError: config.onError ?? 'throw',
  };
}
