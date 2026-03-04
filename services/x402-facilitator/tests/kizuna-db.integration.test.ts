import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../src/config';
import { runMigrations } from '../src/db/migrate';
import {
  applyKizunaCollateralEvent,
  applyKizunaRepayment,
  createKizunaReservation,
  finalizeKizunaSettlement,
  getKizunaCollateralSummary,
  getKizunaDebtBySettlementId,
  getKizunaPoolReserve,
  getKizunaOutstandingMicro,
  insertKizunaUnderwriteDecision,
  insertSettlement,
  upsertKizunaAccount,
} from '../src/db/queries';
import { closePool, query, queryOne } from '../src/db/pool';

const integrationDbUrl = process.env.KIZUNA_INTEGRATION_DATABASE_URL || process.env.DATABASE_URL;
const hasIntegrationDb = !!integrationDbUrl && /^postgres(ql)?:\/\//i.test(integrationDbUrl);

type ReservationFixture = {
  reservationId: string;
  settlementId: string;
  amountMicro: string;
};

function setDbEnv(): void {
  process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  process.env.FACILITATOR_PRIVATE_KEY =
    process.env.FACILITATOR_PRIVATE_KEY ||
    JSON.stringify(Array.from({ length: 64 }, (_, index) => index));
  process.env.TREASURY_WALLET = process.env.TREASURY_WALLET || '11111111111111111111111111111111';
  process.env.DATABASE_URL = integrationDbUrl!;
  process.env.KIZUNA_ENABLED = 'false';
  clearConfigCache();
}

async function resetTables(): Promise<void> {
  await query(`
    TRUNCATE TABLE
      kizuna_repayments,
      kizuna_debts,
      kizuna_credit_reservations,
      kizuna_underwrite_decisions,
      fee_ledger,
      settlements,
      kizuna_collateral_events,
      kizuna_health_snapshots,
      kizuna_risk_actions,
      kizuna_collateral_positions,
      kizuna_pool_reserves,
      kizuna_fastpath_pools,
      kizuna_collateral_assets,
      kizuna_accounts
    RESTART IDENTITY CASCADE
  `);

  await query(
    `INSERT INTO kizuna_collateral_assets (asset_id, symbol, chain, haircut_bps, volatility_buffer_bps, status)
     VALUES ('usdc', 'USDC', 'multi', 0, 0, 'active')
     ON CONFLICT (asset_id) DO NOTHING`
  );

  await query(
    `INSERT INTO kizuna_fastpath_pools (pool_id, status, ltv_cap_bps, reserve_ratio_bps, min_health_factor, max_single_micro)
     VALUES ('fastpath-main', 'active', 6500, 10000, 1.15, 5000000)
     ON CONFLICT (pool_id) DO NOTHING`
  );

  await query(
    `INSERT INTO kizuna_pool_reserves (pool_id, lane, reserved_micro, outstanding_micro, collateral_value_micro)
     VALUES
       ('enterprise-main', 'enterprise', 0, 0, 0),
       ('fastpath-main', 'crypto-fast', 0, 0, 0)
     ON CONFLICT (pool_id) DO NOTHING`
  );
}

async function seedAccount(agentId: string, payerWallet: string, repayWallet: string): Promise<void> {
  await upsertKizunaAccount({
    agentId,
    payerWallet,
    repayWallet,
    networks: ['base'],
    mandateSingleLimitMicro: '10000000',
  });
}

async function seedReservation(params: {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  nonce: string;
  lane: 'enterprise' | 'crypto-fast';
  poolId: string;
  amountMicro: string;
}): Promise<ReservationFixture> {
  const decision = await insertKizunaUnderwriteDecision({
    agentId: params.agentId,
    payerWallet: params.payerWallet,
    repayWallet: params.repayWallet,
    requestNonce: params.nonce,
    network: 'eip155:8453',
    lane: params.lane,
    poolId: params.poolId,
    requestedMicro: params.amountMicro,
    approved: true,
    approvedMicro: params.amountMicro,
    availableMicro: params.amountMicro,
    outstandingMicro: '0',
    scoreRaw: 650,
    reasonCodes: ['approved'],
    tier: 'standard',
    policyPackId: 'policy-v1',
    riskBand: 'medium',
    ltvBps: params.lane === 'crypto-fast' ? 3500 : null,
    healthFactor: params.lane === 'crypto-fast' ? '1.8' : null,
    decisionEnvelopeHash: params.nonce,
  });

  const reservation = await createKizunaReservation({
    decisionId: decision.id,
    agentId: params.agentId,
    payerWallet: params.payerWallet,
    requestNonce: params.nonce,
    network: 'eip155:8453',
    lane: params.lane,
    poolId: params.poolId,
    amountMicro: params.amountMicro,
    ttlMs: 120000,
  });

  const settlement = await insertSettlement(
    '0x9999999999999999999999999999999999999999',
    params.payerWallet,
    Number(BigInt(params.amountMicro)) / 1_000_000,
    0,
    'USDC',
    '',
    'pending',
    'eip155:8453'
  );

  return {
    reservationId: reservation.id,
    settlementId: settlement.id,
    amountMicro: params.amountMicro,
  };
}

