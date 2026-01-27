// Solana Program Initialization for Remote MCP Server
// Inline implementation to avoid ESM/CJS compatibility issues

import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

// Required env vars for Solana integration
const REQUIRED_ENV = ['SOLANA_RPC_URL', 'MCP_PROGRAM_ID', 'MCP_AGENT_KEYPAIR'];

export function isSolanaConfigured(): boolean {
  return REQUIRED_ENV.every((key) => !!process.env[key]);
}

function loadKeypair(pathOrBase58: string): Keypair {
  if (pathOrBase58.includes('/') || pathOrBase58.includes('\\')) {
    const data = JSON.parse(fs.readFileSync(pathOrBase58, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(data));
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(pathOrBase58));
  } catch {
    try {
      return Keypair.fromSecretKey(Buffer.from(pathOrBase58, 'base64'));
    } catch {
      const arr = JSON.parse(pathOrBase58);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
  }
}

// PDA Deriver
class PDADeriver {
  constructor(private programId: PublicKey) {}

  deriveEscrowPDA(transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(transactionId)],
      this.programId
    );
  }

  deriveReputationPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), entity.toBuffer()],
      this.programId
    );
  }
}

// Convert discriminator arrays to Buffers for Anchor v0.30+
function convertDiscriminators(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertDiscriminators);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'discriminator' && Array.isArray(value)) {
        result[key] = Buffer.from(value as number[]);
      } else {
        result[key] = convertDiscriminators(value);
      }
    }
    return result;
  }
  return obj;
}

function loadIdl(): Idl {
  const idlPath = path.join(__dirname, 'idl', 'x402_escrow.json');
  const content = fs.readFileSync(idlPath, 'utf-8');
  return convertDiscriminators(JSON.parse(content)) as Idl;
}

// Transaction helpers
function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}

function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

function parseEscrowStatus(status: Record<string, unknown>): 'Active' | 'Released' | 'Disputed' | 'Resolved' {
  if ('active' in status) return 'Active';
  if ('released' in status) return 'Released';
  if ('disputed' in status) return 'Disputed';
  if ('resolved' in status) return 'Resolved';
  throw new Error('Unknown escrow status');
}

export interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: bigint;
  status: Record<string, unknown>;
  createdAt: bigint;
  expiresAt: bigint;
  transactionId: string;
  bump: number;
  qualityScore: number | null;
  refundPercentage: number | null;
}

export interface ReputationAccount {
  entity: PublicKey;
  entityType: Record<string, unknown>;
  totalTransactions: bigint;
  disputesFiled: bigint;
  disputesWon: bigint;
  disputesPartial: bigint;
  disputesLost: bigint;
  averageQualityReceived: number;
  reputationScore: number;
  createdAt: bigint;
  lastUpdated: bigint;
  bump: number;
}

// X402Program wrapper
export class X402Program {
  program: Program;
  pda: PDADeriver;
  private wallet: Keypair;

  constructor(connection: Connection, wallet: Keypair, programId: PublicKey) {
    this.wallet = wallet;
    this.pda = new PDADeriver(programId);

    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => { tx.sign([wallet]); return tx; },
      signAllTransactions: async (txs: any[]) => { txs.forEach((tx) => tx.sign([wallet])); return txs; },
      payer: wallet,
    };

