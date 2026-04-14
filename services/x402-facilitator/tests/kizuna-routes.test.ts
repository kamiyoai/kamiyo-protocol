import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { clearConfigCache } from '../src/config';

const mockDecodePaymentHeader = vi.fn();
const mockVerifyPaymentAuth = vi.fn();
const mockIsPaymentFresh = vi.fn();
const mockParsePaymentScheme = vi.fn();

const mockGetKizunaAccount = vi.fn();
const mockGetKizunaReservationByNonce = vi.fn();
const mockGetKizunaUnderwriteSnapshot = vi.fn();
const mockGetKizunaOutstandingMicro = vi.fn();
const mockGetKizunaEnterpriseBalance = vi.fn();
const mockGetKizunaBillableSettlementEvent = vi.fn();
const mockGetKizunaDebtByReservationId = vi.fn();
const mockGetSettlementById = vi.fn();
const mockGetKizunaMandateLimits = vi.fn();
const mockEvaluateKizunaKernelDecision = vi.fn();
const mockCommitKizunaKernelDecision = vi.fn();
const mockBuildKizunaIdentityPayload = vi.fn();
const mockGetAuthorizedRegistryWallet = vi.fn();

vi.mock('../src/services/signature', () => ({
  decodePaymentHeader: mockDecodePaymentHeader,
  verifyPaymentAuth: mockVerifyPaymentAuth,
  isPaymentFresh: mockIsPaymentFresh,
  parsePaymentScheme: mockParsePaymentScheme,
}));

vi.mock('../src/protocol/networks', () => ({
  canonicalizeNetwork: (value: string) => value,
  isSupportedNetwork: () => true,
  BASE_MAINNET_CAIP2: 'eip155:8453',
  SOLANA_MAINNET_CAIP2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  isValidPayerForNetwork: () => true,
}));

vi.mock('../src/services/base-settlement', () => ({
  BASE_USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48',
  getBaseProvider: vi.fn(),
  getBaseUsdcEip712Domain: vi.fn(() => ({
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48',
  })),
  settleAuthorizedPaymentBase: vi.fn(),
  settleDelegatedPaymentBase: vi.fn(),
  settlePaymentBase: vi.fn(),
  getBaseFacilitatorAddress: vi.fn(() => '0x1111111111111111111111111111111111111111'),
  getBaseUsdcAllowanceMicro: vi.fn(),
  getBaseUsdcBalanceForAddress: vi.fn(),
  getBaseUsdcBalanceMicroForAddress: vi.fn(),
  isBaseEnabled: () => true,
}));

vi.mock('../src/services/settlement', () => ({
  settlePayment: vi.fn(),
  toBaseUnits: vi.fn(),
  getUsdcBalance: vi.fn(),
}));

vi.mock('../src/services/solana-session', () => ({
  getUsdcDelegateState: vi.fn(),
  settleDelegatedUsdcTransfer: vi.fn(),
}));

vi.mock('../src/services/session', () => ({
  hashSessionToken: vi.fn(),
  parseSessionPaymentHeader: vi.fn(),
}));

vi.mock('../src/services/reputation', () => ({
  calculateFeeDiscountPct: vi.fn(() => 0),
  applyDiscount: vi.fn((bps: number) => bps),
  calculateReputationScore: vi.fn(() => 500),
}));

vi.mock('../src/services/kizuna-wallet-control-plane', () => ({
  getKizunaMandateLimits: mockGetKizunaMandateLimits,
  syncKizunaMandate: vi.fn(),
}));

vi.mock('../src/services/kizuna-underwrite', () => ({
  runKizunaUnderwrite: vi.fn(),
}));

vi.mock('../src/services/kizuna-kernel', async () => {
  const actual = await vi.importActual<typeof import('../src/services/kizuna-kernel')>(
    '../src/services/kizuna-kernel'
  );
  return {
    ...actual,
    evaluateKizunaKernelDecision: mockEvaluateKizunaKernelDecision,
    commitKizunaKernelDecision: mockCommitKizunaKernelDecision,
    ingestKizunaKernelRepayment: vi.fn(),
    ingestKizunaKernelCollateral: vi.fn(),
  };
});

