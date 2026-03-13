import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { getUsdcBalance } from '../services/settlement';
import { getBaseFacilitatorAddress, getBaseUsdcAllowanceMicro, getBaseUsdcBalanceForAddress, getBaseUsdcBalanceMicroForAddress, isBaseEnabled } from '../services/base-settlement';
import { getConfig } from '../config';
import { VerifyResponse } from '../types';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2, isValidPayerForNetwork } from '../protocol/networks';
import { parseSignedUsdcAmount, parseUsdcMicroAmountBigint, parseVerifyInput } from '../protocol/request-compat';
import {
  createKizunaReservation,
  getKizunaCollateralPosition,
  getKizunaCollateralSummary,
  getKizunaEnterpriseBalance,
  getKizunaFastpathPool,
  getKizunaAccount,
  getKizunaOutstandingMicro,
  getKizunaReservationByNonce,
  getKizunaUnderwriteSnapshot,
  KizunaLane,
  getPaymentSessionByTokenHash,
  insertKizunaUnderwriteDecision,
} from '../db/queries';
import { hashSessionToken, parseSessionPaymentHeader } from '../services/session';
import { getUsdcDelegateState } from '../services/solana-session';
import { runKizunaUnderwrite } from '../services/kizuna-underwrite';
import { getKizunaMandateLimits } from '../services/kizuna-wallet-control-plane';
import {
  evaluateKizunaKernelDecision,
  hashKizunaDecisionEnvelope,
  KernelEvaluateResult,
  mintLocalKizunaEnvelope,
} from '../services/kizuna-kernel';
import { buildKizunaIdentityPayload, getAuthorizedRegistryWallet } from '../services/agent-registry';

function sendVerifyFailure(
  res: Response,
  status: number,
  reason: string,
  message: string,
  payer?: string
): void {
  res.status(status).json({
    isValid: false,
    valid: false,
    invalidReason: reason,
    invalidMessage: message,
    payer,
    error: message,
    sufficient: false,
  });
}

