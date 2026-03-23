import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PolicyPack } from '../policy/index.js';
import { query, queryOne, withTransaction } from './pool.js';

export type DecisionRow = {
  decision_id: string;
  payer_wallet: string;
  request_nonce: string;
  request_hash: string;
  agent_id: string;
  repay_wallet: string;
  network: string;
  lane: 'enterprise' | 'crypto-fast';
  pool_id: string;
  requested_micro: string;
  approved: boolean;
  approved_micro: string;
  available_micro: string;
  outstanding_micro: string;
  score_raw: number;
  reason_codes: string[];
  tier: string;
  policy_pack_id: string;
  policy_pack_version: string;
  risk_level: string;
  risk_action: 'none' | 'freeze' | 'throttle' | 'unfreeze';
  signing_kid: string | null;
  envelope_version: string | null;
  envelope: unknown;
  status: 'evaluated' | 'committed';
  settlement_id: string | null;
  debt_id: string | null;
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ActiveRiskActionRow = {
  id: string;
  entity_type: string;
  entity_key: string;
  lane: 'enterprise' | 'crypto-fast';
  pool_id: string;
  action: 'freeze' | 'throttle' | 'unfreeze';
  reason: string;
  source: string;
  status: 'active' | 'resolved';
  metadata: unknown;
  created_at: Date;
  resolved_at: Date | null;
};

function asTextMicro(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`invalid_micro_value:${value}`);
  }
  return trimmed;
}

export async function upsertPolicyPack(pack: PolicyPack): Promise<void> {
  await query(
    `INSERT INTO policy_packs (id, version, lane, body)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id, version) DO UPDATE
     SET lane = EXCLUDED.lane,
         body = EXCLUDED.body,
         updated_at = NOW()`,
    [pack.id, pack.version, pack.lane, JSON.stringify(pack)]
  );
}

export async function activatePolicyPack(params: {
  lane: 'enterprise' | 'crypto-fast';
  policyPackId: string;
  policyPackVersion: string;
  activatedBy: string;
}): Promise<void> {
  await query(
    `INSERT INTO policy_pack_activations (lane, policy_pack_id, policy_pack_version, activated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lane) DO UPDATE
     SET policy_pack_id = EXCLUDED.policy_pack_id,
         policy_pack_version = EXCLUDED.policy_pack_version,
         activated_by = EXCLUDED.activated_by,
         activated_at = NOW()`,
    [params.lane, params.policyPackId, params.policyPackVersion, params.activatedBy]
  );
}

export async function upsertSigningKey(params: {
  kid: string;
  publicKeyPem: string;
  backend: string;
}): Promise<void> {
  await query(
    `INSERT INTO signing_keys (kid, algorithm, backend, public_key_pem)
     VALUES ($1, 'ES256', $2, $3)
     ON CONFLICT (kid) DO UPDATE
     SET backend = EXCLUDED.backend,
         public_key_pem = EXCLUDED.public_key_pem,
         status = 'active',
         updated_at = NOW()`,
    [params.kid, params.backend, params.publicKeyPem]
  );
}

export async function getDecisionByNonce(
  payerWallet: string,
  requestNonce: string
): Promise<DecisionRow | null> {
  return queryOne<DecisionRow>(
    `SELECT
       decision_id,
       payer_wallet,
       request_nonce,
       request_hash,
       agent_id,
       repay_wallet,
       network,
       lane,
       pool_id,
       requested_micro::text,
       approved,
       approved_micro::text,
       available_micro::text,
       outstanding_micro::text,
       score_raw,
       reason_codes,
       tier,
       policy_pack_id,
       policy_pack_version,
       risk_level,
       risk_action,
       signing_kid,
       envelope_version,
       envelope,
       status,
       settlement_id,
       debt_id,
       tx_hash,
       created_at,
       updated_at
     FROM decision_ledger
     WHERE payer_wallet = $1 AND request_nonce = $2`,
    [payerWallet, requestNonce]
  );
}