vi.mock('../src/services/agent-registry', () => ({
  buildKizunaIdentityPayload: mockBuildKizunaIdentityPayload,
  getAuthorizedRegistryWallet: mockGetAuthorizedRegistryWallet,
  resolveAgentRegistryIdentity: vi.fn(),
  isLegacyIdentityAllowed: vi.fn(),
}));

vi.mock('../src/db/queries', () => ({
  createKizunaReservation: vi.fn(),
  getKizunaAccount: mockGetKizunaAccount,
  getKizunaOutstandingMicro: mockGetKizunaOutstandingMicro,
  getKizunaEnterpriseBalance: mockGetKizunaEnterpriseBalance,
  getKizunaReservationByNonce: mockGetKizunaReservationByNonce,
  getKizunaUnderwriteSnapshot: mockGetKizunaUnderwriteSnapshot,
  insertKizunaUnderwriteDecision: vi.fn(),
  getPaymentSessionByTokenHash: vi.fn(),
  getKizunaCollateralPosition: vi.fn(),
  getKizunaCollateralSummary: vi.fn(),
  getKizunaFastpathPool: vi.fn(),
  insertSettlement: vi.fn(),
  updateSettlementConfirmed: vi.fn(),
  updateSettlementStatus: vi.fn(),
  insertFeeLedger: vi.fn(),
  getSettlementStats: vi.fn(),
  getWalletDisputeStats: vi.fn(),
  getWalletAverageQuality: vi.fn(),
  getMonthlyVolume: vi.fn(),
  reservePaymentNonce: vi.fn(),
  getPaymentNonceGuard: vi.fn(),
  setPaymentNonceSettlementId: vi.fn(),
  setPaymentNonceTxHash: vi.fn(),
  deletePaymentNonceGuard: vi.fn(),
  getSettlementById: mockGetSettlementById,
  reservePaymentSessionSpend: vi.fn(),
  releasePaymentSessionSpend: vi.fn(),
  finalizeKizunaSettlement: vi.fn(),
  getKizunaBillableSettlementEvent: mockGetKizunaBillableSettlementEvent,
  getKizunaDebtByReservationId: mockGetKizunaDebtByReservationId,
  releaseKizunaReservation: vi.fn(),
}));

function setBaseEnv(): void {
  process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  process.env.FACILITATOR_PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
  process.env.TREASURY_WALLET = '11111111111111111111111111111111';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

  process.env.KIZUNA_ENABLED = 'true';
  process.env.KIZUNA_SHADOW_MODE = 'false';
  process.env.KIZUNA_INTERNAL_TOKEN = 'token';
  process.env.WALLET_CONTROL_PLANE_URL = 'https://wcp.local';
  process.env.CREDITS_INTERNAL_URL = 'https://credits.local';
  process.env.KIZUNA_KERNEL_URL = 'https://kernel.local';
  process.env.KIZUNA_KERNEL_FAIL_CLOSED = 'true';
  process.env.KIZUNA_KERNEL_SIGNING_KEYS = JSON.stringify({ kid1: 'secret-1' });
  process.env.KIZUNA_ENTERPRISE_POOL_ID = 'enterprise-main';
  process.env.KIZUNA_FASTPATH_POOL_ID = 'fastpath-main';
  process.env.KIZUNA_ENTERPRISE_REQUIRE_PREFUND = 'true';
  process.env.KIZUNA_SECURED_ONLY = 'false';
}

type InvokeResult = {
  statusCode: number;
  body: any;
};

async function invokePost(
  router: any,
  body: Record<string, unknown>,
  extras?: Record<string, unknown>
): Promise<InvokeResult> {
  const layer = router.stack.find((entry: any) => entry.route?.path === '/' && entry.route?.methods?.post);
  if (!layer) throw new Error('post_route_not_found');

  const handler = layer.route.stack[0].handle;

  return new Promise<InvokeResult>((resolve, reject) => {
    const req: any = {
      body,
      params: {},
      query: {},
      ...extras,
    };

    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
    };

    Promise.resolve(handler(req, res, (err: unknown) => {
      if (err) reject(err);
    })).catch(reject);
  });
}