    const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: 'confirmed' });
    const idl = loadIdl();
    this.program = new Program(idl, provider);
    Object.defineProperty(this.program, 'programId', { value: programId, writable: false });
  }

  async initializeEscrow(params: {
    api: PublicKey;
    amount: number;
    timeLock: number;
    transactionId: string;
  }): Promise<{ signature: string; escrowPDA: PublicKey }> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(params.transactionId);

    const tx = await this.program.methods
      .initializeEscrow(BigInt(params.amount), BigInt(params.timeLock), params.transactionId)
      .accounts({
        escrow: escrowPDA,
        agent: this.wallet.publicKey,
        api: params.api,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: tx, escrowPDA };
  }

  async markDisputed(transactionId: string): Promise<string> {
    const [escrowPDA] = this.pda.deriveEscrowPDA(transactionId);
    const [reputationPDA] = this.pda.deriveReputationPDA(this.wallet.publicKey);

    return this.program.methods
      .markDisputed()
      .accounts({
        escrow: escrowPDA,
        reputation: reputationPDA,
        agent: this.wallet.publicKey,
      })
      .rpc();
  }

  async initReputation(entity?: PublicKey): Promise<{ signature: string; reputationPDA: PublicKey }> {
    const entityPubkey = entity || this.wallet.publicKey;
    const [reputationPDA] = this.pda.deriveReputationPDA(entityPubkey);

    const tx = await this.program.methods
      .initReputation()
      .accounts({
        reputation: reputationPDA,
        entity: entityPubkey,
        payer: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: tx, reputationPDA };
  }

  async getEscrowAccount(escrowPDA: PublicKey): Promise<EscrowAccount> {
    const data = await (this.program.account as any).escrow.fetch(escrowPDA);
    return data as unknown as EscrowAccount;
  }

  async getReputationAccount(reputationPDA: PublicKey): Promise<ReputationAccount> {
    const data = await (this.program.account as any).entityReputation.fetch(reputationPDA);
    return data as unknown as ReputationAccount;
  }

  async escrowExists(transactionId: string): Promise<boolean> {
    try {
      const [escrowPDA] = this.pda.deriveEscrowPDA(transactionId);
      await this.getEscrowAccount(escrowPDA);
      return true;
    } catch {
      return false;
    }
  }

  async reputationExists(entity: PublicKey): Promise<boolean> {
    try {
      const [reputationPDA] = this.pda.deriveReputationPDA(entity);
      await this.getReputationAccount(reputationPDA);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton program instance
let program: X402Program | null = null;

export function getSolanaProgram(): X402Program | null {
  if (!isSolanaConfigured()) {
    return null;
  }

  if (program) {
    return program;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL!;
  const programId = new PublicKey(process.env.MCP_PROGRAM_ID!);
  const keypairSource = process.env.MCP_AGENT_KEYPAIR!;

  const keypair = loadKeypair(keypairSource);
  const connection = new Connection(rpcUrl, 'confirmed');

  program = new X402Program(connection, keypair, programId);
  return program;
}

export function getAgentPublicKey(): string | null {
  if (!isSolanaConfigured()) return null;
  const keypairSource = process.env.MCP_AGENT_KEYPAIR!;
  try {
    const keypair = loadKeypair(keypairSource);
    return keypair.publicKey.toBase58();
  } catch {
    return null;
  }
}

// Tool implementations
export async function createEscrow(
  params: { api: string; amount: number; timeLock?: number },
  prog: X402Program
): Promise<{ success: boolean; escrowAddress?: string; transactionId?: string; signature?: string; error?: string }> {
  try {
    if (!params.api) return { success: false, error: 'API provider address required' };
    if (!params.amount || params.amount <= 0) return { success: false, error: 'Amount must be > 0' };

    const amountLamports = solToLamports(params.amount);
    if (amountLamports < 1_000_000) return { success: false, error: 'Amount too small (min 0.001 SOL)' };
    if (amountLamports > 1_000_000_000_000) return { success: false, error: 'Amount too large (max 1000 SOL)' };

    const apiPublicKey = new PublicKey(params.api);
    const transactionId = generateTransactionId();
    const timeLock = params.timeLock || 3600;

    if (timeLock < 3600 || timeLock > 2_592_000) {
      return { success: false, error: 'timeLock must be 3600-2592000 seconds' };
    }

    const result = await prog.initializeEscrow({
      api: apiPublicKey,
      amount: amountLamports,
      timeLock,
      transactionId,
    });

    return {
      success: true,
      escrowAddress: result.escrowPDA.toBase58(),
      transactionId,
      signature: result.signature,
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create escrow' };
  }
}

export async function checkEscrowStatus(
  params: { escrowAddress?: string; transactionId?: string },
  prog: X402Program
): Promise<{
  success: boolean;
  status?: string;
  agent?: string;
  api?: string;
  amount?: number;
  createdAt?: number;
  expiresAt?: number;
  transactionId?: string;
  error?: string;
}> {
  try {
    let escrowPDA: PublicKey;
    if (params.escrowAddress) {
      escrowPDA = new PublicKey(params.escrowAddress);
    } else if (params.transactionId) {
      [escrowPDA] = prog.pda.deriveEscrowPDA(params.transactionId);
    } else {
      return { success: false, error: 'escrowAddress or transactionId required' };
    }

    const escrow = await prog.getEscrowAccount(escrowPDA);

    return {
      success: true,
      status: parseEscrowStatus(escrow.status),
      agent: escrow.agent.toBase58(),
      api: escrow.api.toBase58(),
      amount: lamportsToSol(Number(escrow.amount)),
      createdAt: Number(escrow.createdAt),
      expiresAt: Number(escrow.expiresAt),
      transactionId: escrow.transactionId,
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch escrow' };
  }
}

export async function verifyPayment(
  params: { transactionId: string },
  prog: X402Program
): Promise<{
  success: boolean;
  verified?: boolean;
  escrowAddress?: string;
  amount?: number;
  status?: string;
  error?: string;
}> {
  try {
    const [escrowPDA] = prog.pda.deriveEscrowPDA(params.transactionId);
    const exists = await prog.escrowExists(params.transactionId);

    if (!exists) {
      return { success: true, verified: false, error: 'Escrow not found' };
    }

    const escrow = await prog.getEscrowAccount(escrowPDA);
    const status = parseEscrowStatus(escrow.status);

    return {
      success: true,
      verified: status === 'Active',
      escrowAddress: escrowPDA.toBase58(),
      amount: lamportsToSol(Number(escrow.amount)),
      status,
    };
  } catch (error: unknown) {
    return { success: false, verified: false, error: error instanceof Error ? error.message : 'Failed to verify payment' };
  }
}

export async function fileDispute(
  params: { transactionId: string; qualityScore: number; refundPercentage: number; evidence: Record<string, unknown> },
  prog: X402Program
): Promise<{ success: boolean; disputeId?: string; status?: string; signature?: string; message?: string; error?: string }> {
  try {
    if (!params.transactionId) return { success: false, error: 'transactionId required' };
    if (params.qualityScore < 0 || params.qualityScore > 100) return { success: false, error: 'qualityScore must be 0-100' };
    if (params.refundPercentage < 0 || params.refundPercentage > 100) return { success: false, error: 'refundPercentage must be 0-100' };

    const exists = await prog.escrowExists(params.transactionId);
    if (!exists) return { success: false, error: 'Escrow not found' };

    const [escrowPDA] = prog.pda.deriveEscrowPDA(params.transactionId);
    const escrow = await prog.getEscrowAccount(escrowPDA);
    const status = parseEscrowStatus(escrow.status);

    if (status !== 'Active') {
      return { success: false, error: `Cannot dispute ${status} escrow` };
    }

    const agentRepExists = await prog.reputationExists(prog.program.provider.publicKey!);
    if (!agentRepExists) {
      await prog.initReputation();
    }

    const signature = await prog.markDisputed(params.transactionId);

    return {
      success: true,
      disputeId: params.transactionId,
      status: 'disputed',
      signature,
      message: `Dispute filed. Quality: ${params.qualityScore}, Refund: ${params.refundPercentage}%`,
    };
  } catch (error: unknown) {
    let msg = error instanceof Error ? error.message : 'Failed to file dispute';
    if (msg.includes('DisputeWindowExpired')) msg = 'Dispute window expired';
    if (msg.includes('InsufficientDisputeFunds')) msg = 'Insufficient funds for dispute';
    if (msg.includes('Unauthorized')) msg = 'Unauthorized';
    return { success: false, error: msg };
  }
}

export async function getApiReputation(
  params: { apiProvider: string },
  prog: X402Program
): Promise<{
  success: boolean;
  reputationScore?: number;
  totalTransactions?: number;
  disputesFiled?: number;
  disputesWon?: number;
  averageQualityReceived?: number;
  recommendation?: string;
  error?: string;
}> {
  try {
    const apiProviderPubkey = new PublicKey(params.apiProvider);
    const exists = await prog.reputationExists(apiProviderPubkey);

    if (!exists) {
      return {
        success: true,
        reputationScore: 500,
        totalTransactions: 0,
        disputesFiled: 0,
        disputesWon: 0,
        averageQualityReceived: 0,
        recommendation: 'caution',
      };
    }

    const [reputationPDA] = prog.pda.deriveReputationPDA(apiProviderPubkey);
    const reputation = await prog.getReputationAccount(reputationPDA);

    const reputationScore = reputation.reputationScore;
    const totalTransactions = Number(reputation.totalTransactions);
    const disputesFiled = Number(reputation.disputesFiled);
    const disputesWon = Number(reputation.disputesWon);
    const disputesLost = Number(reputation.disputesLost);
    const averageQualityReceived = reputation.averageQualityReceived;

    let recommendation = 'caution';
    if (totalTransactions < 5) recommendation = 'caution';
    else if (reputationScore >= 750 && averageQualityReceived >= 80) recommendation = 'trusted';
    else if (reputationScore >= 500 && averageQualityReceived >= 60) recommendation = 'caution';
    else recommendation = 'avoid';

    if (totalTransactions > 0 && (disputesLost * 100) / totalTransactions > 30) {
      recommendation = 'avoid';
    }

    return {
      success: true,
      reputationScore,
      totalTransactions,
      disputesFiled,
      disputesWon,
      averageQualityReceived,
      recommendation,
    };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch reputation' };
  }
}