describe.skipIf(!hasIntegrationDb)('kizuna db integration', () => {
  beforeAll(async () => {
    setDbEnv();
    await runMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    setDbEnv();
    await resetTables();
  });

  it('isolates pool reserves across enterprise and crypto-fast lanes', async () => {
    const agentId = 'agent-pool';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';

    await seedAccount(agentId, payer, repay);

    const enterpriseFixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-enterprise',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      amountMicro: '1000000',
    });

    const fastFixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-fast',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      amountMicro: '2000000',
    });

    const reservesAfterReserve = await Promise.all([
      getKizunaPoolReserve('enterprise-main'),
      getKizunaPoolReserve('fastpath-main'),
    ]);

    expect(reservesAfterReserve[0]?.reserved_micro).toBe('1000000');
    expect(reservesAfterReserve[0]?.outstanding_micro).toBe('0');
    expect(reservesAfterReserve[1]?.reserved_micro).toBe('2000000');
    expect(reservesAfterReserve[1]?.outstanding_micro).toBe('0');

    await finalizeKizunaSettlement({
      reservationId: enterpriseFixture.reservationId,
      settlementId: enterpriseFixture.settlementId,
      txHash: '0xenterprise',
      feeAmount: 0,
      feeTxHash: '0xenterprise',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      decisionEnvelopeHash: 'nonce-enterprise',
    });

    const reservesAfterEnterpriseSettle = await Promise.all([
      getKizunaPoolReserve('enterprise-main'),
      getKizunaPoolReserve('fastpath-main'),
    ]);

    expect(reservesAfterEnterpriseSettle[0]?.reserved_micro).toBe('0');
    expect(reservesAfterEnterpriseSettle[0]?.outstanding_micro).toBe('1000000');
    expect(reservesAfterEnterpriseSettle[1]?.reserved_micro).toBe('2000000');
    expect(reservesAfterEnterpriseSettle[1]?.outstanding_micro).toBe('0');

    await finalizeKizunaSettlement({
      reservationId: fastFixture.reservationId,
      settlementId: fastFixture.settlementId,
      txHash: '0xfast',
      feeAmount: 0,
      feeTxHash: '0xfast',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      decisionEnvelopeHash: 'nonce-fast',
    });

    const reservesAfterBothSettle = await Promise.all([
      getKizunaPoolReserve('enterprise-main'),
      getKizunaPoolReserve('fastpath-main'),
    ]);

    expect(reservesAfterBothSettle[0]?.reserved_micro).toBe('0');
    expect(reservesAfterBothSettle[0]?.outstanding_micro).toBe('1000000');
    expect(reservesAfterBothSettle[1]?.reserved_micro).toBe('0');
    expect(reservesAfterBothSettle[1]?.outstanding_micro).toBe('2000000');
  });

  it('creates exactly one debt per successful settlement', async () => {
    const agentId = 'agent-debt';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';

    await seedAccount(agentId, payer, repay);

    const fixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-debt-1',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      amountMicro: '1500000',
    });

    const debt = await finalizeKizunaSettlement({
      reservationId: fixture.reservationId,
      settlementId: fixture.settlementId,
      txHash: '0xdebt',
      feeAmount: 0,
      feeTxHash: '0xdebt',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      decisionEnvelopeHash: 'nonce-debt-1',
    });

    expect(debt.status).toBe('open');

    const persisted = await getKizunaDebtBySettlementId(fixture.settlementId);
    expect(persisted?.id).toBe(debt.id);

    const count = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM kizuna_debts
       WHERE settlement_id = $1`,
      [fixture.settlementId]
    );

    expect(count?.count).toBe('1');
  });

  it('applies repayments idempotently and scoped by lane/pool without negative balances', async () => {
    const agentId = 'agent-repay';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';

    await seedAccount(agentId, payer, repay);

    const enterpriseFixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-repay-enterprise',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      amountMicro: '2000000',
    });

    const fastFixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-repay-fast',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      amountMicro: '3000000',
    });

    await finalizeKizunaSettlement({
      reservationId: enterpriseFixture.reservationId,
      settlementId: enterpriseFixture.settlementId,
      txHash: '0xrepay-enterprise',
      feeAmount: 0,
      feeTxHash: '0xrepay-enterprise',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      decisionEnvelopeHash: 'nonce-repay-enterprise',
    });

    await finalizeKizunaSettlement({
      reservationId: fastFixture.reservationId,
      settlementId: fastFixture.settlementId,
      txHash: '0xrepay-fast',
      feeAmount: 0,
      feeTxHash: '0xrepay-fast',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      decisionEnvelopeHash: 'nonce-repay-fast',
    });

    const firstRepay = await applyKizunaRepayment({
      agentId,
      amountMicro: '1500000',
      source: 'credits',
      referenceId: 'repay-ref-1',
      lane: 'enterprise',
      poolId: 'enterprise-main',
    });

    expect(firstRepay.idempotent).toBe(false);
    expect(firstRepay.repayment.applied_micro).toBe('1500000');

    const duplicateRepay = await applyKizunaRepayment({
      agentId,
      amountMicro: '1500000',
      source: 'credits',
      referenceId: 'repay-ref-1',
      lane: 'enterprise',
      poolId: 'enterprise-main',
    });

    expect(duplicateRepay.idempotent).toBe(true);
    expect(duplicateRepay.repayment.applied_micro).toBe('1500000');

    const oversizedRepay = await applyKizunaRepayment({
      agentId,
      amountMicro: '9999999',
      source: 'credits',
      referenceId: 'repay-ref-2',
      lane: 'enterprise',
      poolId: 'enterprise-main',
    });

    expect(oversizedRepay.repayment.applied_micro).toBe('500000');
    expect(oversizedRepay.outstandingMicro).toBe('0');

    const enterpriseOutstanding = await getKizunaOutstandingMicro(agentId, {
      lane: 'enterprise',
      poolId: 'enterprise-main',
    });
    const fastOutstanding = await getKizunaOutstandingMicro(agentId, {
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
    });

    expect(enterpriseOutstanding.toString()).toBe('0');
    expect(fastOutstanding.toString()).toBe('3000000');

    const enterpriseReserve = await getKizunaPoolReserve('enterprise-main');
    const fastReserve = await getKizunaPoolReserve('fastpath-main');

    expect(enterpriseReserve?.outstanding_micro).toBe('0');
    expect(fastReserve?.outstanding_micro).toBe('3000000');
  });

  it('handles collateral events idempotently and enforces available-balance constraints', async () => {
    const agentId = 'agent-collateral';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';

    await seedAccount(agentId, payer, repay);

    const deposit = await applyKizunaCollateralEvent({
      agentId,
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      collateralAccount: '0xCA11A7E0',
      assetId: 'usdc',
      amountMicro: '5000000',
      eventType: 'deposit',
      referenceId: 'collateral-deposit-1',
      txHash: '0xdep',
    });

    expect(deposit.idempotent).toBe(false);
    expect(deposit.poolReserve.collateral_value_micro).toBe('5000000');

    const duplicateDeposit = await applyKizunaCollateralEvent({
      agentId,
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      collateralAccount: '0xCA11A7E0',
      assetId: 'usdc',
      amountMicro: '5000000',
      eventType: 'deposit',
      referenceId: 'collateral-deposit-1',
      txHash: '0xdep',
    });

    expect(duplicateDeposit.idempotent).toBe(true);
    expect(duplicateDeposit.poolReserve.collateral_value_micro).toBe('5000000');

    await expect(
      applyKizunaCollateralEvent({
        agentId,
        lane: 'crypto-fast',
        poolId: 'fastpath-main',
        collateralAccount: '0xCA11A7E0',
        assetId: 'usdc',
        amountMicro: '6000000',
        eventType: 'withdraw',
        referenceId: 'collateral-withdraw-too-much',
      })
    ).rejects.toThrow('kizuna_collateral_withdraw_insufficient_available');

    const withdraw = await applyKizunaCollateralEvent({
      agentId,
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      collateralAccount: '0xCA11A7E0',
      assetId: 'usdc',
      amountMicro: '2000000',
      eventType: 'withdraw',
      referenceId: 'collateral-withdraw-ok',
    });

    expect(withdraw.poolReserve.collateral_value_micro).toBe('3000000');

    const summary = await getKizunaCollateralSummary(agentId, 'fastpath-main');
    expect(summary?.effectiveCollateralMicro).toBe('3000000');
  });
});