describe('kizuna route invariants', () => {
  beforeEach(() => {
    setBaseEnv();
    clearConfigCache();
    vi.clearAllMocks();

    mockParsePaymentScheme.mockReturnValue({ scheme: 'exact', network: 'eip155:8453' });
    mockDecodePaymentHeader.mockReturnValue({
      signature: 'sig',
      payer: '0x1111111111111111111111111111111111111111',
      timestamp: Date.now(),
      nonce: 'nonce-1',
      resource: '/resource',
      amount: '1',
      authSignature: 'auth',
    });
    mockVerifyPaymentAuth.mockReturnValue(true);
    mockIsPaymentFresh.mockReturnValue(true);
    mockGetKizunaMandateLimits.mockResolvedValue({ caps: { singleMicro: '5000000' } });
    mockGetKizunaEnterpriseBalance.mockResolvedValue({
      agent_id: 'agent-1',
      pool_id: 'enterprise-main',
      available_micro: '100000000',
      reserved_micro: '0',
      spent_micro: '0',
      updated_at: new Date(),
    });
    mockGetKizunaBillableSettlementEvent.mockResolvedValue(null);
    mockGetKizunaAccount.mockResolvedValue({
      id: 'acc-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      repay_wallet: '0x2222222222222222222222222222222222222222',
      passport_address: null,
      networks: ['base'],
      mandate_single_limit_micro: '5000000',
      mandate_daily_limit_micro: null,
      mandate_monthly_limit_micro: null,
      mandate_human_approval_micro: null,
      registry_sync_source: '8004-solana',
      registry_active: true,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockBuildKizunaIdentityPayload.mockResolvedValue({
      mode: 'registry',
      synced: true,
      globalId: 'agent-1',
      name: 'Agent One',
      description: 'Kizuna test agent',
      imageUri: null,
      ownerWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      operationalWallet: '0x1111111111111111111111111111111111111111',
      authorizedWallet: '0x1111111111111111111111111111111111111111',
      payerWallet: '0x1111111111111111111111111111111111111111',
      agentUri: 'ipfs://agent-one',
      active: true,
      services: [],
      supportedTrust: ['reputation'],
      feedbackSummary: {
        averageScore: 98,
        totalFeedbacks: 12,
        positiveCount: 12,
        negativeCount: 0,
        nextFeedbackIndex: 12,
      },
      syncSource: '8004-solana',
      syncedAt: new Date().toISOString(),
      compatibleMetadata: null,
    });
    mockGetAuthorizedRegistryWallet.mockReturnValue('0x1111111111111111111111111111111111111111');
  });

  it('fails verify when identity is not synced', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    mockBuildKizunaIdentityPayload.mockResolvedValue(null);

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'enterprise',
          },
        },
      },
    });

    expect(result.statusCode).toBe(409);
    expect(result.body.invalidReason).toBe('kizuna_identity_unsynced');
  });

  it('fails verify when payer does not match the registered agent wallet', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    mockGetAuthorizedRegistryWallet.mockReturnValue('0x3333333333333333333333333333333333333333');

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'enterprise',
          },
        },
      },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.invalidReason).toBe('kizuna_identity_wallet_mismatch');
  });

  it('rejects cross-lane replay on verify', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'resv-1',
      decision_id: 'dec-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      request_nonce: 'nonce-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      amount_micro: '1000000',
      status: 'reserved',
      expires_at: new Date(Date.now() + 60_000),
      settlement_id: null,
      tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      decision: {
        id: 'dec-1',
        agent_id: 'agent-1',
        payer_wallet: '0x1111111111111111111111111111111111111111',
        repay_wallet: '0x2222222222222222222222222222222222222222',
        request_nonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        pool_id: 'enterprise-main',
        requested_micro: '1000000',
        approved: true,
        approved_micro: '1000000',
        available_micro: '1000000',
        outstanding_micro: '0',
        score_raw: 600,
        reason_codes: ['approved'],
        tier: 'standard',
        policy_pack_id: 'policy',
        risk_band: 'medium',
        ltv_bps: null,
        health_factor: null,
        decision_envelope_hash: null,
        created_at: new Date(),
      },
    });

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'crypto-fast',
            collateralAccount: '0xCA11A7E0',
            poolId: 'fastpath-main',
          },
        },
      },
    });

    expect(result.statusCode).toBe(409);
    expect(result.body.invalidReason).toBe('kizuna_cross_lane_replay');
  });

  it('fails closed on kernel timeout in verify', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    mockGetKizunaReservationByNonce.mockResolvedValue(null);
    mockGetKizunaUnderwriteSnapshot.mockResolvedValue({
      accountCreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000),
      settlementsConfirmed: 5,
      disputesFiled: 1,
      disputesWon: 1,
      avgQuality: 80,
      debtsTotal: 2,
      debtsClosed: 2,
      latestActivityAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    mockGetKizunaOutstandingMicro.mockResolvedValue(0n);
    mockEvaluateKizunaKernelDecision.mockRejectedValue(new Error('kizuna_kernel_timeout'));

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'enterprise',
          },
        },
      },
    });

    expect(result.statusCode).toBe(503);
    expect(result.body.invalidReason).toBe('kizuna_kernel_unavailable');
  });

  it('denies enterprise verify when prefund is insufficient', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    mockGetKizunaReservationByNonce.mockResolvedValue(null);
    mockGetKizunaUnderwriteSnapshot.mockResolvedValue({
      accountCreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000),
      settlementsConfirmed: 5,
      disputesFiled: 1,
      disputesWon: 1,
      avgQuality: 80,
      debtsTotal: 2,
      debtsClosed: 2,
      latestActivityAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    mockGetKizunaOutstandingMicro.mockResolvedValue(0n);
    mockGetKizunaEnterpriseBalance.mockResolvedValue({
      agent_id: 'agent-1',
      pool_id: 'enterprise-main',
      available_micro: '0',
      reserved_micro: '0',
      spent_micro: '0',
      updated_at: new Date(),
    });

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'enterprise',
          },
        },
      },
    });

    expect(result.statusCode).toBe(409);
    expect(result.body.invalidReason).toBe('kizuna_prefund_insufficient');
  });

  it('blocks enterprise lane in secured-only mode', async () => {
    process.env.KIZUNA_SECURED_ONLY = 'true';
    clearConfigCache();

    const { createVerifyRouter } = await import('../src/routes/verify');

    mockGetKizunaReservationByNonce.mockResolvedValue(null);

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);

    const result = await invokePost(router, {
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-1',
            repayWallet: '0x2222222222222222222222222222222222222222',
            lane: 'enterprise',
          },
        },
      },
    });

    expect(result.statusCode).toBe(403);
    expect(result.body.invalidReason).toBe('kizuna_lane_disabled');
  });

  it('rejects tampered decision envelope on settle', async () => {
    const { createSettleRouter } = await import('../src/routes/settle');
    const { hashKizunaDecisionEnvelope } = await import('../src/services/kizuna-kernel');
    const { mintLegacyDecisionEnvelope } = await import('./helpers/kizuna-envelopes');

    const envelope = mintLegacyDecisionEnvelope(
      {
        decisionId: 'dec-1',
        agentId: 'agent-1',
        payerWallet: '0x1111111111111111111111111111111111111111',
        requestNonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        poolId: 'enterprise-main',
        approvedMicro: '1000000',
        policyPackId: 'policy-v1',
        riskBand: 'medium',
      },
      'secret-1'
    );

    const tamperedEnvelope = {
      ...envelope!,
      payload: {
        ...envelope!.payload,
        approvedMicro: '2000000',
      },
    };

    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'resv-1',
      decision_id: 'dec-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      request_nonce: 'nonce-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      amount_micro: '1000000',
      status: 'reserved',
      expires_at: new Date(Date.now() + 60_000),
      settlement_id: null,
      tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      decision: {
        id: 'dec-1',
        agent_id: 'agent-1',
        payer_wallet: '0x1111111111111111111111111111111111111111',
        repay_wallet: '0x2222222222222222222222222222222222222222',
        request_nonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        pool_id: 'enterprise-main',
        requested_micro: '1000000',
        approved: true,
        approved_micro: '1000000',
        available_micro: '1000000',
        outstanding_micro: '0',
        score_raw: 600,
        reason_codes: ['approved'],
        tier: 'standard',
        policy_pack_id: 'policy',
        risk_band: 'medium',
        ltv_bps: null,
        health_factor: null,
        decision_envelope_hash: hashKizunaDecisionEnvelope(envelope),
        created_at: new Date(),
      },
    });

    const router = createSettleRouter({} as any, Keypair.generate());

    const result = await invokePost(
      router,
      {
        paymentHeader: 'exact:eip155:8453:Zm9v',
        paymentRequirements: {
          network: 'eip155:8453',
          amount: '1000000',
          payTo: '0x9999999999999999999999999999999999999999',
          extra: {
            kizuna: {
              mode: 'credit',
              agentId: 'agent-1',
              repayWallet: '0x2222222222222222222222222222222222222222',
              lane: 'enterprise',
              poolId: 'enterprise-main',
              decisionEnvelope: tamperedEnvelope,
            },
          },
        },
      },
      { merchantWallet: '0x9999999999999999999999999999999999999999' }
    );

    expect(result.statusCode).toBe(400);
    expect(result.body.errorReason).toBe('kizuna_envelope_invalid');
  });

  it('rejects cross-lane replay on settle', async () => {
    const { createSettleRouter } = await import('../src/routes/settle');

    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'resv-1',
      decision_id: 'dec-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      request_nonce: 'nonce-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      amount_micro: '1000000',
      status: 'reserved',
      expires_at: new Date(Date.now() + 60_000),
      settlement_id: null,
      tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      decision: {
        id: 'dec-1',
        agent_id: 'agent-1',
        payer_wallet: '0x1111111111111111111111111111111111111111',
        repay_wallet: '0x2222222222222222222222222222222222222222',
        request_nonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        pool_id: 'enterprise-main',
        requested_micro: '1000000',
        approved: true,
        approved_micro: '1000000',
        available_micro: '1000000',
        outstanding_micro: '0',
        score_raw: 600,
        reason_codes: ['approved'],
        tier: 'standard',
        policy_pack_id: 'policy',
        risk_band: 'medium',
        ltv_bps: null,
        health_factor: null,
        decision_envelope_hash: null,
        created_at: new Date(),
      },
    });

    const router = createSettleRouter({} as any, Keypair.generate());

    const result = await invokePost(
      router,
      {
        paymentHeader: 'exact:eip155:8453:Zm9v',
        paymentRequirements: {
          network: 'eip155:8453',
          amount: '1000000',
          payTo: '0x9999999999999999999999999999999999999999',
          extra: {
            kizuna: {
              mode: 'credit',
              agentId: 'agent-1',
              repayWallet: '0x2222222222222222222222222222222222222222',
              lane: 'crypto-fast',
              collateralAccount: '0xCA11A7E0',
              poolId: 'fastpath-main',
            },
          },
        },
      },
      { merchantWallet: '0x9999999999999999999999999999999999999999' }
    );

    expect(result.statusCode).toBe(409);
    expect(result.body.errorReason).toBe('kizuna_cross_lane_replay');
  });

  it('fails closed when kernel commit fails on consumed settlement replay', async () => {
    const { createSettleRouter } = await import('../src/routes/settle');

    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'resv-1',
      decision_id: 'dec-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      request_nonce: 'nonce-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      amount_micro: '1000000',
      status: 'consumed',
      expires_at: new Date(Date.now() + 60_000),
      settlement_id: 'settle-1',
      tx_hash: '0xabc',
      created_at: new Date(),
      updated_at: new Date(),
      decision: {
        id: 'dec-1',
        agent_id: 'agent-1',
        payer_wallet: '0x1111111111111111111111111111111111111111',
        repay_wallet: '0x2222222222222222222222222222222222222222',
        request_nonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        pool_id: 'enterprise-main',
        requested_micro: '1000000',
        approved: true,
        approved_micro: '1000000',
        available_micro: '1000000',
        outstanding_micro: '1000000',
        score_raw: 600,
        reason_codes: ['approved'],
        tier: 'standard',
        policy_pack_id: 'policy',
        risk_band: 'medium',
        ltv_bps: null,
        health_factor: null,
        decision_envelope_hash: null,
        created_at: new Date(),
      },
    });
    mockGetKizunaDebtByReservationId.mockResolvedValue({
      id: 'debt-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      repay_wallet: '0x2222222222222222222222222222222222222222',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      settlement_id: 'settle-1',
      decision_id: 'dec-1',
      reservation_id: 'resv-1',
      decision_envelope_hash: null,
      principal_micro: '1000000',
      outstanding_micro: '1000000',
      status: 'open',
      tx_hash: '0xabc',
      created_at: new Date(),
      updated_at: new Date(),
      closed_at: null,
    });
    mockCommitKizunaKernelDecision.mockRejectedValue(new Error('kizuna_kernel_timeout'));

    const router = createSettleRouter({} as any, Keypair.generate());
    const result = await invokePost(
      router,
      {
        paymentHeader: 'exact:eip155:8453:Zm9v',
        paymentRequirements: {
          network: 'eip155:8453',
          amount: '1000000',
          payTo: '0x9999999999999999999999999999999999999999',
          extra: {
            kizuna: {
              mode: 'credit',
              agentId: 'agent-1',
              repayWallet: '0x2222222222222222222222222222222222222222',
              lane: 'enterprise',
              poolId: 'enterprise-main',
            },
          },
        },
      },
      { merchantWallet: '0x9999999999999999999999999999999999999999' }
    );

    expect(result.statusCode).toBe(503);
    expect(result.body.errorReason).toBe('kizuna_kernel_unavailable');
  });

  it('allows consumed replay response in shadow mode when kernel commit fails', async () => {
    process.env.KIZUNA_SHADOW_MODE = 'true';
    clearConfigCache();

    const { createSettleRouter } = await import('../src/routes/settle');

    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'resv-1',
      decision_id: 'dec-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      request_nonce: 'nonce-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      amount_micro: '1000000',
      status: 'consumed',
      expires_at: new Date(Date.now() + 60_000),
      settlement_id: 'settle-1',
      tx_hash: '0xabc',
      created_at: new Date(),
      updated_at: new Date(),
      decision: {
        id: 'dec-1',
        agent_id: 'agent-1',
        payer_wallet: '0x1111111111111111111111111111111111111111',
        repay_wallet: '0x2222222222222222222222222222222222222222',
        request_nonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        pool_id: 'enterprise-main',
        requested_micro: '1000000',
        approved: true,
        approved_micro: '1000000',
        available_micro: '1000000',
        outstanding_micro: '1000000',
        score_raw: 600,
        reason_codes: ['approved'],
        tier: 'standard',
        policy_pack_id: 'policy',
        risk_band: 'medium',
        ltv_bps: null,
        health_factor: null,
        decision_envelope_hash: null,
        created_at: new Date(),
      },
    });
    mockGetKizunaDebtByReservationId.mockResolvedValue({
      id: 'debt-1',
      agent_id: 'agent-1',
      payer_wallet: '0x1111111111111111111111111111111111111111',
      repay_wallet: '0x2222222222222222222222222222222222222222',
      network: 'eip155:8453',
      lane: 'enterprise',
      pool_id: 'enterprise-main',
      settlement_id: 'settle-1',
      decision_id: 'dec-1',
      reservation_id: 'resv-1',
      decision_envelope_hash: null,
      principal_micro: '1000000',
      outstanding_micro: '1000000',
      status: 'open',
      tx_hash: '0xabc',
      created_at: new Date(),
      updated_at: new Date(),
      closed_at: null,
    });
    mockGetSettlementById.mockResolvedValue({ fee_amount: '0' });
    mockCommitKizunaKernelDecision.mockRejectedValue(new Error('kizuna_kernel_timeout'));

    const router = createSettleRouter({} as any, Keypair.generate());
    const result = await invokePost(
      router,
      {
        paymentHeader: 'exact:eip155:8453:Zm9v',
        paymentRequirements: {
          network: 'eip155:8453',
          amount: '1000000',
          payTo: '0x9999999999999999999999999999999999999999',
          extra: {
            kizuna: {
              mode: 'credit',
              agentId: 'agent-1',
              repayWallet: '0x2222222222222222222222222222222222222222',
              lane: 'enterprise',
              poolId: 'enterprise-main',
            },
          },
        },
      },
      { merchantWallet: '0x9999999999999999999999999999999999999999' }
    );

    expect(result.statusCode).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.idempotent).toBe(true);
    expect(result.body.extensions.kizuna.kernelCommitted).toBe(false);
    expect(result.body.extensions.kizuna.kernelCommitError).toContain('kizuna_kernel_timeout');
  });
});
