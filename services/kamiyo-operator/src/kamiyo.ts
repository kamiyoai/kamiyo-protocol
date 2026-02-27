import anchor, { type Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { AgentIdentity, AgentType, KamiyoClient } from '@kamiyo/sdk';

export type AgentIdentityState =
  | { exists: false; pda: PublicKey }
  | { exists: true; created: false; agent: AgentIdentity; pda: PublicKey }
  | { exists: true; created: true; signature: string; agent: AgentIdentity; pda: PublicKey };

export async function getOrCreateAgentIdentity(params: {
  connection: Connection;
  wallet: Wallet;
  name: string;
  agentType: AgentType;
  stakeSol: number;
  createIfMissing: boolean;
  programId?: PublicKey;
}): Promise<AgentIdentityState> {
  const client = new KamiyoClient({
    connection: params.connection,
    wallet: params.wallet,
    ...(params.programId ? { programId: params.programId } : {}),
  });
  const { BN } = anchor;

  const [pda] = client.getAgentPDA(params.wallet.publicKey);
  const existing = await client.getAgent(pda);

  if (existing) {
    return { exists: true, created: false, agent: existing, pda };
  }

  if (!params.createIfMissing) return { exists: false, pda };

  const lamports = Math.round(params.stakeSol * 1e9);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error('Invalid stakeSol');
  }

  const signature = await client.createAgent({
    name: params.name,
    agentType: params.agentType,
    stakeAmount: new BN(lamports),
  });

  const agent = await client.getAgent(pda);
  if (!agent) throw new Error('Agent creation confirmed but agent PDA not found');

  return { exists: true, created: true, signature, agent, pda };
}
