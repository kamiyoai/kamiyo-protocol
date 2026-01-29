import { ethers } from 'ethers';
import {
  RegisterResult,
  TxResult,
  KamiyoTier,
  AgentProfile,
  AgentType,
  CHAIN_CONFIGS,
} from '../types';
import { IdentityRegistry } from '../identity/IdentityRegistry';
import { HyperliquidAdapter, HyperliquidAgentProfile } from '../adapters/HyperliquidAdapter';
import { createAgentProfile, serializeAgentProfile } from '../identity/AgentProfile';

/**
 * Migration source data from Hyperliquid
 */
export interface MigrationSource {
  agentAddress: string;
  name: string;
  stake: bigint;
  registeredAt: number;
  totalTrades: number;
  successfulTrades: number;
  active: boolean;
}

/**
 * Migration result for a single agent
 */
export interface MigrationResult {
  sourceAddress: string;
  success: boolean;
  globalId?: string;
  agentId?: bigint;
  txHash?: string;
  error?: string;
}

/**
 * Batch migration result
 */
export interface BatchMigrationResult {
  total: number;
  successful: number;
  failed: number;
  results: MigrationResult[];
}

/**
 * Migration options
 */
export interface MigrationOptions {
  profileBaseURI?: string;
  defaultTier?: KamiyoTier;
  dryRun?: boolean;
  onProgress?: (current: number, total: number, result: MigrationResult) => void;
}

/**
 * Agent migrator for moving agents from Hyperliquid to Base ERC-8004
 */
export class AgentMigrator {
  private identityRegistry: IdentityRegistry;
  private hyperliquidAdapter: HyperliquidAdapter;

  constructor(
    identityRegistry: IdentityRegistry,
    hyperliquidAdapter: HyperliquidAdapter
  ) {
    this.identityRegistry = identityRegistry;
    this.hyperliquidAdapter = hyperliquidAdapter;
  }

  /**
   * Migrate a single agent from Hyperliquid to Base
   */
  async migrateAgent(
    agentAddress: string,
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    try {
      const profile = await this.hyperliquidAdapter.getAgentFull(agentAddress);

      if (!profile.active) {
        return {
          sourceAddress: agentAddress,
          success: false,
          error: 'Agent is not active',
        };
      }

      const agentProfile = this.buildProfile(profile, agentAddress, options);
      const profileJSON = serializeAgentProfile(agentProfile);
      const profileURI = options.profileBaseURI
        ? `${options.profileBaseURI}/${agentAddress}.json`
        : `ipfs://pending/${agentAddress}`;

      if (options.dryRun) {
        return {
          sourceAddress: agentAddress,
          success: true,
          globalId: `eip155:8453:${this.identityRegistry.address}:dry-run`,
        };
      }

      const metadata = [
        {
          key: 'hyperliquid_address',
          value: ethers.toUtf8Bytes(agentAddress),
        },
        {
          key: 'migration_timestamp',
          value: ethers.toUtf8Bytes(Date.now().toString()),
        },
      ];

      const result = await this.identityRegistry.register(profileURI, metadata);

      return {
        sourceAddress: agentAddress,
        success: true,
        globalId: result.globalId,
        agentId: result.agentId,
        txHash: result.txHash,
      };
    } catch (error) {
      return {
        sourceAddress: agentAddress,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Migrate multiple agents in batch
   */
  async migrateAgents(
    agentAddresses: string[],
    options: MigrationOptions = {}
  ): Promise<BatchMigrationResult> {
    const results: MigrationResult[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < agentAddresses.length; i++) {
      const result = await this.migrateAgent(agentAddresses[i], options);
      results.push(result);

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      if (options.onProgress) {
        options.onProgress(i + 1, agentAddresses.length, result);
      }
    }

    return {
      total: agentAddresses.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Link migrated agent on Hyperliquid to canonical global ID
   */
  async linkMigratedAgent(
    agentAddress: string,
    globalId: string
  ): Promise<TxResult> {
    return this.hyperliquidAdapter.linkToGlobalId(globalId);
  }

  /**
   * Complete migration with linking
   */
  async migrateAndLink(
    agentAddress: string,
    options: MigrationOptions = {}
  ): Promise<MigrationResult & { linked: boolean }> {
    const migrationResult = await this.migrateAgent(agentAddress, options);

    if (!migrationResult.success || !migrationResult.globalId || options.dryRun) {
      return { ...migrationResult, linked: false };
    }

    try {
      await this.linkMigratedAgent(agentAddress, migrationResult.globalId);
      return { ...migrationResult, linked: true };
    } catch (error) {
      return {
        ...migrationResult,
        linked: false,
        error: `Migration succeeded but linking failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate migration prerequisites for an agent
   */
  async validateMigration(agentAddress: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const profile = await this.hyperliquidAdapter.getAgentFull(agentAddress);

      if (!profile.active) {
        errors.push('Agent is not active');
      }

      if (profile.stake === 0n) {
        warnings.push('Agent has no stake');
      }

      const isLinked = await this.hyperliquidAdapter.isLinked(agentAddress);
      if (isLinked) {
        errors.push('Agent is already linked to a global ID');
      }

      if (!profile.name || profile.name.length === 0) {
        warnings.push('Agent has no name set');
      }
    } catch (error) {
      errors.push(`Failed to fetch agent: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get migration status for an agent
   */
  async getMigrationStatus(agentAddress: string): Promise<{
    migrated: boolean;
    linked: boolean;
    globalId?: string;
  }> {
    try {
      const isLinked = await this.hyperliquidAdapter.isLinked(agentAddress);

      if (!isLinked) {
        return { migrated: false, linked: false };
      }

      const globalId = await this.hyperliquidAdapter.getAgentGlobalId(agentAddress);

      return {
        migrated: true,
        linked: true,
        globalId,
      };
    } catch {
      return { migrated: false, linked: false };
    }
  }

  private buildProfile(
    source: HyperliquidAgentProfile,
    agentAddress: string,
    options: MigrationOptions
  ): AgentProfile {
    return createAgentProfile({
      name: source.name || `Agent-${agentAddress.slice(0, 8)}`,
      wallet: agentAddress,
      owner: source.owner || agentAddress,
      type: AgentType.Trading,
      description: `Migrated from Hyperliquid. Trades: ${source.totalTrades}, Success rate: ${source.totalTrades > 0 ? Math.round((source.successfulTrades / source.totalTrades) * 100) : 0}%`,
      tier: options.defaultTier,
      stake: {
        amount: ethers.formatEther(source.stake),
        token: 'HYPE',
        chain: 'hyperliquid',
      },
    });
  }
}
