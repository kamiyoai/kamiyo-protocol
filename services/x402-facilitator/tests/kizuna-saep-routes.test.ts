/**
 * Tests for `/kizuna/adapters/saep/*` routes. Mirrors the dependency-mocking
 * pattern in `kizuna-routes.test.ts`, scoped to the much smaller SAEP
 * surface.
 */
import BN from 'bn.js';
import { Keypair, PublicKey } from '@solana/web3.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SaepAdapterError,
  SaepTaskStatus,
  type SaepProgramIds,
  type SaepReader,
  type SaepTaskSnapshot,
} from '@kamiyo/saep-adapter';

import { clearConfigCache } from '../src/config';

// --- DB query mocks --------------------------------------------------------
// vi.mock is hoisted to the top of the file, so mock fns must be defined
// inside vi.hoisted() to be available when the factory runs.

const {
  mockGetKizunaAccount,
  mockGetKizunaReservationByNonce,
  mockGetKizunaOutstandingMicro,
  mockGetKizunaLatestHealthSnapshot,
  mockInsertKizunaUnderwriteDecision,
  mockCreateKizunaReservation,
  mockGetKizunaReservationById,
  mockGetKizunaDebtByReservationId,
  mockFinalizeKizunaSettlement,
  mockGetKizunaBillableSettlementEvent,
  mockInsertSettlement,
  mockReleaseKizunaReservation,
} = vi.hoisted(() => ({
  mockGetKizunaAccount: vi.fn(),
  mockGetKizunaReservationByNonce: vi.fn(),
  mockGetKizunaOutstandingMicro: vi.fn(),
  mockGetKizunaLatestHealthSnapshot: vi.fn(),
  mockInsertKizunaUnderwriteDecision: vi.fn(),
  mockCreateKizunaReservation: vi.fn(),
  mockGetKizunaReservationById: vi.fn(),
  mockGetKizunaDebtByReservationId: vi.fn(),
  mockFinalizeKizunaSettlement: vi.fn(),
  mockGetKizunaBillableSettlementEvent: vi.fn(),
  mockInsertSettlement: vi.fn(),
  mockReleaseKizunaReservation: vi.fn(),
}));

vi.mock('../src/db/queries', () => ({
  getKizunaAccount: mockGetKizunaAccount,
  getKizunaReservationByNonce: mockGetKizunaReservationByNonce,
  getKizunaOutstandingMicro: mockGetKizunaOutstandingMicro,
  getKizunaLatestHealthSnapshot: mockGetKizunaLatestHealthSnapshot,
  insertKizunaUnderwriteDecision: mockInsertKizunaUnderwriteDecision,
  createKizunaReservation: mockCreateKizunaReservation,
  getKizunaReservationById: mockGetKizunaReservationById,
  getKizunaDebtByReservationId: mockGetKizunaDebtByReservationId,
  finalizeKizunaSettlement: mockFinalizeKizunaSettlement,
  getKizunaBillableSettlementEvent: mockGetKizunaBillableSettlementEvent,
  insertSettlement: mockInsertSettlement,
  releaseKizunaReservation: mockReleaseKizunaReservation,
}));

// Imported AFTER vi.mock so the mocks are active.
import { createKizunaSaepRouter, type SaepFactory } from '../src/routes/kizuna-saep';

// --- Stub SAEP factory + reader -------------------------------------------

const TEST_PROGRAM_IDS: SaepProgramIds = { taskMarket: Keypair.generate().publicKey };
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TEST_TASK_PDA = Keypair.generate().publicKey;
const TEST_CLIENT = Keypair.generate().publicKey;
const NOW_SEC = Math.floor(Date.now() / 1000);

