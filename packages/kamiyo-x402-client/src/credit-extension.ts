import {
  declareCreditExtension,
  parseCreditExtension,
  parseCreditPayload,
  validateCreditPayload,
  buildCreditPayload,
  CREDIT_EXTENSION_KEY,
} from './v2/extensions';
import type {
  KamiyoCreditInfo,
  KamiyoCreditPayload,
  PaymentRequired402,
  ExtensionDeclaration,
  CreditScoringWeights,
} from './v2/types';
import type { DynamicCreditTracker } from './reputation-extension';

export { CREDIT_EXTENSION_KEY } from './v2/extensions';
export type { KamiyoCreditInfo, KamiyoCreditPayload } from './v2/types';

export function creditExtensionInfo(opts?: {
  maxCollateralMultiplier?: number;
  agingHalfLifeDays?: number;
  minHistoryForCredit?: number;
  scoringWeights?: Partial<CreditScoringWeights>;
}): Record<string, ExtensionDeclaration> {
  return declareCreditExtension(opts || {});
}

export function parseCreditRequirement(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): KamiyoCreditInfo | null {
  return parseCreditExtension(response);
}

export function buildCreditPayloadV2(data: {
  agentPk: string;
  commitment: string;
  requestedCredit: number;
  collateralEscrowPda?: string;
  collateralAmount?: number;
}): Record<string, ExtensionDeclaration> {
  return buildCreditPayload(data);
}

export function hasCreditProof(extensions?: Record<string, unknown>): boolean {
  return parseCreditPayload(extensions) !== null;
}

export interface CreditMiddlewareOptions {
  creditTracker: DynamicCreditTracker;
  maxCollateralMultiplier?: number;
  agingHalfLifeDays?: number;
  minHistoryForCredit?: number;
  scoringWeights?: Partial<CreditScoringWeights>;
  onApproved?: (payload: KamiyoCreditPayload, available: number) => void;
  onRejected?: (payload: KamiyoCreditPayload | null, reason: string) => void;
}

export type CreditMiddlewareRequest = {
  body?: { extensions?: Record<string, unknown> };
};

export type CreditMiddlewareResponse = {
  status: (code: number) => CreditMiddlewareResponse;
  json: (body: unknown) => void;
};

export type CreditNextFunction = (err?: unknown) => void;

export function creditMiddleware(opts: CreditMiddlewareOptions) {
  return async (
    req: CreditMiddlewareRequest,
    res: CreditMiddlewareResponse,
    next: CreditNextFunction
  ): Promise<void> => {
    const extensions = req.body?.extensions;
    const payload = parseCreditPayload(extensions);

    if (!payload) {
      const reason = 'Missing credit extension payload';
      opts.onRejected?.(null, reason);
      res.status(402).json({
        error: 'Credit extension required',
        reason,
        extensions: creditExtensionInfo({
          maxCollateralMultiplier: opts.maxCollateralMultiplier,
          agingHalfLifeDays: opts.agingHalfLifeDays,
          minHistoryForCredit: opts.minHistoryForCredit,
          scoringWeights: opts.scoringWeights,
        }),
      });
      return;
    }

    const validation = validateCreditPayload(payload);
    if (!validation.valid) {
      const reason = validation.errors[0];
      opts.onRejected?.(payload, reason);
      res.status(402).json({
        error: 'Invalid credit payload',
        reason,
      });
      return;
    }

    const creditCheck = await opts.creditTracker.checkCredit(
      payload.commitment,
      payload.requestedCredit
    );

    if (!creditCheck.approved) {
      opts.onRejected?.(payload, creditCheck.reason || 'Credit check failed');
      res.status(402).json({
        error: 'Credit not approved',
        reason: creditCheck.reason,
        availableCredit: creditCheck.availableCredit,
      });
      return;
    }

    const used = await opts.creditTracker.useCredit(payload.commitment, payload.requestedCredit);
    if (!used) {
      opts.onRejected?.(payload, 'Failed to reserve credit');
      res.status(402).json({
        error: 'Credit reservation failed',
        reason: 'Concurrent credit use exceeded limit',
      });
      return;
    }

    opts.onApproved?.(payload, creditCheck.availableCredit);
    next();
  };
}
