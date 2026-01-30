import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export type EscrowStatus = 'active' | 'released' | 'disputed' | 'resolved' | 'unknown';

export interface EscrowResult {
  success: boolean;
  escrowAddress?: string;
  signature?: string;
  error?: string;
}

export interface EscrowState {
  status: EscrowStatus;
  amount: number;
  provider: string;
  agent: string;
  createdAt: number;
  expiresAt: number;
}

export class EscrowClient {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Keypair,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
  }

  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  async createEscrow(params: {
    requester: string;
    amount: number;
    jobId: string;
  }): Promise<EscrowResult> {
    try {
      console.log(`[Escrow] Creating escrow for job ${params.jobId}`);
      console.log(`[Escrow] Requester: ${params.requester}`);
      console.log(`[Escrow] Amount: ${params.amount} SOL`);
      console.log(`[Escrow] Provider (this agent): ${this.wallet.publicKey.toBase58()}`);

      // Derive PDA for escrow account
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('escrow'),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(`moltbook_${params.jobId}`),
        ],
        this.programId
      );

      // TODO: Actual transaction submission via KAMIYO SDK
      // For MVP, we simulate success and return the expected PDA
      return {
        success: true,
        escrowAddress: escrowPda.toBase58(),
        signature: 'simulated_' + Date.now().toString(36),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async checkStatus(escrowAddress: string): Promise<EscrowState | null> {
    try {
      const pubkey = new PublicKey(escrowAddress);
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        return null;
      }

      // TODO: Deserialize actual account data from KAMIYO program
      // For MVP, return mock active status
      return {
        status: 'active',
        amount: 0,
        provider: this.wallet.publicKey.toBase58(),
        agent: '',
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
    } catch {
      return null;
    }
  }

  async verifyFunded(escrowAddress: string): Promise<boolean> {
    const state = await this.checkStatus(escrowAddress);
    return state !== null && state.status === 'active';
  }
}

export async function createEscrowClient(config: {
  rpcUrl: string;
  privateKey: string;
  programId: string;
}): Promise<EscrowClient> {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const secretKey = bs58.decode(config.privateKey);
  const wallet = Keypair.fromSecretKey(secretKey);
  const programId = new PublicKey(config.programId);

  return new EscrowClient(connection, wallet, programId);
}