function buildSnapshot(overrides?: Partial<SaepTaskSnapshot>): SaepTaskSnapshot {
  return {
    cluster: 'mainnet-beta',
    slot: 100,
    decodedAtMs: Date.now(),
    taskPda: TEST_TASK_PDA,
    taskId: new Uint8Array(32).fill(0xaa),
    client: TEST_CLIENT,
    agentDid: new Uint8Array(32).fill(0xbb),
    paymentMint: USDC,
    paymentAmount: new BN(1_000_000),
    protocolFee: new BN(0),
    solrepFee: new BN(0),
    taskHash: new Uint8Array(32).fill(0xcc),
    resultHash: new Uint8Array(32),
    proofKey: new Uint8Array(32),
    criteriaRoot: new Uint8Array(32).fill(0xdd),
    milestoneCount: 0,
    milestonesComplete: 0,
    status: SaepTaskStatus.Funded,
    createdAt: NOW_SEC - 100,
    fundedAt: NOW_SEC - 90,
    deadline: NOW_SEC + 3600,
    submittedAt: 0,
    disputeWindowEnd: NOW_SEC + 3600 + 86400,
    verified: false,
    taskNonce: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    escrowBump: 254,
    ...overrides,
  };
}

function buildSaepFactory(snapshot: SaepTaskSnapshot | SaepAdapterError): SaepFactory {
  const fakeReader: Pick<SaepReader, 'fetchTaskByPda' | 'fetchTaskById'> = {
    fetchTaskByPda: vi.fn(async () => {
      if (snapshot instanceof SaepAdapterError) throw snapshot;
      return snapshot;
    }),
    fetchTaskById: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
  return {
    rpcFor: () => 'http://localhost:8899',
    readerFor: () => fakeReader as SaepReader,
    policy: () => ({ allowedPaymentMints: [USDC] }),
  };
}

// --- Direct handler invocation harness ------------------------------------
// (mirrors the pattern in kizuna-routes.test.ts — no supertest)

async function invokePost(
  router: any,
  path: string,
  body: Record<string, unknown>,
  extras?: Record<string, unknown>,
): Promise<{ statusCode: number; body: any }> {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.post,
  );
  if (!layer) throw new Error(`post_route_not_found: ${path}`);
  const handler = layer.route.stack[0].handle;

  return new Promise((resolve, reject) => {
    const req: any = { body, params: {}, query: {}, get: (h: string) => extras?.headers?.[h.toLowerCase()], ...extras };
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
    Promise.resolve(handler(req, res, (err: unknown) => err && reject(err))).catch(reject);
  });
}

// --- Env setup -------------------------------------------------------------

function setEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SOLANA_RPC_URL = 'http://localhost:8899';
  process.env.FACILITATOR_PRIVATE_KEY = JSON.stringify(Array.from(Keypair.generate().secretKey));
  process.env.TREASURY_WALLET = Keypair.generate().publicKey.toBase58();
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.KIZUNA_ENABLED = 'true';
  process.env.KIZUNA_INTERNAL_TOKEN = 'test-internal-token';
  process.env.WALLET_CONTROL_PLANE_URL = 'http://wcp.test';
  process.env.CREDITS_INTERNAL_URL = 'http://credits.test';
  process.env.KIZUNA_KERNEL_FAIL_CLOSED = 'false';
  process.env.SAEP_TASK_MARKET_PROGRAM_ID = TEST_PROGRAM_IDS.taskMarket.toBase58();
  process.env.SAEP_ALLOWED_PAYMENT_MINTS = USDC.toBase58();
}

function authHeaders() {
  return { headers: { authorization: 'Bearer test-internal-token' } };
}

// --- Tests -----------------------------------------------------------------

