import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type { IAgentRuntime, EvaluationContext, DisputeEvent } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';
import {
  AccountNotFoundError,
  DeserializationError,
  BlockchainError,
} from './errors';
import { createLogger } from './logger';
import { withRetry } from './retry';
import { validateSolanaAddress, sanitizeForLLM } from './validation';

const log = createLogger('context-gatherer');

// Account discriminators (first 8 bytes of sha256 hash of account name)
const DISCRIMINATORS = {
  agent: Buffer.from([143, 66, 198, 95, 110, 85, 83, 249]),
  agreement: Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
  oracleRegistry: Buffer.from([185, 165, 165, 167, 208, 207, 55, 35]),
  reputation: Buffer.from([90, 115, 98, 231, 173, 119, 117, 176]),
};

// Agreement status enum
const AGREEMENT_STATUS = {
  0: 'Active',
  1: 'Released',
  2: 'Disputed',
  3: 'Resolved',
} as const;

interface AgreementAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: BN;
  status: number;
  createdAt: BN;
  expiresAt: BN;
  transactionId: string;
  bump: number;
  qualityScore: number | null;
  refundPercentage: number | null;
  oracleSubmissions: Array<{
    oracle: PublicKey;
    qualityScore: number;
    submittedAt: BN;
  }>;
}

interface AgentIdentityAccount {
  owner: PublicKey;
  name: string;
  agentType: number;
  reputation: BN;
  stakeAmount: BN;
  isActive: boolean;
  createdAt: BN;
  lastActive: BN;
  totalEscrows: BN;
  successfulEscrows: BN;
  disputedEscrows: BN;
  bump: number;
}

interface ReputationAccount {
  entity: PublicKey;
  entityType: number;
  totalTransactions: BN;
  disputesFiled: BN;
  disputesWon: BN;
  disputesPartial: BN;
  disputesLost: BN;
  averageQualityReceived: number;
  reputationScore: number;
}

export async function gatherEvaluationContext(
  runtime: IAgentRuntime,
  dispute: DisputeEvent | string
): Promise<EvaluationContext> {
  const escrowPdaStr = typeof dispute === 'string' ? dispute : dispute.escrowPda;
  validateSolanaAddress(escrowPdaStr, 'escrowPda');

  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  log.info('Gathering evaluation context', { escrow: escrowPdaStr.slice(0, 8) });

  const escrowPda = new PublicKey(escrowPdaStr);

  // Fetch escrow account with retry
  const agreement = await withRetry(
    () => fetchAgreementAccount(connection, escrowPda),
    'fetchAgreement'
  );

  // Fetch agent and provider identities in parallel
  const [agentIdentity, providerIdentity, agentReputation, providerReputation] =
    await Promise.all([
      withRetry(
        () => fetchAgentIdentity(connection, programId, agreement.agent),
        'fetchAgentIdentity'
      ).catch(() => null),
      withRetry(
        () => fetchAgentIdentity(connection, programId, agreement.api),
        'fetchProviderIdentity'
      ).catch(() => null),
      withRetry(
        () => fetchReputation(connection, programId, agreement.agent),
        'fetchAgentReputation'
      ).catch(() => null),
      withRetry(
        () => fetchReputation(connection, programId, agreement.api),
        'fetchProviderReputation'
      ).catch(() => null),
    ]);

  const context: EvaluationContext = {
    escrow: {
      pda: escrowPdaStr,
      amount: agreement.amount.toNumber() / 1e9,
      createdAt: agreement.createdAt.toNumber(),
      expiresAt: agreement.expiresAt.toNumber(),
      transactionId: agreement.transactionId,
      status: AGREEMENT_STATUS[agreement.status as keyof typeof AGREEMENT_STATUS] || 'Unknown',
    },

    agent: {
      pubkey: agreement.agent.toBase58(),
      reputation: agentIdentity?.reputation.toNumber() ?? 500,
      totalEscrows: agentIdentity?.totalEscrows.toNumber() ?? 0,
      disputeRate: calculateDisputeRate(agentIdentity, agentReputation),
    },

    provider: {
      pubkey: agreement.api.toBase58(),
      reputation: providerIdentity?.reputation.toNumber() ?? 500,
      totalEscrows: providerIdentity?.totalEscrows.toNumber() ?? 0,
      disputeRate: calculateDisputeRate(providerIdentity, providerReputation),
      averageQualityScore: providerReputation?.averageQualityReceived ?? 75,
    },

    service: {
      type: inferServiceType(agreement.transactionId),
      description: 'Service delivery agreement',
      slaTerms: ['Delivery within timelock period', 'Quality meets expectations'],
      deliveryProof: undefined,
    },

    evidence: {
      agentClaim: sanitizeForLLM('Agent disputed the escrow before expiration'),
      providerClaim: undefined,
      thirdPartyData: [],
    },
  };

  // Enrich with Helius data if available
  await enrichWithHeliusData(runtime, context);

  log.info('Context gathered successfully', {
    escrow: escrowPdaStr.slice(0, 8),
    amount: context.escrow.amount,
    status: context.escrow.status,
  });

  return context;
}

