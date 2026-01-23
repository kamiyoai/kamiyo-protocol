import {
  creditExtensionInfo,
  parseCreditRequirement,
  buildCreditPayloadV2,
  hasCreditProof,
  creditMiddleware,
  CREDIT_EXTENSION_KEY,
  type CreditMiddlewareRequest,
  type CreditMiddlewareResponse,
  type CreditNextFunction,
} from './credit-extension';
import {
  DynamicCreditTracker,
  InMemoryCreditStoreV2,
} from './reputation-extension';
import type { KamiyoCreditPayload } from './v2/types';

describe('creditExtensionInfo', () => {
  it('builds declaration with defaults', () => {
    const ext = creditExtensionInfo();
    const decl = ext[CREDIT_EXTENSION_KEY];
    expect(decl).toBeDefined();
    expect(decl.schema).toBeDefined();

    const info = decl.info as any;
    expect(info.creditEnabled).toBe(true);
    expect(info.maxCollateralMultiplier).toBe(3);
    expect(info.agingHalfLifeDays).toBe(30);
    expect(info.minHistoryForCredit).toBe(3);
    expect(info.scoringWeights).toEqual({
      disputeHistory: 0.25,
      paymentHistory: 0.25,
      escrowOutcomes: 0.25,
      tenure: 0.25,
    });
  });

  it('accepts custom options', () => {
    const ext = creditExtensionInfo({
      maxCollateralMultiplier: 5,
      agingHalfLifeDays: 60,
      minHistoryForCredit: 5,
      scoringWeights: { disputeHistory: 0.4 },
    });
    const info = ext[CREDIT_EXTENSION_KEY].info as any;
    expect(info.maxCollateralMultiplier).toBe(5);
    expect(info.agingHalfLifeDays).toBe(60);
    expect(info.minHistoryForCredit).toBe(5);
    expect(info.scoringWeights.disputeHistory).toBe(0.4);
  });

  it('includes JSON schema with required fields', () => {
    const ext = creditExtensionInfo();
    const schema = ext[CREDIT_EXTENSION_KEY].schema as any;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('agentPk');
    expect(schema.required).toContain('commitment');
    expect(schema.required).toContain('requestedCredit');
  });
});

describe('parseCreditRequirement', () => {
  it('extracts credit info from 402 response', () => {
    const ext = creditExtensionInfo();
    const result = parseCreditRequirement({ extensions: ext });
    expect(result).not.toBeNull();
    expect(result!.creditEnabled).toBe(true);
  });

  it('returns null for missing extension', () => {
    expect(parseCreditRequirement({ extensions: {} })).toBeNull();
  });

  it('returns null for malformed extension', () => {
    const result = parseCreditRequirement({
      extensions: { [CREDIT_EXTENSION_KEY]: { info: { foo: 'bar' } } },
    });
    expect(result).toBeNull();
  });
});

describe('buildCreditPayloadV2 / hasCreditProof roundtrip', () => {
  const commitment = '0x' + 'a'.repeat(64);

  it('builds valid payload structure', () => {
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent123',
      commitment,
      requestedCredit: 150,
    });
    const decl = payload[CREDIT_EXTENSION_KEY];
    expect(decl).toBeDefined();
    const info = decl.info as any;
    expect(info.agentPk).toBe('Agent123');
    expect(info.commitment).toBe(commitment);
    expect(info.requestedCredit).toBe(150);
  });

  it('includes optional collateral fields', () => {
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent123',
      commitment,
      requestedCredit: 100,
      collateralEscrowPda: 'EscrowPda' + '1'.repeat(30),
      collateralAmount: 50,
    });
    const info = payload[CREDIT_EXTENSION_KEY].info as any;
    expect(info.collateralEscrowPda).toContain('EscrowPda');
    expect(info.collateralAmount).toBe(50);
  });

  it('hasCreditProof detects payload', () => {
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent123',
      commitment,
      requestedCredit: 100,
    });
    expect(hasCreditProof(payload)).toBe(true);
  });

  it('hasCreditProof returns false for empty', () => {
    expect(hasCreditProof({})).toBe(false);
    expect(hasCreditProof(undefined)).toBe(false);
  });
});