beforeEach(() => {
  setEnv();
  clearConfigCache();
  vi.clearAllMocks();

  mockGetKizunaAccount.mockResolvedValue({
    id: 'acc-1',
    agent_id: 'agent-1',
    payer_wallet: 'PayerPubkey1111111111111111111111111111111111',
    repay_wallet: 'RepayPubkey1111111111111111111111111111111111',
    mandate_single_limit_micro: '10000000',
    status: 'active',
  });
  mockGetKizunaReservationByNonce.mockResolvedValue(null);
  mockGetKizunaOutstandingMicro.mockResolvedValue(0n);
  mockGetKizunaLatestHealthSnapshot.mockResolvedValue({
    id: 'snap-1',
    lane: 'crypto-fast',
    pool_id: 'fastpath-main',
    collateral_value_micro: '5000000',
    debt_outstanding_micro: '0',
    ltv_bps: 0,
    health_factor: '5.0',
    source: 'kernel',
    created_at: new Date(),
  });
  mockInsertKizunaUnderwriteDecision.mockResolvedValue({ id: 'decision-1' });
  mockCreateKizunaReservation.mockResolvedValue({
    id: 'reservation-1',
    lane: 'crypto-fast',
    pool_id: 'fastpath-main',
    amount_micro: '1000000',
    funding_mode: 'collateralized',
    status: 'reserved',
  });

  // Settlement-ingest defaults
  mockGetKizunaReservationById.mockResolvedValue({
    id: 'reservation-1',
    agent_id: 'agent-1',
    payer_wallet: 'PayerPubkey1111111111111111111111111111111111',
    network: 'solana',
    lane: 'crypto-fast',
    pool_id: 'fastpath-main',
    amount_micro: '1000000',
    funding_mode: 'collateralized',
    status: 'reserved',
  });
  mockGetKizunaDebtByReservationId.mockResolvedValue(null);
  mockInsertSettlement.mockResolvedValue({ id: 'settlement-1' });
  mockFinalizeKizunaSettlement.mockResolvedValue({ debt: { id: 'debt-1' } });
  mockGetKizunaBillableSettlementEvent.mockResolvedValue({ id: 'billable-1' });
  mockReleaseKizunaReservation.mockResolvedValue(undefined);
});

const validBody = () => ({
  agentId: 'agent-1',
  payerWallet: 'PayerPubkey1111111111111111111111111111111111',
  collateralAccount: 'CollateralAcct11111111111111111111111111111',
  taskPda: TEST_TASK_PDA.toBase58(),
  cluster: 'mainnet-beta',
  idempotencyKey: 'idem-test-1',
});

