/**
 * ElizaOS Providers for Radr
 *
 * Providers inject context about shielded balances, reputation, and pools
 * into agent conversations.
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import type { Provider, IAgentRuntime, Memory, State } from './types';
import { ShadowWireWrapper, createShadowWireClient } from '../client/shadow-wire';
import { ShadowIdReputationGate, createShadowIdReputationGate, REPUTATION_TIERS } from '../reputation/shadow-id-gate';
import type { ShadowToken } from '../types';

// Cache for clients to avoid re-initialization
const clientCache = new Map<string, ShadowWireWrapper>();
const gateCache = new Map<string, ShadowIdReputationGate>();

function getRpcUrl(runtime: IAgentRuntime): string {
  return runtime.getSetting('SOLANA_RPC_URL') || runtime.getSetting('RPC_URL') || 'https://api.mainnet-beta.solana.com';
}

function getKeypair(runtime: IAgentRuntime): Keypair | null {
  const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
  if (!privateKey) return null;
  try {
    const decoded = Buffer.from(privateKey, 'base64');
    return Keypair.fromSecretKey(decoded);
  } catch {
    try {
      return Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)));
    } catch {
      return null;
    }
  }
}

function getKamiyoProgramId(runtime: IAgentRuntime): string {
  return runtime.getSetting('KAMIYO_PROGRAM_ID') || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
}

/**
 * Shielded Balance Provider
 *
 * Provides context about agent's shielded token balances.
 */
export const shieldedBalanceProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      return 'Shielded balances: Wallet not configured';
    }

    try {
      const rpcUrl = getRpcUrl(runtime);
      const cacheKey = `shadow_${rpcUrl}`;

      let client = clientCache.get(cacheKey);
      if (!client) {
        const connection = new Connection(rpcUrl);
        client = await createShadowWireClient(connection, { debug: false });
        clientCache.set(cacheKey, client);
      }

      const tokens: ShadowToken[] = ['SOL', 'USDC', 'RADR'];
      const balances: string[] = [];

      for (const token of tokens) {
        try {
          const balance = await client.getBalance(keypair.publicKey.toBase58(), token);
          if (balance.available > 0) {
            balances.push(`${token}: ${balance.available}`);
          }
        } catch {
          // Token not in pool, skip
        }
      }

      if (balances.length === 0) {
        return 'Shielded balances: No tokens in shielded pools';
      }

      return `Shielded balances: ${balances.join(', ')}`;
    } catch (err) {
      return 'Shielded balances: Unable to fetch';
    }
  },
};

/**
 * Reputation Tier Provider
 *
 * Provides context about agent's reputation tier and access levels.
 */
export const reputationTierProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      return 'Reputation: Wallet not configured';
    }

    try {
      const rpcUrl = getRpcUrl(runtime);
      const programId = getKamiyoProgramId(runtime);
      const cacheKey = `gate_${rpcUrl}_${programId}`;

      let gate = gateCache.get(cacheKey);
      if (!gate) {
        const connection = new Connection(rpcUrl);
        gate = createShadowIdReputationGate(connection, programId);
        gateCache.set(cacheKey, gate);
      }

      const result = await gate.checkReputationGate(
        { publicKey: keypair.publicKey },
        0 // Check with threshold 0 to get tier info
      );

      const tierInfo = REPUTATION_TIERS[result.tier];
      return `Reputation: ${tierInfo.label} tier (${result.tier}), pool access: ${result.eligible ? 'granted' : 'limited'}`;
    } catch (err) {
      return 'Reputation: Unable to fetch';
    }
  },
};

/**
 * ShadowPay Status Provider
 *
 * Provides context about ShadowPay network status and fees.
 */
export const shadowPayStatusProvider: Provider = {
  async get(_runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    // In production, fetch actual network status from Radr API
    return 'ShadowPay: Active, relayer fee 1%, 17 tokens supported';
  },
};

/**
 * Private Escrow Provider
 *
 * Provides context about active private escrows.
 */
export const privateEscrowProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      return 'Private escrows: Wallet not configured';
    }

    try {
      const rpcUrl = getRpcUrl(runtime);
      const connection = new Connection(rpcUrl);

      // In production, fetch escrows from Kamiyo program accounts
      // For now, return placeholder
      return 'Private escrows: Query active escrows with SHADOW_CHECK_ESCROWS action';
    } catch {
      return 'Private escrows: Unable to fetch';
    }
  },
};

// Export all providers
export const radrProviders = [
  shieldedBalanceProvider,
  reputationTierProvider,
  shadowPayStatusProvider,
  privateEscrowProvider,
];
