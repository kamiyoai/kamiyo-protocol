/**
 * On-chain transaction helpers for Kamiyo protocol.
 * Builds Solana instructions and signs them via MWA (Mobile Wallet Adapter).
 *
 * Inlines instruction building from @kamiyo/sdk to avoid pulling
 * @coral-xyz/anchor into the mobile bundle.
 */

import { Platform } from 'react-native';
import { KAMIYO_PROGRAM_ID, SOLANA_NETWORK, SOLANA_RPC_URL } from './constants';

// --------------------------------------------------------------------------
// Types for lazy-loaded Solana modules.  Narrow interfaces keep the web
// bundle free of native-only libraries.
// --------------------------------------------------------------------------

interface SolanaPublicKey {
  toBase58(): string;
  toBuffer(): Buffer;
  toString(): string;
  equals(other: SolanaPublicKey): boolean;
}

type PublicKeyConstructor = (new (value: string | Uint8Array) => SolanaPublicKey) & {
  findProgramAddressSync(
    seeds: Array<Buffer | Uint8Array>,
    programId: SolanaPublicKey,
  ): [SolanaPublicKey, number];
};

interface AccountMeta {
  pubkey: SolanaPublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

interface SolanaTransactionInstruction {
  keys: AccountMeta[];
  programId: SolanaPublicKey;
  data: Buffer;
}

type TransactionInstructionConstructor = new (params: {
  keys: AccountMeta[];
  programId: SolanaPublicKey;
  data: Buffer;
}) => SolanaTransactionInstruction;

interface SolanaTransaction {
  add(instruction: SolanaTransactionInstruction): SolanaTransaction;
  recentBlockhash: string;
  feePayer: SolanaPublicKey;
  serialize(): Uint8Array;
}

type TransactionConstructor = new () => SolanaTransaction;

interface SolanaSystemProgram {
  programId: SolanaPublicKey;
}

interface SolanaConnection {
  getBalance(publicKey: SolanaPublicKey): Promise<number>;
  getLatestBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }>;
  getAccountInfo(
    publicKey: SolanaPublicKey,
  ): Promise<{ data: Buffer } | null>;
  sendRawTransaction(
    rawTransaction: Uint8Array,
    options?: { skipPreflight?: boolean; preflightCommitment?: string },
  ): Promise<string>;
  confirmTransaction(
    strategy: {
      signature: string;
      blockhash: string;
      lastValidBlockHeight: number;
    },
    commitment?: string,
  ): Promise<unknown>;
}

type ConnectionConstructor = new (
  endpoint: string,
  commitment: string,
) => SolanaConnection;

/** MWA wallet handle passed into `transact()` callback. */
interface MobileWalletHandle {
  authorize(params: {
    cluster: 'devnet' | 'mainnet-beta' | 'testnet';
    identity: { name: string; uri: string; icon: string };
  }): Promise<{
    accounts: Array<{ address: string }>;
    auth_token: string;
  }>;
  reauthorize(params: {
    auth_token: string;
    identity: { name: string; uri: string; icon: string };
  }): Promise<unknown>;
  signTransactions(params: {
    transactions: SolanaTransaction[];
  }): Promise<SolanaTransaction[]>;
}

type TransactFn = <T>(
  callback: (wallet: MobileWalletHandle) => Promise<T>,
) => Promise<T>;

// --------------------------------------------------------------------------
// Lazy-loaded module references (native only)
// --------------------------------------------------------------------------

let ConnectionClass: ConnectionConstructor | null = null;
let PublicKey: PublicKeyConstructor | null = null;
let TransactionClass: TransactionConstructor | null = null;
let TransactionInstructionClass: TransactionInstructionConstructor | null = null;
let SystemProgramRef: SolanaSystemProgram | null = null;
let transact: TransactFn | null = null;
let modulesLoaded = false;

const MWA_IDENTITY = {
  name: 'KAMIYO',
  uri: 'https://kamiyo.ai',
  icon: 'favicon.ico',
} as const;

// Anchor discriminators (sha256("global:<name>")[0..8])
const DISCRIMINATORS = {
  createAgent: new Uint8Array([143, 66, 198, 95, 110, 85, 83, 249]),
  initializeEscrow: new Uint8Array([243, 160, 77, 153, 11, 92, 48, 209]),
} as const;

// Agent type enum matching the on-chain program
export enum AgentType {
  Trading = 0,
  Service = 1,
  Oracle = 2,
  Custom = 3,
}

// Minimum stake: 0.1 SOL
export const MIN_STAKE_LAMPORTS = 100_000_000;

// --------------------------------------------------------------------------
// Module loading
// --------------------------------------------------------------------------

