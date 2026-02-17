import { query, queryOne } from './pool.js';

export type AgentWalletKind = 'evm' | 'solana';

export type AgentWallet = {
  agent_id: string;
  kind: AgentWalletKind;
  address: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MandatePolicy = {
  passport_address: string;
  agent_id: string;
  kind: AgentWalletKind;
  mandate_version: number;
  policy_id: string;
  created_at: Date;
  updated_at: Date;
};

export async function upsertAgent(agentId: string): Promise<void> {
  await query(
    `INSERT INTO agents (agent_id)
     VALUES ($1)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId]
  );
}

export async function upsertAgentWallet(params: {
  agentId: string;
  kind: AgentWalletKind;
  address: string;
  name?: string | null;
}): Promise<AgentWallet> {
  const rows = await query<AgentWallet>(
    `INSERT INTO agent_wallets (agent_id, kind, address, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (agent_id, kind) DO UPDATE
     SET address = EXCLUDED.address,
         name = EXCLUDED.name,
         updated_at = NOW()
     RETURNING *`,
    [params.agentId, params.kind, params.address, params.name ?? null]
  );

  return rows[0];
}

export async function getAgentWallet(agentId: string, kind: AgentWalletKind): Promise<AgentWallet | null> {
  return queryOne<AgentWallet>(
    `SELECT * FROM agent_wallets
     WHERE agent_id = $1 AND kind = $2`,
    [agentId, kind]
  );
}

export async function listAgentWallets(agentId: string): Promise<AgentWallet[]> {
  return query<AgentWallet>(
    `SELECT * FROM agent_wallets
     WHERE agent_id = $1
     ORDER BY kind`,
    [agentId]
  );
}

export async function upsertEndUser(params: { userId: string; email: string }): Promise<void> {
  await query(
    `INSERT INTO end_users (user_id, email)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
    [params.userId, params.email]
  );
}

export async function upsertMandatePolicy(params: {
  passportAddress: string;
  agentId: string;
  kind: AgentWalletKind;
  mandateVersion: number;
  policyId: string;
}): Promise<MandatePolicy> {
  const rows = await query<MandatePolicy>(
    `INSERT INTO mandate_policies (passport_address, agent_id, kind, mandate_version, policy_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (passport_address, kind) DO UPDATE
     SET agent_id = EXCLUDED.agent_id,
         mandate_version = EXCLUDED.mandate_version,
         policy_id = EXCLUDED.policy_id,
         updated_at = NOW()
     RETURNING *`,
    [params.passportAddress, params.agentId, params.kind, params.mandateVersion, params.policyId]
  );

  return rows[0];
}

export async function getMandatePolicy(passportAddress: string, kind: AgentWalletKind): Promise<MandatePolicy | null> {
  return queryOne<MandatePolicy>(
    `SELECT * FROM mandate_policies\n     WHERE passport_address = $1 AND kind = $2`,
    [passportAddress, kind]
  );
}