describe('POST /kizuna/adapters/saep/underwrite', () => {
  it('approves a fresh, eligible SAEP task and returns reservation + risk hash', async () => {
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());

    expect(result.statusCode).toBe(200);
    expect(result.body.escrowRef).toBe('reservation-1');
    expect(result.body.lane).toBe('crypto-fast');
    expect(result.body.fundingMode).toBe('collateralized');
    expect(result.body.status).toBe('reserved');
    expect(result.body.taskRef).toMatchObject({ venue: 'saep', cluster: 'mainnet-beta' });
    expect(result.body.riskHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(mockInsertKizunaUnderwriteDecision).toHaveBeenCalledOnce();
    expect(mockCreateKizunaReservation).toHaveBeenCalledOnce();
  });

  it('returns the existing reservation on idempotent replay (no new decision)', async () => {
    mockGetKizunaReservationByNonce.mockResolvedValue({
      id: 'reservation-existing',
      lane: 'crypto-fast',
      pool_id: 'fastpath-main',
      amount_micro: '500000',
      funding_mode: 'collateralized',
      status: 'reserved',
      decision: { id: 'decision-existing' },
    });

    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());

    expect(result.statusCode).toBe(200);
    expect(result.body.escrowRef).toBe('reservation-existing');
    expect(result.body.replay).toBe(true);
    expect(mockInsertKizunaUnderwriteDecision).not.toHaveBeenCalled();
    expect(mockCreateKizunaReservation).not.toHaveBeenCalled();
  });

  it('rejects a request missing required fields', async () => {
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', { agentId: 'agent-1' }, authHeaders());
    expect(result.statusCode).toBe(400);
  });

  it('rejects when the Kizuna account is not found', async () => {
    mockGetKizunaAccount.mockResolvedValue(null);
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(404);
  });

  it('rejects when payerWallet does not match the account', async () => {
    mockGetKizunaAccount.mockResolvedValue({
      id: 'acc-1',
      agent_id: 'agent-1',
      payer_wallet: 'DifferentPayer11111111111111111111111111111',
      repay_wallet: 'RepayPubkey1111111111111111111111111111111111',
      mandate_single_limit_micro: '10000000',
      status: 'active',
    });
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(400);
  });

  it('rejects a SAEP task in a terminal status with saep_validate_terminal', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('saep_validate_terminal');
  });

  it('rejects a SAEP task with an unsupported payment mint', async () => {
    const otherMint = Keypair.generate().publicKey;
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ paymentMint: otherMint })),
    });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('saep_validate_unsupported_mint');
  });

  it('rejects a SAEP task whose deadline has already passed', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ deadline: NOW_SEC - 1000 })),
    });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('saep_validate_deadline_passed');
  });

  it('rejects when the SAEP task account is not found on chain', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(
        new SaepAdapterError('rpc_account_not_found', 'no account', { taskPda: TEST_TASK_PDA.toBase58() }),
      ),
    });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());
    expect(result.statusCode).toBe(404);
    expect(result.body.reasonCodes).toContain('saep_rpc_account_not_found');
  });

  it('rejects with 409 + reasonCodes when health factor is below the configured floor', async () => {
    mockGetKizunaLatestHealthSnapshot.mockResolvedValue({
      id: 'snap-1',
      lane: 'crypto-fast',
      pool_id: 'fastpath-main',
      collateral_value_micro: '0',
      debt_outstanding_micro: '0',
      ltv_bps: 0,
      health_factor: '0.5',
      source: 'kernel',
      created_at: new Date(),
    });
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), authHeaders());

    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('kizuna_unsafe_health_factor');
    expect(result.body.taskRef).toMatchObject({ venue: 'saep' });
  });

  it('returns 401 when the internal auth header is missing', async () => {
    const router = createKizunaSaepRouter({ saepFactory: buildSaepFactory(buildSnapshot()) });
    const result = await invokePost(router, '/underwrite', validBody(), {});
    expect(result.statusCode).toBe(401);
  });
});

// --- /settlement-ingest -----------------------------------------------------

const ASSIGNED_AGENT = Keypair.generate().publicKey;

const settlementBody = (overrides: Record<string, unknown> = {}) => ({
  reservationId: 'reservation-1',
  taskPda: TEST_TASK_PDA.toBase58(),
  cluster: 'mainnet-beta',
  releaseSignature: 'sig-test-1',
  ...overrides,
});

