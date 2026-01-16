/**
 * Stub exports for mitama-agent when @kamiyo/mitama is not available (e.g., on Render).
 * The real implementation is in mitama-agent.ts which is excluded from the production build.
 */

import { BN } from '@coral-xyz/anchor';

export class MitamaAgentClient {
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

export async function initMitamaAgent(): Promise<MitamaAgentClient | null> {
  return null;
}

export function getMitamaAgent(): MitamaAgentClient | null {
  return null;
}

export function formatTrackRecord(): string {
  return 'Mitama agent not available';
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
