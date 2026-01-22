import type {
  QualityStakingManager,
  OracleProtocolManager,
  InferenceProvenanceTracker,
  DisputeResolutionManager,
  DKGClientInterface,
} from '@kamiyo/dkg-quality-oracle';
import type { IAgentRuntime } from './types';

export interface DKGQualityContext {
  stakingManager: QualityStakingManager;
  oracleManager: OracleProtocolManager;
  provenanceTracker: InferenceProvenanceTracker;
  disputeManager: DisputeResolutionManager;
  dkgClient: DKGClientInterface;
}

const CONTEXT_KEY = 'dkg_quality_context';

const contextCache = new Map<string, DKGQualityContext>();

export async function getDKGQualityContext(runtime: IAgentRuntime): Promise<DKGQualityContext> {
  // Use agent ID or a default key
  const contextId = runtime.agentId || 'default';

  // Check cache first
  const cached = contextCache.get(contextId);
  if (cached) {
    return cached;
  }

  // Check runtime state
  const savedContext = await runtime.getState?.(CONTEXT_KEY);
  if (savedContext && typeof savedContext === 'object') {
    // Restore from state (would need serialization/deserialization in production)
    // For now, create fresh context
  }

  // Create new context
  const {
    createQualityOracleSystem,
    createDKGClient,
  } = await import('@kamiyo/dkg-quality-oracle');

  const dkgClient = createDKGClient({
    endpoint: runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT,
  });

  const { stakingManager, oracleManager, provenanceTracker, disputeManager } =
    createQualityOracleSystem();

  const context: DKGQualityContext = {
    stakingManager,
    oracleManager,
    provenanceTracker,
    disputeManager,
    dkgClient,
  };

  // Cache it
  contextCache.set(contextId, context);

  return context;
}

export function clearDKGQualityContext(runtime: IAgentRuntime): void {
  const contextId = runtime.agentId || 'default';
  contextCache.delete(contextId);
}

export function clearAllDKGQualityContexts(): void {
  contextCache.clear();
}
