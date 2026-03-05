import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../src/config';
import { runMigrations } from '../src/db/migrate';
import {
  applyKizunaFundingEvent,
  applyKizunaCollateralEvent,
  applyKizunaRepayment,
  createKizunaReservation,
  getKizunaEnterpriseBalance,
  finalizeKizunaSettlement,
  getKizunaBillableSettlementEvent,
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
      kizuna_billable_settlement_events,
      kizuna_funding_events,
      kizuna_enterprise_balances,
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
     VALUES ('fastpath-main', 'active', 6000, 10000, 1.5, 2000000)
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
  fundingMode?: 'none' | 'prefunded' | 'collateralized';
  lockedMicro?: string;
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
    fundingMode: params.fundingMode,
    lockedMicro: params.lockedMicro,
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

    const result = await finalizeKizunaSettlement({
      reservationId: fixture.reservationId,
      settlementId: fixture.settlementId,
      txHash: '0xdebt',
      feeAmount: 0,
      feeTxHash: '0xdebt',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      decisionEnvelopeHash: 'nonce-debt-1',
    });
    const debt = result.debt;

    expect(debt?.status).toBe('open');

    const persisted = await getKizunaDebtBySettlementId(fixture.settlementId);
    expect(persisted?.id).toBe(debt?.id);

    const count = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM kizuna_debts
       WHERE settlement_id = $1`,
      [fixture.settlementId]
    );

    expect(count?.count).toBe('1');
  });

  it('consumes prefunded enterprise reservations without creating debt', async () => {
    const agentId = 'agent-prefund';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';
    const prefundMicro = '2000000';
    const settleMicro = '1200000';

    await seedAccount(agentId, payer, repay);
    await applyKizunaFundingEvent({
      agentId,
      lane: 'enterprise',
      poolId: 'enterprise-main',
      referenceId: 'prefund-1',
      eventType: 'deposit',
      amountMicro: prefundMicro,
      txHash: '0xprefund',
    });

    const fixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-prefund-1',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      amountMicro: settleMicro,
      fundingMode: 'prefunded',
      lockedMicro: settleMicro,
    });

    const balanceBefore = await getKizunaEnterpriseBalance(agentId, 'enterprise-main');
    expect(balanceBefore?.available_micro).toBe('800000');
    expect(balanceBefore?.reserved_micro).toBe('1200000');
    expect(balanceBefore?.spent_micro).toBe('0');

    const result = await finalizeKizunaSettlement({
      reservationId: fixture.reservationId,
      settlementId: fixture.settlementId,
      txHash: '0xprefund-settle',
      feeAmount: 0,
      feeTxHash: '0xprefund-settle',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      decisionEnvelopeHash: 'nonce-prefund-1',
    });

    expect(result.debt).toBeNull();
    expect(result.fundingConsumedMicro).toBe(settleMicro);

    const balanceAfter = await getKizunaEnterpriseBalance(agentId, 'enterprise-main');
    expect(balanceAfter?.available_micro).toBe('800000');
    expect(balanceAfter?.reserved_micro).toBe('0');
    expect(balanceAfter?.spent_micro).toBe('1200000');

    const reserveAfter = await getKizunaPoolReserve('enterprise-main');
    expect(reserveAfter?.reserved_micro).toBe('0');
    expect(reserveAfter?.outstanding_micro).toBe('0');

    const event = await getKizunaBillableSettlementEvent(fixture.reservationId, fixture.settlementId);
    expect(event?.debt_id).toBeNull();
  });

  it('emits exactly one billable settlement event keyed by reservation/settlement', async () => {
    const agentId = 'agent-billable';
    const payer = '0x1111111111111111111111111111111111111111';
    const repay = '0x2222222222222222222222222222222222222222';

    await seedAccount(agentId, payer, repay);

    const fixture = await seedReservation({
      agentId,
      payerWallet: payer,
      repayWallet: repay,
      nonce: 'nonce-billable-1',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      amountMicro: '1750000',
    });

    const result = await finalizeKizunaSettlement({
      reservationId: fixture.reservationId,
      settlementId: fixture.settlementId,
      txHash: '0xbillable',
      feeAmount: 0,
      feeTxHash: '0xbillable',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      decisionEnvelopeHash: 'nonce-billable-1',
    });
    const debt = result.debt;

    const event = await getKizunaBillableSettlementEvent(
      fixture.reservationId,
      fixture.settlementId
    );

    expect(event).toBeTruthy();
    expect(event?.debt_id).toBe(debt?.id);
    expect(event?.lane).toBe('crypto-fast');
    expect(event?.pool_id).toBe('fastpath-main');
    expect(event?.amount_micro).toBe('1750000');
    expect(event?.idempotency_key).toBe(`${fixture.reservationId}:${fixture.settlementId}`);

    await expect(
      finalizeKizunaSettlement({
        reservationId: fixture.reservationId,
        settlementId: fixture.settlementId,
        txHash: '0xbillable-retry',
        feeAmount: 0,
        feeTxHash: '0xbillable-retry',
        lane: 'crypto-fast',
        poolId: 'fastpath-main',
        decisionEnvelopeHash: 'nonce-billable-1',
      })
    ).rejects.toThrow('kizuna_reservation_consumed');

    const eventCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM kizuna_billable_settlement_events
       WHERE reservation_id = $1 AND settlement_id = $2`,
      [fixture.reservationId, fixture.settlementId]
    );

    expect(eventCount?.count).toBe('1');
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
