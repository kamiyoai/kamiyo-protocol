import { ethers } from 'ethers';
import {
  GlobalAgentId,
  RegisteredAgent,
  MirroredIdentity,
  KamiyoTier,
  CHAIN_CONFIGS,
} from '../types';
import { parseGlobalId, isValidGlobalId } from '../identity/GlobalId';
import { IdentityRegistry } from '../identity/IdentityRegistry';
import { HyperliquidAdapter, HyperliquidAgentProfile } from '../adapters/HyperliquidAdapter';
import { MonadAdapter } from '../adapters/MonadAdapter';

/**
 * Chain type identifiers
 */
export type ChainType = 'base' | 'hyperliquid' | 'monad';

/**
 * Resolved agent identity across chains
 */
export interface ResolvedIdentity {
  globalId: string;
  parsed: GlobalAgentId;
  canonical?: RegisteredAgent;
  hyperliquid?: HyperliquidAgentProfile;
  monad?: MirroredIdentity;
  tier?: KamiyoTier;
  resolvedAt: number;
}

/**
 * Chain configuration for resolver
 */
export interface ChainConfig {
  provider: ethers.Provider;
  contractAddress: string;
}

/**
 * Resolver configuration
 */
export interface ResolverConfig {
  base?: ChainConfig;
  hyperliquid?: ChainConfig;
  monad?: ChainConfig;
}

/**
 * Cross-chain identity resolver for ERC-8004 agents
 */
export class CrossChainResolver {
  private baseRegistry?: IdentityRegistry;
  private hyperliquidAdapter?: HyperliquidAdapter;
  private monadAdapter?: MonadAdapter;

  constructor(config: ResolverConfig) {
    if (config.base) {
      this.baseRegistry = new IdentityRegistry(
        config.base.contractAddress,
        config.base.provider,
        CHAIN_CONFIGS['base-mainnet'].chainId
      );
    }

    if (config.hyperliquid) {
      this.hyperliquidAdapter = new HyperliquidAdapter(
        config.hyperliquid.contractAddress,
        config.hyperliquid.provider
      );
    }

    if (config.monad) {
      this.monadAdapter = new MonadAdapter(
        config.monad.contractAddress,
        config.monad.provider
      );
    }
  }

  /**
   * Resolve a global ID to identity across all configured chains
   */
  async resolve(globalId: string): Promise<ResolvedIdentity | null> {
    if (!isValidGlobalId(globalId)) {
      return null;
    }

    const parsed = parseGlobalId(globalId);
    const result: ResolvedIdentity = {
      globalId,
      parsed,
      resolvedAt: Date.now(),
    };

    const promises: Promise<void>[] = [];

    if (this.baseRegistry) {
      promises.push(
        this.resolveBase(parsed, result).catch(() => {})
      );
    }

    if (this.hyperliquidAdapter) {
      promises.push(
        this.resolveHyperliquid(globalId, result).catch(() => {})
      );
    }

    if (this.monadAdapter) {
      promises.push(
        this.resolveMonad(globalId, result).catch(() => {})
      );
    }

    await Promise.all(promises);

    if (!result.canonical && !result.hyperliquid && !result.monad) {
      return null;
    }

    result.tier = this.determineTier(result);

    return result;
  }

  /**
   * Resolve by agent address on a specific chain
   */
  async resolveByAddress(
    address: string,
    chain: ChainType
  ): Promise<ResolvedIdentity | null> {
    let globalId: string | null = null;

    switch (chain) {
      case 'base':
        if (!this.baseRegistry) return null;
        break;

      case 'hyperliquid':
        if (!this.hyperliquidAdapter) return null;
        const isLinked = await this.hyperliquidAdapter.isLinked(address);
        if (isLinked) {
          globalId = await this.hyperliquidAdapter.getAgentGlobalId(address);
        }
        break;

      case 'monad':
        if (!this.monadAdapter) return null;
        const identity = await this.monadAdapter.getIdentityByWallet(address);
        if (identity) {
          globalId = identity.globalId;
        }
        break;
    }

    if (!globalId) {
      return null;
    }

    return this.resolve(globalId);
  }

  /**
   * Check if identity exists on a specific chain
   */
  async existsOnChain(globalId: string, chain: ChainType): Promise<boolean> {
    if (!isValidGlobalId(globalId)) {
      return false;
    }

    const parsed = parseGlobalId(globalId);

    switch (chain) {
      case 'base':
        if (!this.baseRegistry) return false;
        if (parsed.chainId !== CHAIN_CONFIGS['base-mainnet'].chainId) return false;
        return this.baseRegistry.exists(parsed.agentId);

      case 'hyperliquid':
        if (!this.hyperliquidAdapter) return false;
        const agent = await this.hyperliquidAdapter.getAgentByGlobalId(globalId);
        return agent !== ethers.ZeroAddress;

      case 'monad':
        if (!this.monadAdapter) return false;
        const identity = await this.monadAdapter.getIdentityByGlobalId(globalId);
        return identity !== null;

      default:
        return false;
    }
  }

  /**
   * Get all chains where an identity exists
   */
  async getPresence(globalId: string): Promise<ChainType[]> {
    const presence: ChainType[] = [];

    const checks = await Promise.all([
      this.existsOnChain(globalId, 'base').catch(() => false),
      this.existsOnChain(globalId, 'hyperliquid').catch(() => false),
      this.existsOnChain(globalId, 'monad').catch(() => false),
    ]);

    if (checks[0]) presence.push('base');
    if (checks[1]) presence.push('hyperliquid');
    if (checks[2]) presence.push('monad');

    return presence;
  }

  /**
   * Get agent wallet address for a global ID on any chain
   */
  async getWallet(globalId: string): Promise<string | null> {
    const resolved = await this.resolve(globalId);
    if (!resolved) return null;

    if (resolved.canonical) {
      return resolved.canonical.wallet;
    }

    if (resolved.hyperliquid) {
      const agent = await this.hyperliquidAdapter!.getAgentByGlobalId(globalId);
      return agent !== ethers.ZeroAddress ? agent : null;
    }

    if (resolved.monad) {
      return resolved.monad.wallet;
    }

    return null;
  }

  /**
   * Get tier for a global ID from any available source
   */
  async getTier(globalId: string): Promise<KamiyoTier | null> {
    const resolved = await this.resolve(globalId);
    return resolved?.tier ?? null;
  }

  private async resolveBase(
    parsed: GlobalAgentId,
    result: ResolvedIdentity
  ): Promise<void> {
    if (!this.baseRegistry) return;

    if (parsed.chainId !== CHAIN_CONFIGS['base-mainnet'].chainId) {
      return;
    }

    const exists = await this.baseRegistry.exists(parsed.agentId);
    if (!exists) return;

    result.canonical = await this.baseRegistry.getAgent(parsed.agentId);
  }

  private async resolveHyperliquid(
    globalId: string,
    result: ResolvedIdentity
  ): Promise<void> {
    if (!this.hyperliquidAdapter) return;

    const profile = await this.hyperliquidAdapter.resolveGlobalId(globalId);
    if (profile) {
      result.hyperliquid = profile;
    }
  }

  private async resolveMonad(
    globalId: string,
    result: ResolvedIdentity
  ): Promise<void> {
    if (!this.monadAdapter) return;

    const identity = await this.monadAdapter.resolveGlobalId(globalId);
    if (identity) {
      result.monad = identity;
    }
  }

  private determineTier(result: ResolvedIdentity): KamiyoTier | undefined {
    if (result.monad?.tier !== undefined) {
      return result.monad.tier;
    }

    return undefined;
  }
}
