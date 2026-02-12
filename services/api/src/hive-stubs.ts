/**
 * Stub exports for hive-agent when @kamiyo/hive is not available (e.g., on Render).
 * The real implementation is in hive-agent.ts which is excluded from the production build.
 * These stubs are self-contained with no external dependencies.
 */

import { BN } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';

// Helper functions (no-op stubs)
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function getKeypair(): Keypair {
  throw new Error('Hive not available in this environment');
}

// Type definitions for on-chain data
interface RegistryData {
  epoch: BN;
  agentCount: number;
  agentsRoot: number[];
  minStake: BN;
}

interface AggregatorData {
  totalSignals: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  totalConfidence: number;
  totalMagnitude: number;
}

interface SwarmActionData {
  proposer: Uint8Array;
  actionType: number;
  targetHash: Uint8Array;
  votesFor: number;
  votesAgainst: number;
  status: number;
}

// Stub client - returns null for reads, throws for writes
class StubHiveClient {
  async getRegistry(): Promise<RegistryData | null> { return null; }
  async getAggregator(_epoch: BN): Promise<AggregatorData | null> { return null; }
  async getAgent(_commitment: Uint8Array): Promise<unknown | null> { return null; }
  async getSignal(_nullifier: Uint8Array): Promise<unknown | null> { return null; }
  async getSwarmAction(_hash: Uint8Array): Promise<SwarmActionData | null> { return null; }
  async submitSignal(..._args: unknown[]): Promise<string> {
    throw new Error('Hive not available');
  }
  async createSwarmAction(..._args: unknown[]): Promise<string> {
    throw new Error('Hive not available');
  }
  async voteSwarmAction(..._args: unknown[]): Promise<string> {
    throw new Error('Hive not available');
  }
  async revealVote(..._args: unknown[]): Promise<string> {
    throw new Error('Hive not available');
  }
  async revealSignal(..._args: unknown[]): Promise<string> {
    throw new Error('Hive not available');
  }
}

export async function getHiveClient(): Promise<StubHiveClient> {
  return new StubHiveClient();
}

export class HiveAgentClient {
  isRegistered(): boolean { return false; }
  getIdentityCommitment(): string | null { return null; }
  get publicKey() { return null; }
  async register(_stakeAmount?: BN): Promise<string | null> { return null; }
  async submitSignal(
    _signalType: number,
    _direction: number,
    _confidence: number,
    _magnitude: number,
    _stakeAmount: BN,
    _tweetId?: string
  ): Promise<{ commitment: string; nullifier: string; txSignature: string | null } | null> {
    return null;
  }
}

export async function initHiveAgent(): Promise<HiveAgentClient | null> {
  return null;
}

export function getHiveAgent(): HiveAgentClient | null {
  return null;
}

export function formatTrackRecord(): string {
  return 'Hive agent not available';
}

interface SignalRecord {
  direction: number;
  confidence: number;
  commitment: string;
  outcome: number | null;
}

export function getRecentSignals(_limit = 10): SignalRecord[] {
  return [];
}