describe('creditMiddleware', () => {
  const commitment = '0x' + 'b'.repeat(64);
  let tracker: DynamicCreditTracker;
  let store: InMemoryCreditStoreV2;

  beforeEach(async () => {
    store = new InMemoryCreditStoreV2();
    tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    const account = await tracker.registerAccount(commitment, 'Agent1', 80);
    for (let i = 0; i < 5; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 90);
    }
    for (let i = 0; i < 3; i++) {
      await tracker.repayCredit(commitment, 0);
    }
  });

  function mockRes(): CreditMiddlewareResponse & { statusCode: number; body: any } {
    const r: any = { statusCode: 0, body: null };
    r.status = (code: number) => { r.statusCode = code; return r; };
    r.json = (body: unknown) => { r.body = body; };
    return r;
  }

  it('returns 402 when no payload provided', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Credit extension required');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 402 for invalid payload', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = {
      body: {
        extensions: {
          [CREDIT_EXTENSION_KEY]: { info: { agentPk: 'Agent1', commitment: 'bad', requestedCredit: 10 } },
        },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Invalid credit payload');
    expect(next).not.toHaveBeenCalled();
  });

  it('approves valid credit request within limit', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent1',
      commitment,
      requestedCredit: 10,
    });
    const req: CreditMiddlewareRequest = { body: { extensions: payload } };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0); // not set
  });

  it('rejects when credit exceeds limit', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent1',
      commitment,
      requestedCredit: 99999,
    });
    const req: CreditMiddlewareRequest = { body: { extensions: payload } };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Credit not approved');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects for unknown commitment', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent1',
      commitment: '0x' + 'f'.repeat(64),
      requestedCredit: 10,
    });
    const req: CreditMiddlewareRequest = { body: { extensions: payload } };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls onApproved callback on success', async () => {
    const onApproved = jest.fn();
    const mw = creditMiddleware({ creditTracker: tracker, onApproved });
    const payload = buildCreditPayloadV2({
      agentPk: 'Agent1',
      commitment,
      requestedCredit: 5,
    });
    const req: CreditMiddlewareRequest = { body: { extensions: payload } };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(onApproved).toHaveBeenCalled();
    expect(onApproved.mock.calls[0][0].commitment).toBe(commitment);
  });

  it('calls onRejected callback on failure', async () => {
    const onRejected = jest.fn();
    const mw = creditMiddleware({ creditTracker: tracker, onRejected });
    const req: CreditMiddlewareRequest = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(onRejected).toHaveBeenCalled();
  });

  it('validates collateral fields when present', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = {
      body: {
        extensions: {
          [CREDIT_EXTENSION_KEY]: {
            info: {
              agentPk: 'Agent1',
              commitment,
              requestedCredit: 5,
              collateralEscrowPda: 'x', // too short
              collateralAmount: -1,
            },
          },
        },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Invalid credit payload');
  });

  it('rejects Infinity requestedCredit', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = {
      body: {
        extensions: {
          [CREDIT_EXTENSION_KEY]: {
            info: {
              agentPk: 'Agent1',
              commitment,
              requestedCredit: Infinity,
            },
          },
        },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Invalid credit payload');
  });

  it('rejects NaN collateralAmount', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = {
      body: {
        extensions: {
          [CREDIT_EXTENSION_KEY]: {
            info: {
              agentPk: 'Agent1',
              commitment,
              requestedCredit: 5,
              collateralEscrowPda: 'A'.repeat(40),
              collateralAmount: NaN,
            },
          },
        },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
  });

  it('rejects collateralEscrowPda without collateralAmount', async () => {
    const mw = creditMiddleware({ creditTracker: tracker });
    const req: CreditMiddlewareRequest = {
      body: {
        extensions: {
          [CREDIT_EXTENSION_KEY]: {
            info: {
              agentPk: 'Agent1',
              commitment,
              requestedCredit: 5,
              collateralEscrowPda: 'A'.repeat(40),
            },
          },
        },
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await mw(req, res, next);
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toContain('Invalid credit payload');
  });
});

describe('DynamicCreditTracker integration', () => {
  const commitment = '0x' + 'c'.repeat(64);

  it('serializes and deserializes state', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    for (let i = 0; i < 5; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 85);
    }
    await tracker.pledgeCollateral(commitment, 'EscrowPda' + '1'.repeat(30), 50);

    const json = await tracker.serialize();
    const restored = await DynamicCreditTracker.deserialize(json);

    const account = await restored.getAccount(commitment);
    expect(account).not.toBeNull();
    expect(account!.escrowsCompleted).toBe(5);
    expect(account!.collateralPledged).toBe(50);
    expect(account!.averageQualityScore).toBeCloseTo(85);
  });

  it('repayCredit returns true on success, false on missing', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    for (let i = 0; i < 5; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 80);
    }

    const success = await tracker.repayCredit(commitment, 10);
    expect(success).toBe(true);

    const fail = await tracker.repayCredit('0x' + '0'.repeat(64), 10);
    expect(fail).toBe(false);
  });

  it('useCredit rejects NaN amount', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    const result = await tracker.useCredit(commitment, NaN);
    expect(result).toBe(false);
  });

  it('useCredit rejects negative amount', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    const result = await tracker.useCredit(commitment, -5);
    expect(result).toBe(false);
  });

  it('pledgeCollateral rejects non-finite amount', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    const result = await tracker.pledgeCollateral(commitment, 'test', Infinity);
    expect(result).toBe(false);
  });

  it('releaseCollateral returns pledged amount', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);
    await tracker.pledgeCollateral(commitment, 'Escrow' + '1'.repeat(34), 75);

    const released = await tracker.releaseCollateral(commitment);
    expect(released).toBe(75);

    const account = await tracker.getAccount(commitment);
    expect(account!.collateralPledged).toBe(0);
  });

  it('concurrent useCredit does not exceed limit', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    for (let i = 0; i < 5; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 80);
    }
    for (let i = 0; i < 3; i++) {
      await tracker.repayCredit(commitment, 0);
    }

    const account = await tracker.getAccount(commitment);
    const limit = account!.effectiveCreditLimit;
    const half = Math.floor(limit / 2);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => tracker.useCredit(commitment, half))
    );
    const successes = results.filter(Boolean).length;
    expect(successes).toBeLessThanOrEqual(2);

    const final = await tracker.getAccount(commitment);
    expect(final!.usedCredit).toBeLessThanOrEqual(final!.effectiveCreditLimit);
  });

  it('quality score running average is stable', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    for (let i = 0; i < 10; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 80);
    }
    const account = await tracker.getAccount(commitment);
    expect(account!.averageQualityScore).toBeCloseTo(80, 5);

    for (let i = 0; i < 10; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 60);
    }
    const account2 = await tracker.getAccount(commitment);
    expect(account2!.averageQualityScore).toBeCloseTo(70, 5);
  });

  it('getCreditBreakdown returns scoring output', async () => {
    const store = new InMemoryCreditStoreV2();
    const tracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await tracker.registerAccount(commitment, 'Agent1', 80);

    for (let i = 0; i < 5; i++) {
      await tracker.recordEscrowOutcome(commitment, 'released', 90);
    }

    const breakdown = await tracker.getCreditBreakdown(commitment);
    expect(breakdown).not.toBeNull();
    expect(breakdown!.rawScore).toBeGreaterThan(0);
    expect(breakdown!.components.quality).toBeGreaterThan(0);
    expect(breakdown!.effectiveLimit).toBeGreaterThan(0);
  });
});
