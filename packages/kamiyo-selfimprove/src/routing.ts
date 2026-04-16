import { isBanditRoutingEnabled, routeVariant, type RouteDecision } from './bandit';
import { recordJudgedEntry } from './judge';

export { type RouteDecision };

export type VariantDecisionMeta = {
  variantId: string;
  tournamentId: string;
  decisionId: string;
  strategy: RouteDecision['strategy'];
};

export function maybeRouteVariant(taskType: string): RouteDecision | null {
  if (!isBanditRoutingEnabled()) return null;
  try {
    return routeVariant(taskType);
  } catch {
    return null;
  }
}

export function toVariantDecisionMeta(decision: RouteDecision): VariantDecisionMeta {
  return {
    variantId: decision.variant.id,
    tournamentId: decision.tournamentId,
    decisionId: decision.decisionId,
    strategy: decision.strategy,
  };
}

export type GenomeOverrides = {
  model: string;
  system: string;
  temperature?: number;
  maxTokens?: number;
};

export function applyGenomeOverrides(
  decision: RouteDecision | null,
  defaults: GenomeOverrides
): GenomeOverrides {
  if (!decision) return defaults;
  const g = decision.variant.genome;
  return {
    model: g.modelId || defaults.model,
    system: g.promptTemplate?.trim() ? g.promptTemplate : defaults.system,
    temperature: typeof g.temperature === 'number' ? g.temperature : defaults.temperature,
    maxTokens: typeof g.maxTokens === 'number' ? g.maxTokens : defaults.maxTokens,
  };
}

export function recordVariantEntry(
  decision: RouteDecision | null,
  params: { input: string; output: string; latencyMs: number; costUsd?: number }
): void {
  if (!decision) return;
  void recordJudgedEntry({
    tournamentId: decision.tournamentId,
    variantId: decision.variant.id,
    input: params.input.slice(0, 16000),
    output: params.output.slice(0, 16000),
    latencyMs: params.latencyMs,
    costOverride: typeof params.costUsd === 'number' ? params.costUsd : null,
  }).catch(() => {});
}