async function fetchAgreementAccount(
  connection: Connection,
  escrowPda: PublicKey
): Promise<AgreementAccount> {
  const accountInfo = await connection.getAccountInfo(escrowPda);

  if (!accountInfo) {
    throw new AccountNotFoundError(escrowPda.toBase58(), 'Agreement');
  }

  return deserializeAgreement(escrowPda.toBase58(), accountInfo.data);
}

function deserializeAgreement(address: string, data: Buffer): AgreementAccount {
  try {
    let offset = 8; // Skip discriminator

    const agent = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const api = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const amount = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const status = data[offset];
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const expiresAt = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    // String with 4-byte length prefix
    const transactionIdLen = data.readUInt32LE(offset);
    offset += 4;

    if (transactionIdLen > 64) {
      throw new Error(`Invalid transaction ID length: ${transactionIdLen}`);
    }

    const transactionId = data.slice(offset, offset + transactionIdLen).toString('utf8');
    offset += transactionIdLen;

    const bump = data[offset];
    offset += 1;

    // Optional quality score
    const hasQualityScore = data[offset] === 1;
    offset += 1;

    let qualityScore: number | null = null;
    if (hasQualityScore) {
      qualityScore = data[offset];
      offset += 1;
    }

    // Optional refund percentage
    const hasRefundPercentage = offset < data.length && data[offset] === 1;
    offset += 1;

    let refundPercentage: number | null = null;
    if (hasRefundPercentage && offset < data.length) {
      refundPercentage = data[offset];
      offset += 1;
    }

    // Oracle submissions (vector with 4-byte length prefix)
    const oracleSubmissions: AgreementAccount['oracleSubmissions'] = [];
    if (offset + 4 <= data.length) {
      const submissionsLen = data.readUInt32LE(offset);
      offset += 4;

      for (let i = 0; i < submissionsLen && offset + 41 <= data.length; i++) {
        const oracle = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;

        const score = data[offset];
        offset += 1;

        const submittedAt = new BN(data.slice(offset, offset + 8), 'le');
        offset += 8;

        oracleSubmissions.push({ oracle, qualityScore: score, submittedAt });
      }
    }

    return {
      agent,
      api,
      amount,
      status,
      createdAt,
      expiresAt,
      transactionId,
      bump,
      qualityScore,
      refundPercentage,
      oracleSubmissions,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DeserializationError(address, 'Agreement', msg);
  }
}

async function fetchAgentIdentity(
  connection: Connection,
  programId: PublicKey,
  owner: PublicKey
): Promise<AgentIdentityAccount | null> {
  const [identityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), owner.toBuffer()],
    programId
  );

  const accountInfo = await connection.getAccountInfo(identityPda);
  if (!accountInfo) return null;

  return deserializeAgentIdentity(identityPda.toBase58(), accountInfo.data);
}

