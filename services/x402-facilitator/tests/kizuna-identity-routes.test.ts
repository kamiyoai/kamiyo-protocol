import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { clearConfigCache } from '../src/config';

const AGENT_ID = '9xQeWvG816bUx9EPjHmaT23yvVM5mZAf5R2m1eJua6w';
const PAYER_WALLET = '0x1111111111111111111111111111111111111111';
const REPAY_WALLET = '0x2222222222222222222222222222222222222222';
const OWNER_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEXT_OPERATOR_WALLET = '0x3333333333333333333333333333333333333333';

const mockDecodePaymentHeader = vi.fn();
const mockVerifyPaymentAuth = vi.fn();
const mockIsPaymentFresh = vi.fn();
const mockParsePaymentScheme = vi.fn();

const mockCreateKizunaReservation = vi.fn();
const mockGetKizunaAccount = vi.fn();
const mockGetKizunaOutstandingMicro = vi.fn();
const mockGetKizunaEnterpriseBalance = vi.fn();
const mockGetKizunaReservationByNonce = vi.fn();
const mockGetKizunaUnderwriteSnapshot = vi.fn();
const mockGetKizunaFastpathPool = vi.fn();
const mockInsertKizunaUnderwriteDecision = vi.fn();
const mockUpsertKizunaAccount = vi.fn();

const mockResolveAgentRegistryIdentity = vi.fn();
const mockBuildKizunaIdentityPayload = vi.fn();
const mockGetAuthorizedRegistryWallet = vi.fn();
const mockIsLegacyIdentityAllowed = vi.fn();

const mockGetKizunaMandateLimits = vi.fn();
const mockSyncKizunaMandate = vi.fn();
const mockEvaluateKizunaKernelDecision = vi.fn();
const mockGetKizunaCreditsBalance = vi.fn();

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
  getBaseFacilitatorAddress: vi.fn(() => PAYER_WALLET),
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

vi.mock('../src/services/kizuna-wallet-control-plane', () => ({
  getKizunaMandateLimits: mockGetKizunaMandateLimits,
  syncKizunaMandate: mockSyncKizunaMandate,
}));

vi.mock('../src/services/kizuna-underwrite', () => ({
  runKizunaUnderwrite: vi.fn(),
}));

vi.mock('../src/services/kizuna-kernel', () => ({
  evaluateKizunaKernelDecision: mockEvaluateKizunaKernelDecision,
  hashKizunaDecisionEnvelope: vi.fn(() => null),
  mintLocalKizunaEnvelope: vi.fn(),
  ingestKizunaKernelCollateral: vi.fn(),
  ingestKizunaKernelRepayment: vi.fn(),
}));

vi.mock('../src/services/agent-registry', () => ({
  resolveAgentRegistryIdentity: mockResolveAgentRegistryIdentity,
  buildKizunaIdentityPayload: mockBuildKizunaIdentityPayload,
  getAuthorizedRegistryWallet: mockGetAuthorizedRegistryWallet,
  isLegacyIdentityAllowed: mockIsLegacyIdentityAllowed,
}));

vi.mock('../src/services/kizuna-credits', () => ({
  debitKizunaCredits: vi.fn(),
  getKizunaCreditsBalance: mockGetKizunaCreditsBalance,
}));