export async function insertDecision(params: {
  decisionId: string;
  payerWallet: string;
  requestNonce: string;
  requestHash: string;
  agentId: string;
  repayWallet: string;
  network: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  requestedMicro: string;
  approved: boolean;
  approvedMicro: string;
  availableMicro: string;
  outstandingMicro: string;
  scoreRaw: number;
  reasonCodes: string[];
  tier: string;
  policyPackId: string;
  policyPackVersion: string;
  riskLevel: string;
  riskAction: 'none' | 'freeze' | 'throttle' | 'unfreeze';
  signingKid: string | null;
  envelopeVersion: string | null;
  envelope: unknown;
}): Promise<DecisionRow> {
  const rows = await query<DecisionRow>(
    `INSERT INTO decision_ledger (
       decision_id,
       payer_wallet,
       request_nonce,
       request_hash,
       agent_id,
       repay_wallet,
       network,
       lane,
       pool_id,
       requested_micro,
       approved,
       approved_micro,
       available_micro,
       outstanding_micro,
       score_raw,
       reason_codes,
       tier,
       policy_pack_id,
       policy_pack_version,
       risk_level,
       risk_action,
       signing_kid,
       envelope_version,
       envelope
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb
     )
     RETURNING
       decision_id,
       payer_wallet,
       request_nonce,
       request_hash,
       agent_id,
       repay_wallet,
       network,
       lane,
       pool_id,
       requested_micro::text,
       approved,
       approved_micro::text,
       available_micro::text,
       outstanding_micro::text,
       score_raw,
       reason_codes,
       tier,
       policy_pack_id,
       policy_pack_version,
       risk_level,
       risk_action,
       signing_kid,
       envelope_version,
       envelope,
       status,
       settlement_id,
       debt_id,
       tx_hash,
       created_at,
       updated_at`,
    [
      params.decisionId,
      params.payerWallet,
      params.requestNonce,
      params.requestHash,
      params.agentId,
      params.repayWallet,
      params.network,
      params.lane,
      params.poolId,
      asTextMicro(params.requestedMicro),
      params.approved,
      asTextMicro(params.approvedMicro),
      asTextMicro(params.availableMicro),
      asTextMicro(params.outstandingMicro),
      params.scoreRaw,
      params.reasonCodes,
      params.tier,
      params.policyPackId,
      params.policyPackVersion,
      params.riskLevel,
      params.riskAction,
      params.signingKid,
      params.envelopeVersion,
      JSON.stringify(params.envelope ?? null),
    ]
  );
  return rows[0];
}

export async function commitDecision(params: {
  decisionId: string;
  settlementId: string;
  debtId?: string;
  txHash: string;
}): Promise<void> {
  await query(
    `UPDATE decision_ledger
     SET settlement_id = $2,
         debt_id = $3,
         tx_hash = $4,
         status = 'committed',
         updated_at = NOW()
     WHERE decision_id = $1`,
    [params.decisionId, params.settlementId, params.debtId ?? null, params.txHash]
  );
}

export async function upsertRiskEntity(
  client: PoolClient,
  entityType: string,
  entityKey: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO risk_entities (entity_type, entity_key, metadata)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (entity_type, entity_key) DO UPDATE
     SET metadata = risk_entities.metadata || EXCLUDED.metadata,
         updated_at = NOW()`,
    [entityType, entityKey, JSON.stringify(metadata)]
  );
}

export async function touchRiskEdge(params: {
  client: PoolClient;
  fromType: string;
  fromKey: string;
  relation: string;
  toType: string;
  toKey: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await params.client.query(
    `INSERT INTO risk_edges (
       from_type,
       from_key,
       relation,
       to_type,
       to_key,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (from_type, from_key, relation, to_type, to_key) DO UPDATE
     SET seen_count = risk_edges.seen_count + 1,
         last_seen_at = NOW(),
         metadata = risk_edges.metadata || EXCLUDED.metadata`,
    [
      params.fromType,
      params.fromKey,
      params.relation,
      params.toType,
      params.toKey,
      JSON.stringify(params.metadata ?? {}),
    ]
  );
}

export async function incrementRiskCounter(params: {
  client: PoolClient;
  entityType: string;
  entityKey: string;
  metric: string;
  windowSeconds: number;
  at: Date;
  incrementBy?: number;
}): Promise<void> {
  const bucketStart = new Date(
    Math.floor(params.at.getTime() / (params.windowSeconds * 1000)) * params.windowSeconds * 1000
  );
  await params.client.query(
    `INSERT INTO risk_counters (
       entity_type,
       entity_key,
       metric,
       window_seconds,
       bucket_start,
       count,
       last_seen_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (entity_type, entity_key, metric, window_seconds, bucket_start) DO UPDATE
     SET count = risk_counters.count + EXCLUDED.count,
         last_seen_at = NOW()`,
    [
      params.entityType,
      params.entityKey,
      params.metric,
      params.windowSeconds,
      bucketStart.toISOString(),
      params.incrementBy ?? 1,
    ]
  );
}

export async function sumRiskCounter(params: {
  entityType: string;
  entityKey: string;
  metric: string;
  windowSeconds: number;
  since: Date;
}): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COALESCE(SUM(count), 0)::text AS count
     FROM risk_counters
     WHERE entity_type = $1
       AND entity_key = $2
       AND metric = $3
       AND window_seconds = $4
       AND bucket_start >= $5`,
    [params.entityType, params.entityKey, params.metric, params.windowSeconds, params.since.toISOString()]
  );
  return Number.parseInt(row?.count || '0', 10) || 0;
}

export async function countDistinctRiskEdgeTargets(params: {
  fromType: string;
  fromKey: string;
  relation: string;
  since: Date;
}): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM risk_edges
     WHERE from_type = $1
       AND from_key = $2
       AND relation = $3
       AND last_seen_at >= $4`,
    [params.fromType, params.fromKey, params.relation, params.since.toISOString()]
  );
  return Number.parseInt(row?.count || '0', 10) || 0;
}

export async function countDistinctRiskEdgeSources(params: {
  toType: string;
  toKey: string;
  relation: string;
  since: Date;
}): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM risk_edges
     WHERE to_type = $1
       AND to_key = $2
       AND relation = $3
       AND last_seen_at >= $4`,
    [params.toType, params.toKey, params.relation, params.since.toISOString()]
  );
  return Number.parseInt(row?.count || '0', 10) || 0;
}

