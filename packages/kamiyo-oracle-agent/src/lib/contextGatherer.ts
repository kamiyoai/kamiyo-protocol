import { Connection, PublicKey } from '@solana/web3.js';
import type { IAgentRuntime, EvaluationContext, DisputeEvent } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';

interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: bigint;
  status: number;
  createdAt: bigint;
  expiresAt: bigint;
  transactionId: string;
  qualityScore: number | null;
  oracleSubmissions: Array<{
    oracle: PublicKey;
    qualityScore: number;
    submittedAt: bigint;
  }>;
}

interface AgentIdentity {
  owner: PublicKey;
  name: string;
  reputation: number;
  totalEscrows: number;
  disputedEscrows: number;
  violationCount: number;
  stakeAmount: bigint;
}

export async function gatherEvaluationContext(
  runtime: IAgentRuntime,
  dispute: DisputeEvent | string
): Promise<EvaluationContext> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  const escrowPda = typeof dispute === 'string'
    ? new PublicKey(dispute)
    : new PublicKey(dispute.escrowPda);

  // Fetch escrow account
  const escrow = await fetchEscrowAccount(connection, escrowPda);

  // Fetch agent and provider identities in parallel
  const [agentIdentity, providerIdentity] = await Promise.all([
    fetchAgentIdentity(connection, programId, escrow.agent),
    fetchAgentIdentity(connection, programId, escrow.api),
  ]);

  // Build context
  const context: EvaluationContext = {
    escrow: {
      pda: escrowPda.toBase58(),
      amount: Number(escrow.amount) / 1e9, // Convert lamports to SOL
      createdAt: Number(escrow.createdAt),
      expiresAt: Number(escrow.expiresAt),
      transactionId: escrow.transactionId,
      status: getStatusString(escrow.status),
    },

    agent: {
      pubkey: escrow.agent.toBase58(),
      reputation: agentIdentity?.reputation ?? 500,
      totalEscrows: agentIdentity?.totalEscrows ?? 0,
      disputeRate: calculateDisputeRate(agentIdentity),
    },

    provider: {
      pubkey: escrow.api.toBase58(),
      reputation: providerIdentity?.reputation ?? 500,
      totalEscrows: providerIdentity?.totalEscrows ?? 0,
      disputeRate: calculateDisputeRate(providerIdentity),
      averageQualityScore: await fetchAverageQualityScore(connection, programId, escrow.api),
    },

    service: {
      type: inferServiceType(escrow.transactionId),
      description: 'Service delivery agreement',
      slaTerms: ['Delivery within timelock period', 'Quality meets expectations'],
      deliveryProof: undefined, // Would be fetched from off-chain storage
    },

    evidence: {
      agentClaim: 'Agent disputed the escrow before expiration',
      providerClaim: undefined,
      thirdPartyData: [],
    },
  };

  // Try to enrich with off-chain data
  await enrichWithOffChainData(runtime, context);

  return context;
}

async function fetchEscrowAccount(
  connection: Connection,
  escrowPda: PublicKey
): Promise<EscrowAccount> {
  const accountInfo = await connection.getAccountInfo(escrowPda);

  if (!accountInfo) {
    throw new Error(`Escrow account not found: ${escrowPda.toBase58()}`);
  }

  // Simplified deserialization - in production use Anchor's account decoder
  // This is a placeholder that would need proper Anchor integration
  return {
    agent: new PublicKey(accountInfo.data.slice(8, 40)),
    api: new PublicKey(accountInfo.data.slice(40, 72)),
    amount: accountInfo.data.readBigUInt64LE(72),
    status: accountInfo.data.readUInt8(80),
    createdAt: accountInfo.data.readBigInt64LE(81),
    expiresAt: accountInfo.data.readBigInt64LE(89),
    transactionId: extractString(accountInfo.data, 97),
    qualityScore: null,
    oracleSubmissions: [],
  };
}

async function fetchAgentIdentity(
  connection: Connection,
  programId: PublicKey,
  owner: PublicKey
): Promise<AgentIdentity | null> {
  try {
    const [identityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), owner.toBuffer()],
      programId
    );

    const accountInfo = await connection.getAccountInfo(identityPda);
    if (!accountInfo) return null;

    // Simplified deserialization
    return {
      owner,
      name: 'Agent',
      reputation: accountInfo.data.readInt16LE(40),
      totalEscrows: accountInfo.data.readUInt32LE(42),
      disputedEscrows: accountInfo.data.readUInt32LE(46),
      violationCount: accountInfo.data.readUInt8(50),
      stakeAmount: accountInfo.data.readBigUInt64LE(51),
    };
  } catch {
    return null;
  }
}

function calculateDisputeRate(identity: AgentIdentity | null): number {
  if (!identity || identity.totalEscrows === 0) return 0;
  return (identity.disputedEscrows / identity.totalEscrows) * 100;
}

async function fetchAverageQualityScore(
  connection: Connection,
  programId: PublicKey,
  provider: PublicKey
): Promise<number> {
  // In production, this would query historical resolved escrows
  // For now, return a reasonable default
  return 75;
}

function getStatusString(status: number): string {
  const statuses = ['Active', 'Disputed', 'Resolved', 'Expired', 'Cancelled'];
  return statuses[status] ?? 'Unknown';
}

function inferServiceType(transactionId: string): string {
  // Infer service type from transaction ID patterns
  if (transactionId.startsWith('api-')) return 'api_call';
  if (transactionId.startsWith('data-')) return 'data_delivery';
  if (transactionId.startsWith('compute-')) return 'compute';
  if (transactionId.startsWith('x402-')) return 'x402_payment';
  return 'general_service';
}

function extractString(data: Buffer, offset: number): string {
  const length = data.readUInt32LE(offset);
  return data.slice(offset + 4, offset + 4 + length).toString('utf8');
}

async function enrichWithOffChainData(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<void> {
  // Try to fetch additional context from x402 logs, IPFS, or other sources
  // This is where we'd integrate with Helius transaction history,
  // fetch API response logs, etc.

  const heliusKey = runtime.getSetting('HELIUS_API_KEY');
  if (!heliusKey) return;

  try {
    // Fetch recent transactions for the escrow
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${context.escrow.pda}/transactions?api-key=${heliusKey}&limit=10`
    );

    if (response.ok) {
      const txs = await response.json();
      // Extract relevant evidence from transaction history
      context.evidence.thirdPartyData = txs.map((tx: any) =>
        `TX ${tx.signature.slice(0, 8)}: ${tx.type || 'unknown'}`
      );
    }
  } catch {
    // Silent fail - off-chain enrichment is optional
  }
}

export async function hasAlreadyVoted(
  runtime: IAgentRuntime,
  escrowPda: string
): Promise<boolean> {
  const state = await runtime.getState?.('oracle_state') as { votedDisputes?: string[] } | undefined;
  return state?.votedDisputes?.includes(escrowPda) ?? false;
}

export async function getOracleSubmissionCount(
  connection: Connection,
  escrowPda: PublicKey
): Promise<number> {
  const accountInfo = await connection.getAccountInfo(escrowPda);
  if (!accountInfo) return 0;

  // Would need proper deserialization to get actual count
  // This is simplified
  return 0;
}
