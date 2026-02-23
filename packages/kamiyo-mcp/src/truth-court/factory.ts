import { ClawDisputeOracle, type ClawDisputeOracleConfig } from './claw-oracle.js';
import { GrokDisputeOracle, type GrokDisputeOracleConfig } from './grok-oracle.js';
import { EvidenceIntegrityOracle, QualityBandOracle } from './local-oracles.js';
import type { TruthCourtOracle } from './types.js';

type PartialClawConfig = Partial<Omit<ClawDisputeOracleConfig, 'provider'>>;

export interface TruthCourtCommitteeOptions {
  includeGrok?: boolean;
  includeOpenClaw?: boolean;
  includeNanoClaw?: boolean;
  includeIronClaw?: boolean;
  grok?: Partial<GrokDisputeOracleConfig>;
  openclaw?: PartialClawConfig;
  nanoclaw?: PartialClawConfig;
  ironclaw?: PartialClawConfig;
}

export function buildTruthCourtCommittee(
  options: TruthCourtCommitteeOptions = {}
): TruthCourtOracle[] {
  const includeGrok = options.includeGrok !== false;
  const includeOpenClaw = options.includeOpenClaw !== false;
  const includeNanoClaw = options.includeNanoClaw !== false;
  const includeIronClaw = options.includeIronClaw !== false;

  const xaiApiKey = options.grok?.apiKey ?? process.env.XAI_API_KEY;
  const remoteOracles: TruthCourtOracle[] = [];

  if (includeGrok && xaiApiKey) {
    remoteOracles.push(
      new GrokDisputeOracle({
        apiKey: xaiApiKey,
        model: options.grok?.model ?? process.env.XAI_GROK_MODEL,
        baseUrl: options.grok?.baseUrl ?? process.env.XAI_BASE_URL,
        timeoutMs: options.grok?.timeoutMs,
        maxInputChars: options.grok?.maxInputChars,
        maxOutputChars: options.grok?.maxOutputChars,
        maxRetries: options.grok?.maxRetries,
        retryDelayMs: options.grok?.retryDelayMs,
        fetchImpl: options.grok?.fetchImpl,
      })
    );
  }

  const openclawApiKey = options.openclaw?.apiKey ?? process.env.OPENCLAW_API_KEY;
  const openclawBaseUrl = options.openclaw?.baseUrl ?? process.env.OPENCLAW_BASE_URL;
  if (includeOpenClaw && openclawApiKey && openclawBaseUrl) {
    remoteOracles.push(
      new ClawDisputeOracle({
        provider: 'openclaw',
        apiKey: openclawApiKey,
        baseUrl: openclawBaseUrl,
        model: options.openclaw?.model ?? process.env.OPENCLAW_MODEL,
        oracleName: options.openclaw?.oracleName,
        timeoutMs: options.openclaw?.timeoutMs,
        maxInputChars: options.openclaw?.maxInputChars,
        maxOutputChars: options.openclaw?.maxOutputChars,
        maxRetries: options.openclaw?.maxRetries,
        retryDelayMs: options.openclaw?.retryDelayMs,
        fetchImpl: options.openclaw?.fetchImpl,
      })
    );
  }

  const nanoclawApiKey = options.nanoclaw?.apiKey ?? process.env.NANOCLAW_API_KEY;
  const nanoclawBaseUrl = options.nanoclaw?.baseUrl ?? process.env.NANOCLAW_BASE_URL;
  if (includeNanoClaw && nanoclawApiKey && nanoclawBaseUrl) {
    remoteOracles.push(
      new ClawDisputeOracle({
        provider: 'nanoclaw',
        apiKey: nanoclawApiKey,
        baseUrl: nanoclawBaseUrl,
        model: options.nanoclaw?.model ?? process.env.NANOCLAW_MODEL,
        oracleName: options.nanoclaw?.oracleName,
        timeoutMs: options.nanoclaw?.timeoutMs,
        maxInputChars: options.nanoclaw?.maxInputChars,
        maxOutputChars: options.nanoclaw?.maxOutputChars,
        maxRetries: options.nanoclaw?.maxRetries,
        retryDelayMs: options.nanoclaw?.retryDelayMs,
        fetchImpl: options.nanoclaw?.fetchImpl,
      })
    );
  }

  const ironclawApiKey = options.ironclaw?.apiKey ?? process.env.IRONCLAW_API_KEY;
  const ironclawBaseUrl = options.ironclaw?.baseUrl ?? process.env.IRONCLAW_BASE_URL;
  if (includeIronClaw && ironclawApiKey && ironclawBaseUrl) {
    remoteOracles.push(
      new ClawDisputeOracle({
        provider: 'ironclaw',
        apiKey: ironclawApiKey,
        baseUrl: ironclawBaseUrl,
        model: options.ironclaw?.model ?? process.env.IRONCLAW_MODEL,
        oracleName: options.ironclaw?.oracleName,
        timeoutMs: options.ironclaw?.timeoutMs,
        maxInputChars: options.ironclaw?.maxInputChars,
        maxOutputChars: options.ironclaw?.maxOutputChars,
        maxRetries: options.ironclaw?.maxRetries,
        retryDelayMs: options.ironclaw?.retryDelayMs,
        fetchImpl: options.ironclaw?.fetchImpl,
      })
    );
  }

  return [...remoteOracles, new QualityBandOracle(), new EvidenceIntegrityOracle()];
}