export async function listActiveRiskActions(params: {
  entityType: string;
  entityKey: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
}): Promise<ActiveRiskActionRow[]> {
  return query<ActiveRiskActionRow>(
    `SELECT
       id,
       entity_type,
       entity_key,
       lane,
       pool_id,
       action,
       reason,
       source,
       status,
       metadata,
       created_at,
       resolved_at
     FROM risk_actions
     WHERE entity_type = $1
       AND entity_key = $2
       AND lane = $3
       AND pool_id = $4
       AND status = 'active'
     ORDER BY created_at DESC`,
    [params.entityType, params.entityKey, params.lane, params.poolId]
  );
}

export async function createRiskAction(params: {
  entityType: string;
  entityKey: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  action: 'freeze' | 'throttle' | 'unfreeze';
  reason: string;
  source: string;
  metadata?: Record<string, unknown>;
}): Promise<ActiveRiskActionRow> {
  if (params.action === 'unfreeze') {
    await query(
      `UPDATE risk_actions
       SET status = 'resolved',
           resolved_at = NOW(),
           metadata = risk_actions.metadata || $5::jsonb
       WHERE entity_type = $1
         AND entity_key = $2
         AND lane = $3
         AND pool_id = $4
         AND status = 'active'`,
      [params.entityType, params.entityKey, params.lane, params.poolId, JSON.stringify(params.metadata ?? {})]
    );
  }

  const existing = await queryOne<ActiveRiskActionRow>(
    `SELECT
       id,
       entity_type,
       entity_key,
       lane,
       pool_id,
       action,
       reason,
       source,
       status,
       metadata,
       created_at,
       resolved_at
     FROM risk_actions
     WHERE entity_type = $1
       AND entity_key = $2
       AND lane = $3
       AND pool_id = $4
       AND action = $5
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.entityType, params.entityKey, params.lane, params.poolId, params.action]
  );

  if (existing) {
    return existing;
  }

  const rows = await query<ActiveRiskActionRow>(
    `INSERT INTO risk_actions (
       entity_type,
       entity_key,
       lane,
       pool_id,
       action,
       reason,
       source,
       metadata
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING
       id,
       entity_type,
       entity_key,
       lane,
       pool_id,
       action,
       reason,
       source,
       status,
       metadata,
       created_at,
       resolved_at`,
    [
      params.entityType,
      params.entityKey,
      params.lane,
      params.poolId,
      params.action,
      params.reason,
      params.source,
      JSON.stringify(params.metadata ?? {}),
    ]
  );
  return rows[0];
}

export async function resolveRiskActions(params: {
  entityType: string;
  entityKey: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
}): Promise<void> {
  await query(
    `UPDATE risk_actions
     SET status = 'resolved',
         resolved_at = NOW()
     WHERE entity_type = $1
       AND entity_key = $2
       AND lane = $3
       AND pool_id = $4
       AND status = 'active'`,
    [params.entityType, params.entityKey, params.lane, params.poolId]
  );
}

export async function recordDecisionEvent(params: {
  payerWallet: string;
  requestNonce: string;
  requestHash: string;
  agentId: string;
  repayWallet: string;
  network: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  requestedMicro: string;
  approved: boolean;
  approvedMicro: string;
  availableMicro: string;
  outstandingMicro: string;
  scoreRaw: number;
  reasonCodes: string[];
  tier: string;
  policyPackId: string;
  policyPackVersion: string;
  riskLevel: string;
  riskAction: 'none' | 'freeze' | 'throttle' | 'unfreeze';
  signingKid: string | null;
  envelopeVersion: string | null;
  envelope: unknown;
}): Promise<DecisionRow> {
  return insertDecision({
    decisionId: `kz2:${randomUUID()}`,
    payerWallet: params.payerWallet,
    requestNonce: params.requestNonce,
    requestHash: params.requestHash,
    agentId: params.agentId,
    repayWallet: params.repayWallet,
    network: params.network,
    lane: params.lane,
    poolId: params.poolId,
    requestedMicro: params.requestedMicro,
    approved: params.approved,
    approvedMicro: params.approvedMicro,
    availableMicro: params.availableMicro,
    outstandingMicro: params.outstandingMicro,
    scoreRaw: params.scoreRaw,
    reasonCodes: params.reasonCodes,
    tier: params.tier,
    policyPackId: params.policyPackId,
    policyPackVersion: params.policyPackVersion,
    riskLevel: params.riskLevel,
    riskAction: params.riskAction,
    signingKid: params.signingKid,
    envelopeVersion: params.envelopeVersion,
    envelope: params.envelope,
  });
}

export async function recordRelationshipGraph(params: {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  network: string;
  collateralAccount?: string | null;
}): Promise<void> {
  const now = new Date();
  await withTransaction(async (client) => {
    await upsertRiskEntity(client, 'agent', params.agentId);
    await upsertRiskEntity(client, 'payer_wallet', params.payerWallet);
    await upsertRiskEntity(client, 'repay_wallet', params.repayWallet);
    await upsertRiskEntity(client, 'pool', params.poolId, { lane: params.lane });
    await upsertRiskEntity(client, 'network', params.network);
    if (params.collateralAccount) {
      await upsertRiskEntity(client, 'collateral_account', params.collateralAccount);
    }

    await touchRiskEdge({
      client,
      fromType: 'payer_wallet',
      fromKey: params.payerWallet,
      relation: 'funds_agent',
      toType: 'agent',
      toKey: params.agentId,
    });
    await touchRiskEdge({
      client,
      fromType: 'agent',
      fromKey: params.agentId,
      relation: 'repays_to',
      toType: 'repay_wallet',
      toKey: params.repayWallet,
    });
    await touchRiskEdge({
      client,
      fromType: 'agent',
      fromKey: params.agentId,
      relation: 'uses_pool',
      toType: 'pool',
      toKey: params.poolId,
    });
    await touchRiskEdge({
      client,
      fromType: 'agent',
      fromKey: params.agentId,
      relation: 'uses_network',
      toType: 'network',
      toKey: params.network,
    });
    if (params.collateralAccount) {
      await touchRiskEdge({
        client,
        fromType: 'agent',
        fromKey: params.agentId,
        relation: 'backs_with',
        toType: 'collateral_account',
        toKey: params.collateralAccount,
      });
    }

    for (const [entityType, entityKey, metric] of [
      ['agent', params.agentId, 'evaluate'],
      ['payer_wallet', params.payerWallet, 'evaluate'],
      ['pool', params.poolId, 'evaluate'],
    ] as const) {
      await incrementRiskCounter({
        client,
        entityType,
        entityKey,
        metric,
        windowSeconds: 3600,
        at: now,
      });
    }
  });
}

export async function recordInternalEvent(params: {
  entityType: string;
  entityKey: string;
  metric: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
  await withTransaction(async (client) => {
    await upsertRiskEntity(client, params.entityType, params.entityKey, params.metadata ?? {});
    await incrementRiskCounter({
      client,
      entityType: params.entityType,
      entityKey: params.entityKey,
      metric: params.metric,
      windowSeconds: 86_400,
      at: now,
    });
    await touchRiskEdge({
      client,
      fromType: params.entityType,
      fromKey: params.entityKey,
      relation: 'observed_in',
      toType: 'pool',
      toKey: params.poolId,
      metadata: params.metadata,
    });
  });
}