describe('POST /kizuna/adapters/saep/settlement-ingest', () => {
  it('finalizes a Released task: settlement + debt + billable event', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(
        buildSnapshot({
          status: SaepTaskStatus.Released,
          assignedAgent: ASSIGNED_AGENT,
          paymentAmount: new BN(1_000_000),
          protocolFee: new BN(1_000),
          solrepFee: new BN(500),
        }),
      ),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());

    expect(result.statusCode).toBe(200);
    expect(result.body.settlementRef).toBe('settlement-1');
    expect(result.body.debtId).toBe('debt-1');
    expect(result.body.billableEventId).toBe('billable-1');
    expect(result.body.terminalStatus).toBe('released');
    expect(result.body.agentPayoutMicro).toBe('998500');
    expect(result.body.taskRef).toMatchObject({ venue: 'saep' });
    expect(mockInsertSettlement).toHaveBeenCalledOnce();
    expect(mockFinalizeKizunaSettlement).toHaveBeenCalledOnce();
    // Agent wallet was resolved from snapshot.assignedAgent.
    expect(mockInsertSettlement.mock.calls[0][0]).toBe(ASSIGNED_AGENT.toBase58());
  });

  it('releases the reservation on Expired with no debt and no billable event', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Expired })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());

    expect(result.statusCode).toBe(200);
    expect(result.body.settlementRef).toBeNull();
    expect(result.body.debtId).toBeNull();
    expect(result.body.billableEventId).toBeNull();
    expect(result.body.terminalStatus).toBe('expired');
    expect(mockReleaseKizunaReservation).toHaveBeenCalledWith('reservation-1', 'expired');
    expect(mockInsertSettlement).not.toHaveBeenCalled();
    expect(mockFinalizeKizunaSettlement).not.toHaveBeenCalled();
  });

  it('returns the existing settlement on idempotent retry', async () => {
    mockGetKizunaDebtByReservationId.mockResolvedValue({
      id: 'debt-existing',
      settlement_id: 'settlement-existing',
    });
    mockGetKizunaBillableSettlementEvent.mockResolvedValue({ id: 'billable-existing' });

    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());

    expect(result.statusCode).toBe(200);
    expect(result.body.settlementRef).toBe('settlement-existing');
    expect(result.body.debtId).toBe('debt-existing');
    expect(result.body.billableEventId).toBe('billable-existing');
    expect(result.body.replay).toBe(true);
    expect(mockInsertSettlement).not.toHaveBeenCalled();
    expect(mockFinalizeKizunaSettlement).not.toHaveBeenCalled();
  });

  it('rejects when required inputs are missing', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(
      router,
      '/settlement-ingest',
      { reservationId: 'reservation-1' },
      authHeaders(),
    );
    expect(result.statusCode).toBe(400);
  });

  it('rejects when the reservation is not found', async () => {
    mockGetKizunaReservationById.mockResolvedValue(null);
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());
    expect(result.statusCode).toBe(404);
  });

  it('rejects when the reservation is no longer in `reserved` state', async () => {
    mockGetKizunaReservationById.mockResolvedValue({
      id: 'reservation-1',
      agent_id: 'agent-1',
      payer_wallet: 'PayerPubkey1111111111111111111111111111111111',
      network: 'solana',
      lane: 'crypto-fast',
      pool_id: 'fastpath-main',
      amount_micro: '1000000',
      funding_mode: 'collateralized',
      status: 'released',
    });
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());
    expect(result.statusCode).toBe(409);
  });

  it('rejects when the SAEP task has not reached a terminal state', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Funded })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());
    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('saep_task_not_terminal');
  });

  it('requires merchantWallet when the SAEP task has no assigned_agent', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(
        buildSnapshot({ status: SaepTaskStatus.Released }), // no assignedAgent
      ),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());
    expect(result.statusCode).toBe(400);
    expect(result.body.reasonCodes).toContain('saep_no_assigned_agent');
  });

  it('accepts an explicit merchantWallet override when assigned_agent is absent', async () => {
    const explicit = Keypair.generate().publicKey.toBase58();
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(
      router,
      '/settlement-ingest',
      settlementBody({ merchantWallet: explicit }),
      authHeaders(),
    );
    expect(result.statusCode).toBe(200);
    expect(mockInsertSettlement.mock.calls[0][0]).toBe(explicit);
  });

  it('rejects when the SAEP release math produces a non-positive payout', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(
        buildSnapshot({
          status: SaepTaskStatus.Released,
          assignedAgent: ASSIGNED_AGENT,
          paymentAmount: new BN(100),
          protocolFee: new BN(100),
          solrepFee: new BN(100),
        }),
      ),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), authHeaders());
    expect(result.statusCode).toBe(409);
    expect(result.body.reasonCodes).toContain('saep_release_math_invalid');
  });

  it('returns 401 when the internal auth header is missing', async () => {
    const router = createKizunaSaepRouter({
      saepFactory: buildSaepFactory(buildSnapshot({ status: SaepTaskStatus.Released })),
    });
    const result = await invokePost(router, '/settlement-ingest', settlementBody(), {});
    expect(result.statusCode).toBe(401);
  });
});