function deserializeAgentIdentity(address: string, data: Buffer): AgentIdentityAccount {
  try {
    let offset = 8; // Skip discriminator

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // String with 4-byte length prefix
    const nameLen = data.readUInt32LE(offset);
    offset += 4;

    if (nameLen > 32) {
      throw new Error(`Invalid name length: ${nameLen}`);
    }

    const name = data.slice(offset, offset + nameLen).toString('utf8');
    offset += nameLen;

    const agentType = data[offset];
    offset += 1;

    const reputation = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const stakeAmount = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const isActive = data[offset] === 1;
    offset += 1;

    const createdAt = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const lastActive = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const totalEscrows = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const successfulEscrows = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const disputedEscrows = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const bump = data[offset];

    return {
      owner,
      name,
      agentType,
      reputation,
      stakeAmount,
      isActive,
      createdAt,
      lastActive,
      totalEscrows,
      successfulEscrows,
      disputedEscrows,
      bump,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DeserializationError(address, 'AgentIdentity', msg);
  }
}

async function fetchReputation(
  connection: Connection,
  programId: PublicKey,
  entity: PublicKey
): Promise<ReputationAccount | null> {
  const [reputationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('reputation'), entity.toBuffer()],
    programId
  );

  const accountInfo = await connection.getAccountInfo(reputationPda);
  if (!accountInfo) return null;

  return deserializeReputation(reputationPda.toBase58(), accountInfo.data);
}

function deserializeReputation(address: string, data: Buffer): ReputationAccount {
  try {
    let offset = 8; // Skip discriminator

    const entity = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const entityType = data[offset];
    offset += 1;

    const totalTransactions = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const disputesFiled = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const disputesWon = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const disputesPartial = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const disputesLost = new BN(data.slice(offset, offset + 8), 'le');
    offset += 8;

    const averageQualityReceived = data[offset];
    offset += 1;

    const reputationScore = data.readUInt16LE(offset);

    return {
      entity,
      entityType,
      totalTransactions,
      disputesFiled,
      disputesWon,
      disputesPartial,
      disputesLost,
      averageQualityReceived,
      reputationScore,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DeserializationError(address, 'Reputation', msg);
  }
}

function calculateDisputeRate(
  identity: AgentIdentityAccount | null,
  reputation: ReputationAccount | null
): number {
  if (reputation) {
    const total = reputation.totalTransactions.toNumber();
    if (total === 0) return 0;
    const disputes = reputation.disputesFiled.toNumber();
    return (disputes / total) * 100;
  }

  if (identity) {
    const total = identity.totalEscrows.toNumber();
    if (total === 0) return 0;
    const disputes = identity.disputedEscrows.toNumber();
    return (disputes / total) * 100;
  }

  return 0;
}

function inferServiceType(transactionId: string): string {
  const id = transactionId.toLowerCase();
  if (id.startsWith('api-') || id.includes('api')) return 'api_call';
  if (id.startsWith('data-') || id.includes('data')) return 'data_delivery';
  if (id.startsWith('compute-') || id.includes('compute')) return 'compute';
  if (id.startsWith('x402-') || id.includes('x402')) return 'x402_payment';
  return 'general_service';
}

async function enrichWithHeliusData(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<void> {
  const heliusKey = runtime.getSetting('HELIUS_API_KEY');
  if (!heliusKey) return;

  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${context.escrow.pda}/transactions?api-key=${heliusKey}&limit=10`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      log.warn('Helius API request failed', { status: response.status });
      return;
    }

    const txs = (await response.json()) as Array<{ signature: string; type?: string }>;
    context.evidence.thirdPartyData = txs.map(
      (tx) => `TX ${tx.signature.slice(0, 8)}: ${tx.type || 'unknown'}`
    );

    log.debug('Enriched context with Helius data', { txCount: txs.length });
  } catch (err) {
    log.warn('Failed to enrich with Helius data', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function hasAlreadyVoted(
  runtime: IAgentRuntime,
  escrowPda: string
): Promise<boolean> {
  const state = (await runtime.getState?.('oracle_state')) as
    | { votedDisputes?: string[] }
    | undefined;
  return state?.votedDisputes?.includes(escrowPda) ?? false;
}

export async function getOracleSubmissionCount(
  runtime: IAgentRuntime,
  escrowPdaStr: string
): Promise<number> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const escrowPda = new PublicKey(escrowPdaStr);

  try {
    const agreement = await fetchAgreementAccount(connection, escrowPda);
    return agreement.oracleSubmissions.length;
  } catch {
    return 0;
  }
}