function parseNonNegativeBigint(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function toRiskBand(scoreRaw: number, lane: KizunaLane, healthFactor?: number): string {
  if (lane === 'crypto-fast') {
    if ((healthFactor ?? 0) < 1) return 'critical';
    if ((healthFactor ?? 0) < 1.2) return 'elevated';
  }
  if (scoreRaw >= 700) return 'low';
  if (scoreRaw >= 450) return 'medium';
  return 'high';
}

function buildFallbackDecision(params: {
  agentId: string;
  payerWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  requestedMicro: bigint;
  outstandingMicro: bigint;
  maxSingleMicro: bigint;
  mandateSingleLimitMicro: bigint | null;
  snapshot: NonNullable<Awaited<ReturnType<typeof getKizunaUnderwriteSnapshot>>>;
  collateral?: {
    effectiveCollateralMicro: bigint;
    ltvCapBps: number;
    healthFactor: number;
  };
}): KernelEvaluateResult {
  const underwrite = runKizunaUnderwrite({
    requestedMicro: params.requestedMicro,
    outstandingMicro: params.outstandingMicro,
    maxSingleMicro: params.maxSingleMicro,
    mandateSingleLimitMicro: params.mandateSingleLimitMicro,
    snapshot: params.snapshot,
  });

  let availableMicro = underwrite.availableMicro;
  let approvedMicro = underwrite.approvedMicro;
  let ltvBps: number | undefined;
  let healthFactor: number | undefined;
  const reasonCodes = [...underwrite.reasonCodes];

  if (params.lane === 'crypto-fast') {
    if (!params.collateral) {
      availableMicro = 0n;
      approvedMicro = 0n;
      reasonCodes.push('fastpath_no_collateral');
    } else {
      const collateralLimit =
        (params.collateral.effectiveCollateralMicro * BigInt(params.collateral.ltvCapBps)) / 10_000n;
      const collateralAvailable =
        collateralLimit > params.outstandingMicro ? collateralLimit - params.outstandingMicro : 0n;

      availableMicro = minBigint(availableMicro, collateralAvailable);
      approvedMicro = minBigint(params.requestedMicro, availableMicro);
      healthFactor = params.collateral.healthFactor;
      ltvBps =
        params.collateral.effectiveCollateralMicro > 0n
          ? Number(
              (params.outstandingMicro * 10_000n) / params.collateral.effectiveCollateralMicro
            )
          : 0;

      if (collateralAvailable <= 0n) {
        reasonCodes.push('fastpath_collateral_limit_reached');
      }
      if ((healthFactor ?? 0) < 1) {
        reasonCodes.push('fastpath_health_factor_breach');
        approvedMicro = 0n;
      }
    }
  }

  const decisionId = `fallback:${params.payerWallet}:${params.requestNonce}`;
  const policyPackId =
    params.lane === 'crypto-fast' ? 'kizuna-fastpath-default-v1' : 'kizuna-enterprise-default-v1';
  const riskBand = toRiskBand(underwrite.scoreRaw, params.lane, healthFactor);

  const decisionEnvelope = mintLocalKizunaEnvelope({
    decisionId,
    agentId: params.agentId,
    payerWallet: params.payerWallet,
    requestNonce: params.requestNonce,
    network: params.network,
    lane: params.lane,
    poolId: params.poolId,
    approvedMicro: approvedMicro.toString(10),
    policyPackId,
    riskBand,
    ltvBps,
    healthFactor,
  });

  return {
    approved: approvedMicro > 0n,
    decisionId,
    approvedMicro: approvedMicro.toString(10),
    availableMicro: availableMicro.toString(10),
    outstandingMicro: params.outstandingMicro.toString(10),
    scoreRaw: underwrite.scoreRaw,
    reasonCodes,
    tier: underwrite.tier,
    lane: params.lane,
    poolId: params.poolId,
    policyPackId,
    riskBand,
    ltvBps,
    healthFactor,
    decisionEnvelope,
  };
}

export function createVerifyRouter(connection: Connection, facilitator: PublicKey): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const parsedInput = parseVerifyInput(req.body);
    if (!parsedInput.ok) {
      sendVerifyFailure(res, 400, 'invalid_request', parsedInput.error);
      return;
    }

    const {
      paymentHeader,
      resource,
      maxAmount,
      requirementAmountRaw,
      requirementNetwork,
      requirementPayTo,
      requirementKizuna,
    } = parsedInput.value;

    const scheme = parsePaymentScheme(paymentHeader);
    const network = scheme ? canonicalizeNetwork(scheme.network) : null;
    if (!scheme || !network || !isSupportedNetwork(network, isBaseEnabled())) {
      sendVerifyFailure(res, 400, 'unsupported_network', 'Unsupported network');
      return;
    }

    if (requirementNetwork) {
      const requiredNetwork = canonicalizeNetwork(requirementNetwork);
      if (!requiredNetwork || requiredNetwork !== network) {
        sendVerifyFailure(res, 400, 'network_mismatch', 'paymentRequirements.network does not match payment payload network');
        return;
      }
    }

    if (requirementKizuna) {
      const config = getConfig();
      if (!config.KIZUNA_ENABLED) {
        sendVerifyFailure(res, 400, 'kizuna_disabled', 'Kizuna credit mode is disabled');
        return;
      }

      if (scheme.scheme === 'session') {
        sendVerifyFailure(res, 400, 'invalid_request', 'Kizuna does not support session payment headers');
        return;
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        sendVerifyFailure(res, 400, 'invalid_payment_payload', 'Malformed payment header');
        return;
      }

      if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
        sendVerifyFailure(res, 400, 'payment_expired', 'Payment expired', payment.payer);
        return;
      }

      if (!verifyPaymentAuth(payment)) {
        sendVerifyFailure(res, 400, 'invalid_signature', 'Invalid signature', payment.payer);
        return;
      }

      if (!isValidPayerForNetwork(payment.payer, network)) {
        sendVerifyFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', payment.payer);
        return;
      }

      if (!requirementAmountRaw) {
        sendVerifyFailure(res, 400, 'invalid_amount', 'Missing payment requirement amount', payment.payer);
        return;
      }

      const lane = requirementKizuna.lane;
      const poolId =
        requirementKizuna.poolId ||
        (lane === 'crypto-fast'
          ? config.KIZUNA_FASTPATH_POOL_ID
          : config.KIZUNA_ENTERPRISE_POOL_ID);

      if (config.KIZUNA_SECURED_ONLY && lane !== 'crypto-fast') {
        sendVerifyFailure(
          res,
          403,
          'kizuna_lane_disabled',
          'Enterprise lane is disabled in secured-only mode',
          payment.payer
        );
        return;
      }

      const requestedMicro = parseUsdcMicroAmountBigint(requirementAmountRaw);
      if (requestedMicro == null) {
        sendVerifyFailure(res, 400, 'invalid_amount', 'Invalid payment requirement amount', payment.payer);
        return;
      }

      const requestedAmount = Number(requestedMicro) / 1_000_000;
      if (maxAmount != null && requestedAmount > maxAmount) {
        sendVerifyFailure(res, 400, 'amount_exceeds_maximum', 'Amount exceeds maximum', payment.payer);
        return;
      }
      if (requestedAmount > config.MAX_SETTLEMENT_AMOUNT) {
        sendVerifyFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds facilitator limit', payment.payer);
        return;
      }

      const account = await getKizunaAccount(requirementKizuna.agentId);
      if (!account || account.status !== 'active') {
        sendVerifyFailure(res, 404, 'kizuna_account_not_found', 'Kizuna account not found', payment.payer);
        return;
      }
      const identity = await buildKizunaIdentityPayload(account);
      const isLegacyIdentity = account.registry_sync_source === 'legacy';
      if ((!identity || !identity.synced) && !(config.KIZUNA_ALLOW_LEGACY_AGENT_IDS && isLegacyIdentity)) {
        sendVerifyFailure(
          res,
          409,
          'kizuna_identity_unsynced',
          'Kizuna identity is not synced with Agent Registry',
          payment.payer
        );
        return;
      }
      if (!isLegacyIdentity) {
        if (account.registry_active !== true) {
          sendVerifyFailure(
            res,
            409,
            'kizuna_identity_inactive',
            'Agent Registry identity is inactive',
            payment.payer
          );
          return;
        }
        const authorizedWallet = getAuthorizedRegistryWallet(account);
        if (!authorizedWallet || authorizedWallet !== payment.payer) {
          sendVerifyFailure(
            res,
            400,
            'kizuna_identity_wallet_mismatch',
            'Payment payer does not match the registered agent wallet',
            payment.payer
          );
          return;
        }
      }
      if (account.payer_wallet !== payment.payer) {
        sendVerifyFailure(res, 400, 'payer_mismatch', 'Kizuna payer mismatch', payment.payer);
        return;
      }
      if (account.repay_wallet !== requirementKizuna.repayWallet) {
        sendVerifyFailure(res, 400, 'repay_wallet_mismatch', 'Kizuna repay wallet mismatch', payment.payer);
        return;
      }

      const replay = await getKizunaReservationByNonce(payment.payer, payment.nonce);
      if (replay) {
        if (replay.lane !== lane || replay.pool_id !== poolId) {
          sendVerifyFailure(res, 409, 'kizuna_cross_lane_replay', 'Reservation exists for different lane or pool', payment.payer);
          return;
        }

        const stillReserved =
          replay.status === 'reserved' && new Date(replay.expires_at).getTime() > Date.now();
        const settled = replay.status === 'consumed';
        const effectiveApproved = settled || stillReserved || config.KIZUNA_SHADOW_MODE;
        const response: VerifyResponse = {
          valid: effectiveApproved,
          isValid: effectiveApproved,
          payer: payment.payer,
          amount: requestedAmount.toString(),
          resource: payment.resource || resource || '',
          balance: 0,
          sufficient: effectiveApproved,
          extensions: {
            kamiyo: {
              network,
              balance: 0,
              sufficient: effectiveApproved,
            },
            kizuna: {
              approved: replay.decision.approved,
              decisionId: replay.decision.id,
              approvedMicro: replay.decision.approved_micro,
              availableMicro: replay.decision.available_micro,
              lockedMicro: replay.locked_micro,
              outstandingMicro: replay.decision.outstanding_micro,
              lane: replay.lane,
              poolId: replay.pool_id,
              fundingMode: replay.funding_mode,
              policyPackId: replay.decision.policy_pack_id,
              riskBand: replay.decision.risk_band,
              ltvBps: replay.decision.ltv_bps,
              healthFactor: replay.decision.health_factor
                ? Number(replay.decision.health_factor)
                : undefined,
              identity,
              decisionEnvelope: null,
              replayed: true,
            },
          },
        };

        if (!effectiveApproved) {
          response.error = 'Kizuna reservation is no longer active';
          response.invalidReason = 'kizuna_reservation_inactive';
          response.invalidMessage = response.error;
        }

        res.json(response);
        return;
      }

      const [snapshot, outstandingMicro, fastpathPool, enterpriseBalance] = await Promise.all([
        getKizunaUnderwriteSnapshot(requirementKizuna.agentId, payment.payer),
        getKizunaOutstandingMicro(requirementKizuna.agentId, { lane, poolId }),
        lane === 'crypto-fast' ? getKizunaFastpathPool(poolId) : Promise.resolve(null),
        lane === 'enterprise' && config.KIZUNA_ENTERPRISE_REQUIRE_PREFUND
          ? getKizunaEnterpriseBalance(requirementKizuna.agentId, poolId)
          : Promise.resolve(null),
      ]);

      if (!snapshot) {
        sendVerifyFailure(res, 404, 'kizuna_account_not_found', 'Kizuna account not found', payment.payer);
        return;
      }

      if (lane === 'crypto-fast' && (!fastpathPool || fastpathPool.status !== 'active')) {
        sendVerifyFailure(res, 409, 'kizuna_pool_unavailable', 'Fast path pool is unavailable', payment.payer);
        return;
      }

      if (lane === 'enterprise' && config.KIZUNA_ENTERPRISE_REQUIRE_PREFUND) {
        const prefundAvailable = parseNonNegativeBigint(enterpriseBalance?.available_micro);
        if (prefundAvailable < requestedMicro) {
          sendVerifyFailure(
            res,
            409,
            'kizuna_prefund_insufficient',
            'Insufficient prefunded balance for enterprise lane',
            payment.payer
          );
          return;
        }
      }

      const laneMaxSingleMicro =
        lane === 'crypto-fast' && fastpathPool?.max_single_micro
          ? parseNonNegativeBigint(fastpathPool.max_single_micro)
          : BigInt(config.KIZUNA_MAX_SINGLE_MICRO);

      let mandateSingleLimitMicro = parseNonNegativeBigint(account.mandate_single_limit_micro);
      try {
        const limits = await getKizunaMandateLimits(requirementKizuna.agentId);
        if (limits?.caps.singleMicro) {
          mandateSingleLimitMicro = parseNonNegativeBigint(limits.caps.singleMicro);
        }
      } catch {
        // keep cached mandate cap when control-plane lookup fails
      }

      let collateralContext:
        | {
            collateralAccount: string;
            assetId: string;
            totalDepositedMicro: string;
            totalWithdrawnMicro: string;
            availableMicro: string;
            effectiveCollateralMicro: string;
            ltvCapBps: number;
            healthFactor: number;
          }
        | undefined;

      if (lane === 'crypto-fast') {
        const collateralAccount = requirementKizuna.collateralAccount!;
        const collateralPosition = await getKizunaCollateralPosition({
          agentId: requirementKizuna.agentId,
          poolId,
          collateralAccount,
        });
        const summary = await getKizunaCollateralSummary(requirementKizuna.agentId, poolId);
        if (collateralPosition && summary) {
          collateralContext = {
            collateralAccount,
            assetId: collateralPosition.assets[0]?.assetId || 'usdc',
            totalDepositedMicro: collateralPosition.totalAvailableMicro,
            totalWithdrawnMicro: '0',
            availableMicro: collateralPosition.totalAvailableMicro,
            effectiveCollateralMicro: collateralPosition.effectiveCollateralMicro,
            ltvCapBps: fastpathPool?.ltv_cap_bps || config.KIZUNA_FASTPATH_LTV_CAP_BPS,
            healthFactor: summary.healthFactor,
          };
        }
      }

      let decisionResult: KernelEvaluateResult;
      try {
        decisionResult = await evaluateKizunaKernelDecision({
          agentId: requirementKizuna.agentId,
          payerWallet: payment.payer,
          repayWallet: requirementKizuna.repayWallet,
          requestNonce: payment.nonce,
          network,
          requestedMicro: requestedMicro.toString(10),
          maxSingleMicro: laneMaxSingleMicro.toString(10),
          outstandingMicro: outstandingMicro.toString(10),
          lane,
          poolId,
          mandateSingleLimitMicro:
            mandateSingleLimitMicro > 0n ? mandateSingleLimitMicro.toString(10) : null,
          accountStatus: account.status,
          accountAgeDays: Math.max(
            0,
            Math.floor((Date.now() - snapshot.accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000))
          ),
          settlementCount: snapshot.settlementsConfirmed,
          disputesFiled: snapshot.disputesFiled,
          disputesWon: snapshot.disputesWon,
          avgQuality: snapshot.avgQuality,
          debtClosed: snapshot.debtsClosed,
          debtTotal: snapshot.debtsTotal,
          collateral: collateralContext,
        });
      } catch (err) {
        if (config.KIZUNA_KERNEL_FAIL_CLOSED && !config.KIZUNA_SHADOW_MODE) {
          sendVerifyFailure(
            res,
            503,
            'kizuna_kernel_unavailable',
            `Kizuna kernel evaluate failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            payment.payer
          );
          return;
        }

        decisionResult = buildFallbackDecision({
          agentId: requirementKizuna.agentId,
          payerWallet: payment.payer,
          requestNonce: payment.nonce,
          network,
          lane,
          poolId,
          requestedMicro,
          outstandingMicro,
          maxSingleMicro: laneMaxSingleMicro > 0n ? laneMaxSingleMicro : BigInt(config.KIZUNA_MAX_SINGLE_MICRO),
          mandateSingleLimitMicro: mandateSingleLimitMicro > 0n ? mandateSingleLimitMicro : null,
          snapshot,
          collateral:
            lane === 'crypto-fast' && collateralContext
              ? {
                  effectiveCollateralMicro: parseNonNegativeBigint(
                    collateralContext.effectiveCollateralMicro
                  ),
                  ltvCapBps: collateralContext.ltvCapBps,
                  healthFactor: collateralContext.healthFactor,
                }
              : undefined,
        });
      }

      const envelopeHash = decisionResult.decisionEnvelope
        ? hashKizunaDecisionEnvelope(decisionResult.decisionEnvelope)
        : null;

      const decision = await insertKizunaUnderwriteDecision({
        agentId: requirementKizuna.agentId,
        payerWallet: payment.payer,
        repayWallet: requirementKizuna.repayWallet,
        requestNonce: payment.nonce,
        network,
        lane: decisionResult.lane,
        poolId: decisionResult.poolId,
        requestedMicro: requestedMicro.toString(10),
        approved: decisionResult.approved,
        approvedMicro: decisionResult.approvedMicro,
        availableMicro: decisionResult.availableMicro,
        outstandingMicro: decisionResult.outstandingMicro,
        scoreRaw: decisionResult.scoreRaw,
        reasonCodes: decisionResult.reasonCodes,
        tier: decisionResult.tier,
        policyPackId: decisionResult.policyPackId,
        riskBand: decisionResult.riskBand,
        ltvBps: decisionResult.ltvBps ?? null,
        healthFactor:
          decisionResult.healthFactor != null
            ? decisionResult.healthFactor.toString()
            : null,
        decisionEnvelopeHash: envelopeHash,
      });

      const decisionAvailableMicro = parseNonNegativeBigint(decisionResult.availableMicro);
      const prefundAvailableMicro =
        lane === 'enterprise' && config.KIZUNA_ENTERPRISE_REQUIRE_PREFUND
          ? parseNonNegativeBigint(enterpriseBalance?.available_micro)
          : null;
      const effectiveAvailableMicro =
        prefundAvailableMicro == null
          ? decisionAvailableMicro
          : minBigint(decisionAvailableMicro, prefundAvailableMicro);
      const approvedMicro = minBigint(
        parseNonNegativeBigint(decisionResult.approvedMicro),
        effectiveAvailableMicro
      );
      const reserveMicro =
        approvedMicro > 0n ? approvedMicro : config.KIZUNA_SHADOW_MODE ? requestedMicro : 0n;
      const requestedFundingMode =
        lane === 'enterprise' && config.KIZUNA_ENTERPRISE_REQUIRE_PREFUND
          ? 'prefunded'
          : lane === 'crypto-fast'
            ? 'collateralized'
            : 'none';
      const requestedLockedMicro = requestedFundingMode === 'prefunded' ? reserveMicro : 0n;
      let reservationLockedMicro = requestedLockedMicro;
      let reservationFundingMode: 'none' | 'prefunded' | 'collateralized' = requestedFundingMode;

      if (reserveMicro > 0n) {
        try {
          const reservation = await createKizunaReservation({
            decisionId: decision.id,
            agentId: requirementKizuna.agentId,
            payerWallet: payment.payer,
            requestNonce: payment.nonce,
            network,
            lane: decisionResult.lane,
            poolId: decisionResult.poolId,
            amountMicro: reserveMicro.toString(10),
            ttlMs: config.KIZUNA_RESERVATION_TTL_MS,
            fundingMode: requestedFundingMode,
            lockedMicro: requestedLockedMicro.toString(10),
          });
          reservationLockedMicro = parseNonNegativeBigint(reservation.locked_micro);
          reservationFundingMode = reservation.funding_mode;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'kizuna_reservation_failed';
          if (message.includes('kizuna_prefund_insufficient')) {
            sendVerifyFailure(
              res,
              409,
              'kizuna_prefund_insufficient',
              'Insufficient prefunded balance for enterprise lane',
              payment.payer
            );
            return;
          }
          const idempotentReservation = await getKizunaReservationByNonce(payment.payer, payment.nonce);
          if (!idempotentReservation) {
            sendVerifyFailure(res, 500, 'server_error', 'Failed to reserve Kizuna credit', payment.payer);
            return;
          }
          reservationLockedMicro = parseNonNegativeBigint(idempotentReservation.locked_micro);
          reservationFundingMode = idempotentReservation.funding_mode;
        }
      }

      const decisionApproved = decisionResult.approved && approvedMicro > 0n;
      const effectiveApproved = decisionApproved || config.KIZUNA_SHADOW_MODE;
      const response: VerifyResponse = {
        valid: effectiveApproved,
        isValid: effectiveApproved,
        payer: payment.payer,
        amount: requestedAmount.toString(),
        resource: payment.resource || resource || '',
        balance: 0,
        sufficient: effectiveApproved,
        extensions: {
          kamiyo: {
            network,
            balance: 0,
            sufficient: effectiveApproved,
          },
          kizuna: {
            approved: decisionApproved,
            decisionId: decision.id,
            approvedMicro: approvedMicro.toString(10),
            availableMicro: effectiveAvailableMicro.toString(10),
            lockedMicro: reservationLockedMicro.toString(10),
            outstandingMicro: decisionResult.outstandingMicro,
            fundingMode: reservationFundingMode,
            lane: decisionResult.lane,
            decisionEnvelope: decisionResult.decisionEnvelope,
            policyPackId: decisionResult.policyPackId,
            riskBand: decisionResult.riskBand,
            poolId: decisionResult.poolId,
            ltvBps: decisionResult.ltvBps,
            healthFactor: decisionResult.healthFactor,
            identity,
          },
        },
      };

      if (!effectiveApproved) {
        response.error = 'Kizuna credit not approved';
        response.invalidReason = 'kizuna_credit_denied';
        response.invalidMessage = decisionResult.reasonCodes.join(', ');
      }

      res.json(response);
      return;
    }

    if (scheme.scheme === 'session') {
      const sessionHeader = parseSessionPaymentHeader(paymentHeader);
      if (!sessionHeader || canonicalizeNetwork(sessionHeader.network) !== network) {
        sendVerifyFailure(res, 400, 'invalid_session_header', 'Malformed session payment header');
        return;
      }

      const session = await getPaymentSessionByTokenHash(hashSessionToken(sessionHeader.token));
      if (!session) {
        sendVerifyFailure(res, 401, 'invalid_session', 'Invalid or unknown session token');
        return;
      }

      if (session.revoked_at) {
        sendVerifyFailure(res, 401, 'session_revoked', 'Session token revoked');
        return;
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        sendVerifyFailure(res, 401, 'session_expired', 'Session token expired');
        return;
      }

      const sessionNetwork = canonicalizeNetwork(session.network);
      if (!sessionNetwork || sessionNetwork !== network) {
        sendVerifyFailure(res, 400, 'network_mismatch', 'Session network does not match payment payload network');
        return;
      }

      if (requirementPayTo && session.merchant_wallet !== requirementPayTo) {
        sendVerifyFailure(res, 400, 'merchant_mismatch', 'Session token not valid for this merchant');
        return;
      }

      if (!requirementAmountRaw) {
        sendVerifyFailure(res, 400, 'invalid_amount', 'Missing payment requirement amount', session.payer_wallet);
        return;
      }

      const requiredMicro = parseUsdcMicroAmountBigint(requirementAmountRaw);
      if (requiredMicro == null) {
        sendVerifyFailure(res, 400, 'invalid_amount', 'Invalid payment requirement amount', session.payer_wallet);
        return;
      }

      let maxTotalMicro: bigint;
      let spentMicro: bigint;
      try {
        maxTotalMicro = BigInt(session.max_total_micro);
        spentMicro = BigInt(session.spent_micro);
      } catch {
        sendVerifyFailure(res, 500, 'server_error', 'Invalid session limits', session.payer_wallet);
        return;
      }

      if (spentMicro < 0n || spentMicro > maxTotalMicro) {
        sendVerifyFailure(res, 500, 'server_error', 'Invalid session limits', session.payer_wallet);
        return;
      }

      if (spentMicro + requiredMicro > maxTotalMicro) {
        sendVerifyFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds remaining session cap', session.payer_wallet);
        return;
      }

      if (session.max_single_micro) {
        try {
          if (requiredMicro > BigInt(session.max_single_micro)) {
            sendVerifyFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds session per-request limit', session.payer_wallet);
            return;
          }
        } catch {
          sendVerifyFailure(res, 500, 'server_error', 'Invalid session limits');
          return;
        }
      }

      const requiredAmount = Number(requiredMicro) / 1_000_000;
      const config = getConfig();

      if (maxAmount != null && requiredAmount > maxAmount) {
        sendVerifyFailure(res, 400, 'amount_exceeds_maximum', 'Amount exceeds maximum', session.payer_wallet);
        return;
      }

      if (requiredAmount > config.MAX_SETTLEMENT_AMOUNT) {
        sendVerifyFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds facilitator limit', session.payer_wallet);
        return;
      }

      if (!isValidPayerForNetwork(session.payer_wallet, network)) {
        sendVerifyFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', session.payer_wallet);
        return;
      }

      let balanceMicro: bigint = 0n;
      let allowanceMicro: bigint = 0n;
      let sessionMeta: Record<string, unknown> = {};
      try {
        if (network === BASE_MAINNET_CAIP2) {
          const spender = getBaseFacilitatorAddress();
          if (!spender) {
            sendVerifyFailure(res, 500, 'server_error', 'Base facilitator not configured', session.payer_wallet);
            return;
          }
          [balanceMicro, allowanceMicro] = await Promise.all([
            getBaseUsdcBalanceMicroForAddress(session.payer_wallet),
            getBaseUsdcAllowanceMicro(session.payer_wallet, spender),
          ]);
          sessionMeta = { spender, allowanceMicro: allowanceMicro.toString() };
        } else {
          const payerKey = new PublicKey(session.payer_wallet);
          const state = await getUsdcDelegateState(connection, payerKey);
          balanceMicro = state.balanceMicro;
          allowanceMicro = state.delegate && state.delegate.equals(facilitator) ? state.delegatedMicro : 0n;
          sessionMeta = { delegatedMicro: allowanceMicro.toString() };
        }
      } catch {
        sendVerifyFailure(res, 502, 'balance_lookup_failed', 'Balance lookup failed', session.payer_wallet);
        return;
      }

      const balance = Number(balanceMicro) / 1_000_000;
      const sufficient = balanceMicro >= requiredMicro && allowanceMicro >= requiredMicro;
      const response: VerifyResponse = {
        valid: sufficient,
        isValid: sufficient,
        payer: session.payer_wallet,
        amount: requiredAmount.toString(),
        resource: resource || '',
        balance,
        sufficient,
        extensions: {
          kamiyo: {
            network,
            balance,
            sufficient,
            session: sessionMeta,
          },
        },
      };

      if (!sufficient) {
        const allowanceLabel = network === BASE_MAINNET_CAIP2 ? 'Allowance insufficient' : 'Delegated allowance insufficient';
        response.error = allowanceMicro < requiredMicro ? allowanceLabel : 'Insufficient USDC balance';
        response.invalidReason = allowanceMicro < requiredMicro ? 'insufficient_allowance' : 'insufficient_funds';
        response.invalidMessage = response.error;
      }

      res.json(response);
      return;
    }

    const payment = decodePaymentHeader(paymentHeader);
    if (!payment) {
      sendVerifyFailure(res, 400, 'invalid_payment_payload', 'Malformed payment header');
      return;
    }

    const config = getConfig();

    if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
      sendVerifyFailure(res, 400, 'payment_expired', 'Payment expired', payment.payer);
      return;
    }

    if (!verifyPaymentAuth(payment)) {
      sendVerifyFailure(res, 400, 'invalid_signature', 'Invalid signature', payment.payer);
      return;
    }

    if (!isValidPayerForNetwork(payment.payer, network)) {
      sendVerifyFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', payment.payer);
      return;
    }

    const amountRaw = Number(payment.amount);
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      sendVerifyFailure(res, 400, 'invalid_amount', 'Invalid amount', payment.payer);
      return;
    }

    const amount = parseSignedUsdcAmount(payment.amount, requirementAmountRaw);
    if (amount == null) {
      sendVerifyFailure(res, 400, 'amount_mismatch', 'Amount mismatch with payment requirements', payment.payer);
      return;
    }

    if (maxAmount != null && amount > maxAmount) {
      sendVerifyFailure(res, 400, 'amount_exceeds_maximum', 'Amount exceeds maximum', payment.payer);
      return;
    }

    if (amount > config.MAX_SETTLEMENT_AMOUNT) {
      sendVerifyFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds facilitator limit', payment.payer);
      return;
    }

    if (resource && payment.resource && resource !== payment.resource) {
      sendVerifyFailure(res, 400, 'resource_mismatch', 'Resource mismatch', payment.payer);
      return;
    }

    let balance = 0;
    if (network === BASE_MAINNET_CAIP2) {
      try {
        balance = await getBaseUsdcBalanceForAddress(payment.payer);
      } catch {
        sendVerifyFailure(res, 502, 'balance_lookup_failed', 'Balance lookup failed', payment.payer);
        return;
      }
    } else {
      try {
        const payerKey = new PublicKey(payment.payer);
        balance = await getUsdcBalance(connection, payerKey);
      } catch {
        sendVerifyFailure(res, 502, 'balance_lookup_failed', 'Balance lookup failed', payment.payer);
        return;
      }
    }

    const sufficient = balance >= amount;
    const response: VerifyResponse = {
      valid: sufficient,
      isValid: sufficient,
      payer: payment.payer,
      amount: amount.toString(),
      resource: payment.resource || resource || '',
      balance,
      sufficient,
      extensions: {
        kamiyo: {
          network,
          balance,
          sufficient,
        },
      },
    };

    if (!sufficient) {
      response.error = 'Insufficient USDC balance';
      response.invalidReason = 'insufficient_funds';
      response.invalidMessage = 'Insufficient USDC balance';
    }

    res.json(response);
  });

  return router;
}