async function loadModules(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (modulesLoaded) return true;

  try {
    const web3 = await import('@solana/web3.js');
    ConnectionClass = web3.Connection as unknown as ConnectionConstructor;
    PublicKey = web3.PublicKey as unknown as PublicKeyConstructor;
    TransactionClass = web3.Transaction as unknown as TransactionConstructor;
    TransactionInstructionClass =
      web3.TransactionInstruction as unknown as TransactionInstructionConstructor;
    SystemProgramRef = web3.SystemProgram as unknown as SolanaSystemProgram;

    const mwa = await import(
      '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
    );
    transact = mwa.transact as TransactFn;

    modulesLoaded = true;
    return true;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// MWA auth helper – reauthorize with fallback to full authorize
// --------------------------------------------------------------------------

async function authorizeWallet(
  wallet: MobileWalletHandle,
  authToken: string | null,
): Promise<void> {
  if (authToken) {
    try {
      await wallet.reauthorize({ auth_token: authToken, identity: MWA_IDENTITY });
      return;
    } catch {
      // Token expired — fall through to full authorize
    }
  }
  await wallet.authorize({ cluster: SOLANA_NETWORK, identity: MWA_IDENTITY });
}

// --------------------------------------------------------------------------
// Connection + PDA helpers
// --------------------------------------------------------------------------

function getConnection(): SolanaConnection {
  return new ConnectionClass!(SOLANA_RPC_URL, 'confirmed');
}

function getAgentPDA(owner: SolanaPublicKey): [SolanaPublicKey, number] {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  return PublicKey!.findProgramAddressSync(
    [Buffer.from('agent'), owner.toBuffer()],
    programId,
  );
}

function getProtocolConfigPDA(): [SolanaPublicKey, number] {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  return PublicKey!.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId,
  );
}

function getFeeVaultPDA(): [SolanaPublicKey, number] {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  return PublicKey!.findProgramAddressSync(
    [Buffer.from('fee_vault')],
    programId,
  );
}

// --------------------------------------------------------------------------
// Instruction builders
// --------------------------------------------------------------------------

function buildCreateAgentInstruction(
  owner: SolanaPublicKey,
  name: string,
  agentType: AgentType,
  stakeLamports: number,
): SolanaTransactionInstruction {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  const [agentPDA] = getAgentPDA(owner);
  const [protocolConfigPDA] = getProtocolConfigPDA();
  const [feeVaultPDA] = getFeeVaultPDA();

  const nameBytes = Buffer.from(name);

  // Encode stake amount as u64 little-endian
  const stakeBuf = Buffer.alloc(8);
  stakeBuf.writeBigUInt64LE(BigInt(stakeLamports));

  const data = Buffer.concat([
    Buffer.from(DISCRIMINATORS.createAgent),
    Buffer.from([nameBytes.length, 0, 0, 0]), // name length (u32 LE)
    nameBytes,
    Buffer.from([agentType]),
    stakeBuf,
  ]);

  return new TransactionInstructionClass!({
    keys: [
      { pubkey: agentPDA, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: protocolConfigPDA, isSigner: false, isWritable: true },
      { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgramRef!.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

function buildInitializeEscrowInstruction(
  agent: SolanaPublicKey,
  provider: SolanaPublicKey,
  amountLamports: number,
  timeLockSeconds: number,
  transactionId: string,
): SolanaTransactionInstruction {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  const [agreementPDA] = getAgreementPDA(agent, transactionId);
  const [protocolConfigPDA] = getProtocolConfigPDA();
  const [feeVaultPDA] = getFeeVaultPDA();

  const transactionIdBytes = Buffer.from(transactionId);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(BigInt(amountLamports));

  const timeLockBuf = Buffer.alloc(8);
  timeLockBuf.writeBigUInt64LE(BigInt(timeLockSeconds));

  const data = Buffer.concat([
    Buffer.from(DISCRIMINATORS.initializeEscrow),
    amountBuf,
    timeLockBuf,
    Buffer.from([transactionIdBytes.length, 0, 0, 0]),
    transactionIdBytes,
    Buffer.from([0]), // use_spl_token = false (SOL only)
  ]);

  return new TransactionInstructionClass!({
    keys: [
      { pubkey: agreementPDA, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: true },
      { pubkey: provider, isSigner: false, isWritable: false },
      { pubkey: protocolConfigPDA, isSigner: false, isWritable: true },
      { pubkey: feeVaultPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgramRef!.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

// --------------------------------------------------------------------------
// Escrow PDA
// --------------------------------------------------------------------------

function getAgreementPDA(
  agent: SolanaPublicKey,
  transactionId: string,
): [SolanaPublicKey, number] {
  const programId = new PublicKey!(KAMIYO_PROGRAM_ID);
  return PublicKey!.findProgramAddressSync(
    [
      Buffer.from('escrow'),
      agent.toBuffer(),
      Buffer.from(transactionId),
    ],
    programId,
  );
}

// --------------------------------------------------------------------------
// Transaction helpers (shared between register + escrow)
// --------------------------------------------------------------------------

async function signAndSendTransaction(
  connection: SolanaConnection,
  instruction: SolanaTransactionInstruction,
  feePayer: SolanaPublicKey,
  authToken: string | null,
): Promise<string> {
  return transact!(async (wallet) => {
    await authorizeWallet(wallet, authToken);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const tx = new TransactionClass!();
    tx.add(instruction);
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;

    const signedTransactions = await wallet.signTransactions({
      transactions: [tx],
    });

    const signedTx = signedTransactions[0];
    const rawTransaction = signedTx.serialize();

    const sig = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    return sig;
  });
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Map agent personality to on-chain AgentType.
 */
export function personalityToAgentType(personality: string): AgentType {
  switch (personality) {
    case 'efficient':
      return AgentType.Trading;
    case 'creative':
      return AgentType.Custom;
    case 'professional':
    case 'balanced':
    default:
      return AgentType.Service;
  }
}

export interface RegisterAgentResult {
  signature: string;
  agentPda: string;
}

/**
 * Register an agent on-chain via MWA.
 *
 * 1. Builds create_agent instruction
 * 2. Signs via MWA transact()
 * 3. Sends + confirms transaction
 */
export async function registerAgentOnChain(
  publicKeyBase58: string,
  authToken: string | null,
  agentName: string,
  personality: string,
  stakeLamports: number = MIN_STAKE_LAMPORTS,
): Promise<RegisterAgentResult> {
  const loaded = await loadModules();
  if (!loaded) throw new Error('Solana modules not available');

  const owner = new PublicKey!(publicKeyBase58);
  const agentType = personalityToAgentType(personality);
  const connection = getConnection();

  const instruction = buildCreateAgentInstruction(
    owner,
    agentName,
    agentType,
    stakeLamports,
  );

  const [agentPDA] = getAgentPDA(owner);

  const signature = await signAndSendTransaction(
    connection,
    instruction,
    owner,
    authToken,
  );

  return {
    signature,
    agentPda: agentPDA.toBase58(),
  };
}

export interface CreateEscrowResult {
  signature: string;
  escrowPda: string;
}

/**
 * Create an on-chain escrow for a job via MWA.
 *
 * @param publicKeyBase58 - Wallet public key (agent/client)
 * @param authToken - MWA auth token
 * @param providerAddress - The service provider's wallet address
 * @param amountLamports - Payment amount in lamports
 * @param transactionId - Unique escrow ID (typically the job ID)
 * @param timeLockSeconds - Time lock in seconds (default 7 days)
 */
export async function createEscrowOnChain(
  publicKeyBase58: string,
  authToken: string | null,
  providerAddress: string,
  amountLamports: number,
  transactionId: string,
  timeLockSeconds: number = 7 * 24 * 60 * 60,
): Promise<CreateEscrowResult> {
  const loaded = await loadModules();
  if (!loaded) throw new Error('Solana modules not available');

  const agent = new PublicKey!(publicKeyBase58);
  const provider = new PublicKey!(providerAddress);
  const connection = getConnection();

  const instruction = buildInitializeEscrowInstruction(
    agent,
    provider,
    amountLamports,
    timeLockSeconds,
    transactionId,
  );

  const [escrowPDA] = getAgreementPDA(agent, transactionId);

  const signature = await signAndSendTransaction(
    connection,
    instruction,
    agent,
    authToken,
  );

  return {
    signature,
    escrowPda: escrowPDA.toBase58(),
  };
}

/**
 * Check if an agent PDA exists on-chain for the given owner.
 */
export async function checkAgentOnChain(
  publicKeyBase58: string,
): Promise<{ exists: boolean; pda: string }> {
  const loaded = await loadModules();
  if (!loaded) return { exists: false, pda: '' };

  const owner = new PublicKey!(publicKeyBase58);
  const [agentPDA] = getAgentPDA(owner);
  const connection = getConnection();

  const accountInfo = await connection.getAccountInfo(agentPDA);
  return {
    exists: accountInfo !== null,
    pda: agentPDA.toBase58(),
  };
}

/**
 * Get the Solana Explorer URL for a transaction.
 */
export function getExplorerUrl(
  signature: string,
  type: 'tx' | 'address' = 'tx',
): string {
  if (SOLANA_NETWORK === 'mainnet-beta') {
    return `https://explorer.solana.com/${type}/${signature}`;
  }
  return `https://explorer.solana.com/${type}/${signature}?cluster=${SOLANA_NETWORK}`;
}