vi.mock('../src/db/queries', () => ({
  applyKizunaFundingEvent: vi.fn(),
  applyKizunaCollateralEvent: vi.fn(),
  applyKizunaRepayment: vi.fn(),
  createKizunaReservation: mockCreateKizunaReservation,
  getKizunaAccount: mockGetKizunaAccount,
  getKizunaOutstandingMicro: mockGetKizunaOutstandingMicro,
  getKizunaEnterpriseBalance: mockGetKizunaEnterpriseBalance,
  getKizunaReservationByNonce: mockGetKizunaReservationByNonce,
  getKizunaUnderwriteSnapshot: mockGetKizunaUnderwriteSnapshot,
  getKizunaFastpathPool: mockGetKizunaFastpathPool,
  getKizunaCollateralPosition: vi.fn(),
  getKizunaCollateralSummary: vi.fn(),
  getKizunaLatestHealthSnapshot: vi.fn(),
  getKizunaPool: vi.fn(),
  insertKizunaUnderwriteDecision: mockInsertKizunaUnderwriteDecision,
  listKizunaFundingEvents: vi.fn(),
  listKizunaTransactions: vi.fn(),
  listKizunaCollateralPositions: vi.fn(),
  upsertKizunaAccount: mockUpsertKizunaAccount,
  getPaymentSessionByTokenHash: vi.fn(),
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
  process.env.KIZUNA_ALLOW_LEGACY_AGENT_IDS = 'false';
}

function makeResolvedIdentity(overrides: Record<string, unknown> = {}) {
  const syncedAt = new Date('2026-03-11T12:00:00.000Z');

  return {
    globalId: AGENT_ID,
    name: 'Agent One',
    description: 'Kizuna test agent',
    imageUri: 'https://example.com/agent.png',
    ownerWallet: OWNER_WALLET,
    operationalWallet: PAYER_WALLET,
    agentUri: 'ipfs://agent-one',
    active: true,
    services: [{ type: 'MCP', value: 'https://mcp.kamiyo.test' }],
    supportedTrust: ['reputation'],
    feedbackSummary: {
      averageScore: 98,
      totalFeedbacks: 12,
      positiveCount: 12,
      negativeCount: 0,
      nextFeedbackIndex: 12,
    },
    syncSource: '8004-solana',
    syncedAt,
    ...overrides,
  };
}

function makeIdentityPayload(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'registry',
    synced: true,
    globalId: AGENT_ID,
    name: 'Agent One',
    description: 'Kizuna test agent',
    imageUri: 'https://example.com/agent.png',
    ownerWallet: OWNER_WALLET,
    operationalWallet: PAYER_WALLET,
    authorizedWallet: PAYER_WALLET,
    payerWallet: PAYER_WALLET,
    agentUri: 'ipfs://agent-one',
    active: true,
    services: [{ type: 'MCP', value: 'https://mcp.kamiyo.test' }],
    supportedTrust: ['reputation'],
    feedbackSummary: {
      averageScore: 98,
      totalFeedbacks: 12,
      positiveCount: 12,
      negativeCount: 0,
      nextFeedbackIndex: 12,
    },
    syncSource: '8004-solana',
    syncedAt: '2026-03-11T12:00:00.000Z',
    compatibleMetadata: null,
    ...overrides,
  };
}

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-03-11T12:00:00.000Z');

  return {
    id: 'acc-1',
    agent_id: AGENT_ID,
    payer_wallet: PAYER_WALLET,
    repay_wallet: REPAY_WALLET,
    passport_address: 'passport-1',
    networks: ['solana', 'base'],
    mandate_single_limit_micro: '5000000',
    mandate_daily_limit_micro: '25000000',
    mandate_monthly_limit_micro: '100000000',
    mandate_human_approval_micro: '5000000',
    registry_global_id: AGENT_ID,
    registry_name: 'Agent One',
    registry_description: 'Kizuna test agent',
    registry_image_uri: 'https://example.com/agent.png',
    registry_owner_wallet: OWNER_WALLET,
    registry_operational_wallet: PAYER_WALLET,
    registry_agent_uri: 'ipfs://agent-one',
    registry_active: true,
    registry_services: [{ type: 'MCP', value: 'https://mcp.kamiyo.test' }],
    registry_supported_trust: ['reputation'],
    registry_feedback_summary: {
      averageScore: 98,
      totalFeedbacks: 12,
      positiveCount: 12,
      negativeCount: 0,
      nextFeedbackIndex: 12,
    },
    registry_sync_source: '8004-solana',
    registry_synced_at: now,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

type InvokeResult = {
  statusCode: number;
  body: any;
};

async function invokeRoute(
  router: any,
  params: {
    method: 'get' | 'post';
    path: string;
    body?: Record<string, unknown>;
    routeParams?: Record<string, unknown>;
    query?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  }
): Promise<InvokeResult> {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === params.path && entry.route?.methods?.[params.method]
  );
  if (!layer) throw new Error(`route_not_found:${params.method}:${params.path}`);

  const handler = layer.route.stack[0].handle;

  return new Promise<InvokeResult>((resolve, reject) => {
    const req: any = {
      body: params.body ?? {},
      params: params.routeParams ?? {},
      query: params.query ?? {},
      ...params.extras,
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

    Promise.resolve(handler(req, res, (err: unknown) => (err ? reject(err) : undefined))).catch(reject);
  });
}

describe('kizuna registry identity routes', () => {
  beforeEach(() => {
    setBaseEnv();
    clearConfigCache();
    vi.clearAllMocks();
    vi.resetModules();

    mockParsePaymentScheme.mockReturnValue({ scheme: 'exact', network: 'eip155:8453' });
    mockDecodePaymentHeader.mockReturnValue({
      signature: 'sig',
      payer: PAYER_WALLET,
      timestamp: Date.now(),
      nonce: 'nonce-1',
      resource: '/resource',
      amount: '1',
      authSignature: 'auth',
    });
    mockVerifyPaymentAuth.mockReturnValue(true);
    mockIsPaymentFresh.mockReturnValue(true);

    mockResolveAgentRegistryIdentity.mockResolvedValue(makeResolvedIdentity());
    mockBuildKizunaIdentityPayload.mockResolvedValue(makeIdentityPayload());
    mockGetAuthorizedRegistryWallet.mockReturnValue(PAYER_WALLET);
    mockIsLegacyIdentityAllowed.mockReturnValue(false);

    mockSyncKizunaMandate.mockResolvedValue(undefined);
    mockGetKizunaMandateLimits.mockResolvedValue({
      passportAddress: 'passport-1',
      caps: {
        singleMicro: '5000000',
        dailyMicro: '25000000',
        monthlyMicro: '100000000',
        humanApprovalMicro: '5000000',
      },
      mandateVersion: 1,
      validFrom: '2026-03-11T00:00:00.000Z',
      validUntil: '2026-04-11T00:00:00.000Z',
    });

    mockGetKizunaAccount.mockResolvedValue(makeAccountRow());
    mockUpsertKizunaAccount.mockResolvedValue(makeAccountRow());
    mockGetKizunaOutstandingMicro.mockResolvedValue(0n);
    mockGetKizunaEnterpriseBalance.mockResolvedValue({
      agent_id: AGENT_ID,
      pool_id: 'enterprise-main',
      available_micro: '100000000',
      reserved_micro: '0',
      spent_micro: '0',
      updated_at: new Date('2026-03-11T12:00:00.000Z'),
    });
    mockGetKizunaCreditsBalance.mockResolvedValue(2500000n);

    mockGetKizunaReservationByNonce.mockResolvedValue(null);
    mockGetKizunaUnderwriteSnapshot.mockResolvedValue({
      accountCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
      settlementsConfirmed: 5,
      disputesFiled: 1,
      disputesWon: 1,
      avgQuality: 80,
      debtsTotal: 2,
      debtsClosed: 2,
      latestActivityAt: new Date('2026-03-10T00:00:00.000Z'),
    });
    mockEvaluateKizunaKernelDecision.mockResolvedValue({
      approved: true,
      decisionId: 'dec-1',
      approvedMicro: '1000000',
      availableMicro: '1000000',
      outstandingMicro: '0',
      scoreRaw: 650,
      reasonCodes: ['approved'],
      tier: 'standard',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      policyPackId: 'policy-v1',
      riskBand: 'medium',
      ltvBps: null,
      healthFactor: null,
      decisionEnvelope: null,
    });
    mockInsertKizunaUnderwriteDecision.mockResolvedValue({ id: 'dec-1' });
    mockCreateKizunaReservation.mockResolvedValue({
      id: 'resv-1',
      locked_micro: '1000000',
      funding_mode: 'prefunded',
    });
    mockGetKizunaFastpathPool.mockResolvedValue(null);
  });

  it('onboards a registry-backed account and returns identity', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    mockUpsertKizunaAccount.mockResolvedValue(
      makeAccountRow({
        registry_global_id: AGENT_ID,
        registry_operational_wallet: PAYER_WALLET,
      })
    );

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/onboard',
      body: {
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
      },
    });

    expect(result.statusCode).toBe(201);
    expect(result.body.account.agentId).toBe(AGENT_ID);
    expect(result.body.identity.globalId).toBe(AGENT_ID);
    expect(result.body.identity.authorizedWallet).toBe(PAYER_WALLET);
    expect(mockUpsertKizunaAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
        registryGlobalId: AGENT_ID,
        registryOwnerWallet: OWNER_WALLET,
        registryOperationalWallet: PAYER_WALLET,
        registrySyncSource: '8004-solana',
      })
    );
  });

  it('rejects onboarding when the registry identity is missing and legacy mode is disabled', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    mockResolveAgentRegistryIdentity.mockResolvedValue(null);
    mockIsLegacyIdentityAllowed.mockReturnValue(false);

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/onboard',
      body: {
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
      },
    });

    expect(result.statusCode).toBe(404);
    expect(result.body.error).toBe('Agent Registry identity not found');
  });

  it('rejects onboarding when the registry identity is inactive', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    mockResolveAgentRegistryIdentity.mockResolvedValue(
      makeResolvedIdentity({ active: false })
    );

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/onboard',
      body: {
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
      },
    });

    expect(result.statusCode).toBe(409);
    expect(result.body.error).toBe('Agent Registry identity is inactive');
  });

  it('rejects onboarding when the payer wallet does not match the authorized registry wallet', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    mockGetAuthorizedRegistryWallet.mockReturnValue(NEXT_OPERATOR_WALLET);

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/onboard',
      body: {
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
      },
    });

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe(
      'payerWallet must match the registered operational wallet or owner wallet'
    );
  });

  it('supports legacy onboarding behind the migration flag', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    process.env.KIZUNA_ALLOW_LEGACY_AGENT_IDS = 'true';
    clearConfigCache();

    mockResolveAgentRegistryIdentity.mockResolvedValue(null);
    mockIsLegacyIdentityAllowed.mockReturnValue(true);
    mockSyncKizunaMandate.mockRejectedValue(new Error('wcp_unavailable'));
    mockBuildKizunaIdentityPayload.mockResolvedValue(
      makeIdentityPayload({
        mode: 'legacy',
        synced: false,
        globalId: null,
        name: null,
        description: null,
        imageUri: null,
        ownerWallet: null,
        operationalWallet: null,
        authorizedWallet: null,
        agentUri: null,
        active: null,
        services: [],
        supportedTrust: [],
        feedbackSummary: null,
        syncSource: 'legacy',
        syncedAt: null,
      })
    );
    mockUpsertKizunaAccount.mockResolvedValue(
      makeAccountRow({
        registry_global_id: null,
        registry_name: null,
        registry_description: null,
        registry_image_uri: null,
        registry_owner_wallet: null,
        registry_operational_wallet: null,
        registry_agent_uri: null,
        registry_active: null,
        registry_services: [],
        registry_supported_trust: [],
        registry_feedback_summary: {},
        registry_sync_source: 'legacy',
        registry_synced_at: null,
      })
    );

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/onboard',
      body: {
        agentId: AGENT_ID,
        payerWallet: PAYER_WALLET,
        repayWallet: REPAY_WALLET,
        manualMandate: {
          singleMicro: '5000000',
          dailyMicro: '25000000',
          monthlyMicro: '100000000',
          humanApprovalMicro: '5000000',
        },
      },
    });

    expect(result.statusCode).toBe(201);
    expect(result.body.identity.mode).toBe('legacy');
    expect(result.body.identity.synced).toBe(false);
    expect(mockUpsertKizunaAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        registryGlobalId: null,
        registrySyncSource: 'legacy',
      })
    );
  });

  it('returns identity data from account reads', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'get',
      path: '/accounts/:agentId',
      routeParams: { agentId: AGENT_ID },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.account.agentId).toBe(AGENT_ID);
    expect(result.body.identity.globalId).toBe(AGENT_ID);
    expect(result.body.creditsBalanceMicro).toBe('2500000');
  });

  it('syncs identity snapshot updates and rotates the payer wallet to the latest operator', async () => {
    const { createKizunaRouter } = await import('../src/routes/kizuna');

    mockGetKizunaAccount.mockResolvedValue(
      makeAccountRow({
        payer_wallet: PAYER_WALLET,
        registry_operational_wallet: PAYER_WALLET,
      })
    );
    mockResolveAgentRegistryIdentity.mockResolvedValue(
      makeResolvedIdentity({ operationalWallet: NEXT_OPERATOR_WALLET })
    );
    mockGetAuthorizedRegistryWallet.mockReturnValue(NEXT_OPERATOR_WALLET);
    mockUpsertKizunaAccount.mockResolvedValue(
      makeAccountRow({
        payer_wallet: NEXT_OPERATOR_WALLET,
        registry_operational_wallet: NEXT_OPERATOR_WALLET,
      })
    );
    mockBuildKizunaIdentityPayload.mockResolvedValue(
      makeIdentityPayload({
        operationalWallet: NEXT_OPERATOR_WALLET,
        authorizedWallet: NEXT_OPERATOR_WALLET,
        payerWallet: NEXT_OPERATOR_WALLET,
      })
    );

    const router = createKizunaRouter();
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/accounts/:agentId/identity/sync',
      routeParams: { agentId: AGENT_ID },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.synced).toBe(true);
    expect(result.body.account.payerWallet).toBe(NEXT_OPERATOR_WALLET);
    expect(result.body.identity.authorizedWallet).toBe(NEXT_OPERATOR_WALLET);
    expect(mockUpsertKizunaAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        payerWallet: NEXT_OPERATOR_WALLET,
        registryOperationalWallet: NEXT_OPERATOR_WALLET,
      })
    );
  });

  it('verifies from the stored identity snapshot without a live registry lookup', async () => {
    const { createVerifyRouter } = await import('../src/routes/verify');

    const router = createVerifyRouter({} as any, Keypair.generate().publicKey);
    const result = await invokeRoute(router, {
      method: 'post',
      path: '/',
      body: {
        paymentHeader: 'exact:eip155:8453:Zm9v',
        paymentRequirements: {
          network: 'eip155:8453',
          amount: '1000000',
          extra: {
            kizuna: {
              mode: 'credit',
              agentId: AGENT_ID,
              repayWallet: REPAY_WALLET,
              lane: 'enterprise',
            },
          },
        },
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.body.isValid).toBe(true);
    expect(result.body.extensions.kizuna.identity.globalId).toBe(AGENT_ID);
    expect(mockResolveAgentRegistryIdentity).not.toHaveBeenCalled();
  });
});
