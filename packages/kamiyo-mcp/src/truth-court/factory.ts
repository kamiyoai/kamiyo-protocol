import { GrokDisputeOracle, type GrokDisputeOracleConfig } from './grok-oracle.js';
import { EvidenceIntegrityOracle, QualityBandOracle } from './local-oracles.js';
import type { TruthCourtOracle } from './types.js';

export interface TruthCourtCommitteeOptions {
  includeGrok?: boolean;
  grok?: Partial<GrokDisputeOracleConfig>;
}

export function buildTruthCourtCommittee(
  options: TruthCourtCommitteeOptions = {}
): TruthCourtOracle[] {
  const includeGrok = options.includeGrok !== false;
  const apiKey = options.grok?.apiKey ?? process.env.XAI_API_KEY;

  const oracles: TruthCourtOracle[] = [
    new QualityBandOracle(),
    new EvidenceIntegrityOracle(),
  ];

  if (includeGrok && apiKey) {
    oracles.unshift(
      new GrokDisputeOracle({
        apiKey,
        model: options.grok?.model ?? process.env.XAI_GROK_MODEL,
        baseUrl: options.grok?.baseUrl ?? process.env.XAI_BASE_URL,
        timeoutMs: options.grok?.timeoutMs,
        fetchImpl: options.grok?.fetchImpl,
      })
    );
  }

  return oracles;
}
