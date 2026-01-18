/**
 * Stub exports for mitama-agent when @kamiyo/mitama is not available (e.g., on Render).
 * The real implementation is in mitama-agent.ts which is excluded from the production build.
 */

import { BN, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';
import { MitamaClient } from '@kamiyo/kamiyo-mitama';

let cachedClient: MitamaClient | null = null;
let cachedKeypair: Keypair | null = null;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function getKeypair(): Keypair {
  if (!cachedKeypair) {
    const walletSecret = process.env.DEMO_WALLET_SECRET;
    if (!walletSecret) {
      throw new Error('DEMO_WALLET_SECRET not set');
    }
    cachedKeypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  }
  return cachedKeypair;
}

export async function getMitamaClient(): Promise<MitamaClient> {
  if (!cachedClient) {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = getKeypair();
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    cachedClient = new MitamaClient(provider);
  }
  return cachedClient;
}

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
