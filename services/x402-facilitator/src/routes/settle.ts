import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { settlePayment, toBaseUnits } from '../services/settlement';
import { isAddress, verifyTypedData } from 'ethers';
import {
  BASE_USDC,
  getBaseProvider,
  getBaseUsdcEip712Domain,
  settleAuthorizedPaymentBase,
  settleDelegatedPaymentBase,
  settlePaymentBase,
  isBaseEnabled,
} from '../services/base-settlement';
import { calculateFeeDiscountPct, applyDiscount } from '../services/reputation';
import { getConfig } from '../config';
import {
  insertSettlement,
  updateSettlementConfirmed,
  updateSettlementStatus,
  insertFeeLedger,
  getSettlementStats,
  getWalletDisputeStats,
  getWalletAverageQuality,
  getMonthlyVolume,
  reservePaymentNonce,
  getPaymentNonceGuard,
  setPaymentNonceSettlementId,
  setPaymentNonceTxHash,
  deletePaymentNonceGuard,
  getSettlementById,
  getPaymentSessionByTokenHash,
  reservePaymentSessionSpend,
  releasePaymentSessionSpend,
  finalizeKizunaSettlement,
  getKizunaAccount,
  getKizunaDebtByReservationId,
  getKizunaReservationByNonce,
  releaseKizunaReservation,
} from '../db/queries';
import { calculateReputationScore } from '../services/reputation';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2, isValidPayerForNetwork } from '../protocol/networks';
import { parseSignedUsdcAmount, parseSettleInput, parseUsdcMicroAmountBigint } from '../protocol/request-compat';
import { hashSessionToken, parseSessionPaymentHeader } from '../services/session';
import { settleDelegatedUsdcTransfer } from '../services/solana-session';
import {
  commitKizunaKernelDecision,
  hashKizunaDecisionEnvelope,
  verifyKizunaDecisionEnvelope,
} from '../services/kizuna-kernel';

function sendSettleFailure(
  res: Response,
  status: number,
  reason: string,
  message: string,
  network: string,
  payer?: string
): void {
  res.status(status).json({
    success: false,
    errorReason: reason,
    errorMessage: message,
    error: message,
    payer,
    transaction: '',
    txHash: '',
    network,
  });
}



type TransferWithAuthorization = {
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

function parseTransferWithAuthorization(input: unknown, label: string): TransferWithAuthorization | null {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid ${label}`);
  }

  const record = input as { [k: string]: unknown };
  if (record.kind !== 'transferWithAuthorization') {
    throw new Error(`Unsupported ${label}.kind`);
  }

  let validAfter: bigint;
  let validBefore: bigint;
  try {
    validAfter = BigInt(record.validAfter as string);
    validBefore = BigInt(record.validBefore as string);
  } catch {
    throw new Error(`Invalid ${label} validity window`);
  }

  const nonce = typeof record.nonce === 'string' ? record.nonce.trim() : '';
  const signature = typeof record.signature === 'string' ? record.signature.trim() : '';

  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
    throw new Error(`Invalid ${label}.nonce`);
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(`Invalid ${label}.signature`);
  }

  return {
    validAfter,
    validBefore,
    nonce: nonce as `0x${string}`,
    signature: signature as `0x${string}`,
  };
}

function verifyTransferWithAuthorization(params: {
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  from: string;
  to: string;
  value: bigint;
  auth: TransferWithAuthorization;
}): boolean {
  const recovered = verifyTypedData(
    params.domain,
    {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter: params.auth.validAfter,
      validBefore: params.auth.validBefore,
      nonce: params.auth.nonce,
    },
    params.auth.signature
  );

  return recovered.toLowerCase() === params.from.toLowerCase();
}
export function createSettleRouter(connection: Connection, facilitatorKeypair: Keypair): Router {
  const router = Router();
  const getErrorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'unknown error';

  router.post('/', async (req: Request, res: Response) => {
    const parsedInput = parseSettleInput(req.body);
    if (!parsedInput.ok) {
      sendSettleFailure(res, 400, 'invalid_request', parsedInput.error, 'unknown:unknown');
      return;
    }

    const {
      mode,
      paymentHeader,
      merchantWallet,
      amount: legacyAmount,
      asset,
      requirementAmountRaw,
      requirementNetwork,
      requirementResource,
      requirementKizuna,
    } = parsedInput.value;

    const normalizedAsset = asset || 'USDC';
    if (normalizedAsset !== 'USDC') {
      sendSettleFailure(res, 400, 'unsupported_asset', 'Only USDC supported', 'unknown:unknown');
      return;
    }

    const scheme = parsePaymentScheme(paymentHeader);
    const network = scheme ? canonicalizeNetwork(scheme.network) : null;
    if (!scheme || !network || !isSupportedNetwork(network, isBaseEnabled())) {
      sendSettleFailure(res, 400, 'unsupported_network', 'Unsupported network', network || 'unknown:unknown');
      return;
    }

    if (requirementNetwork) {
      const requiredNetwork = canonicalizeNetwork(requirementNetwork);
      if (!requiredNetwork || requiredNetwork !== network) {
        sendSettleFailure(res, 400, 'network_mismatch', 'paymentRequirements.network does not match payment payload network', network);
        return;
      }
    }

    if (requirementKizuna) {
      const config = getConfig();
      if (!config.KIZUNA_ENABLED) {
        sendSettleFailure(res, 400, 'kizuna_disabled', 'Kizuna credit mode is disabled', network);
        return;
      }

      if (mode !== 'x402') {
        sendSettleFailure(res, 400, 'invalid_request', 'Kizuna requires x402 paymentRequirements', network);
        return;
      }

      if (scheme.scheme === 'session') {
        sendSettleFailure(res, 400, 'invalid_request', 'Kizuna does not support session payment headers', network);
        return;
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        sendSettleFailure(res, 400, 'invalid_payment_payload', 'Malformed payment header', network);
        return;
      }

      if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
        sendSettleFailure(res, 400, 'payment_expired', 'Payment expired', network, payment.payer);
        return;
      }

      if (!verifyPaymentAuth(payment)) {
        sendSettleFailure(res, 400, 'invalid_signature', 'Invalid signature', network, payment.payer);
        return;
      }

      if (!isValidPayerForNetwork(payment.payer, network)) {
        sendSettleFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', network, payment.payer);
        return;
      }

      if (!requirementAmountRaw) {
        sendSettleFailure(res, 400, 'invalid_amount', 'Missing paymentRequirements.amount', network, payment.payer);
        return;
      }

      const lane = requirementKizuna.lane;
      const poolId =
        requirementKizuna.poolId ||
        (lane === 'crypto-fast'
          ? config.KIZUNA_FASTPATH_POOL_ID
          : config.KIZUNA_ENTERPRISE_POOL_ID);

      if (config.KIZUNA_SECURED_ONLY && lane !== 'crypto-fast') {
        sendSettleFailure(
          res,
          403,
          'kizuna_lane_disabled',
          'Enterprise lane is disabled in secured-only mode',
          network,
          payment.payer
        );
        return;
      }

      const amount = parseSignedUsdcAmount(payment.amount, requirementAmountRaw);
      if (amount == null) {
        sendSettleFailure(
          res,
          400,
          'amount_mismatch',
          'Amount mismatch with payment requirements',
          network,
          payment.payer
        );
        return;
      }

      const amountMicro = parseUsdcMicroAmountBigint(requirementAmountRaw);
      if (amountMicro == null) {
        sendSettleFailure(res, 400, 'invalid_amount', 'Invalid paymentRequirements.amount', network, payment.payer);
        return;
      }

      if (
        requirementResource &&
        payment.resource &&
        requirementResource !== payment.resource
      ) {
        sendSettleFailure(
          res,
          400,
          'resource_mismatch',
          'Resource mismatch with payment requirements',
          network,
          payment.payer
        );
        return;
      }

      if (amount > config.MAX_SETTLEMENT_AMOUNT) {
        sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds limit', network, payment.payer);
        return;
      }

      if ((req as any).merchantWallet !== merchantWallet) {
        sendSettleFailure(res, 403, 'merchant_mismatch', 'Merchant wallet does not match API key', network, payment.payer);
        return;
      }

      const isBase = network === BASE_MAINNET_CAIP2;
      if (isBase) {
        if (!isAddress(merchantWallet)) {
          sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Base wallet address', network, payment.payer);
          return;
        }
      } else {
        try {
          new PublicKey(merchantWallet);
        } catch {
          sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Solana wallet address', network, payment.payer);
          return;
        }
      }

      const account = await getKizunaAccount(requirementKizuna.agentId);
      if (!account || account.status !== 'active') {
        sendSettleFailure(res, 404, 'kizuna_account_not_found', 'Kizuna account not found', network, payment.payer);
        return;
      }

      if (account.payer_wallet !== payment.payer) {
        sendSettleFailure(res, 400, 'payer_mismatch', 'Kizuna payer mismatch', network, payment.payer);
        return;
      }

      if (account.repay_wallet !== requirementKizuna.repayWallet) {
        sendSettleFailure(res, 400, 'repay_wallet_mismatch', 'Kizuna repay wallet mismatch', network, payment.payer);
        return;
      }

      const reservation = await getKizunaReservationByNonce(payment.payer, payment.nonce);
      if (!reservation) {
        sendSettleFailure(res, 409, 'kizuna_reservation_missing', 'No active Kizuna reservation', network, payment.payer);
        return;
      }

      if (reservation.lane !== lane || reservation.pool_id !== poolId) {
        sendSettleFailure(
          res,
          409,
          'kizuna_cross_lane_replay',
          'Reservation lane or pool does not match request',
          network,
          payment.payer
        );
        return;
      }

      if (reservation.agent_id !== requirementKizuna.agentId) {
        sendSettleFailure(res, 400, 'kizuna_agent_mismatch', 'Kizuna reservation agent mismatch', network, payment.payer);
        return;
      }

      if (reservation.network !== network) {
        sendSettleFailure(res, 400, 'network_mismatch', 'Kizuna reservation network mismatch', network, payment.payer);
        return;
      }

      if (reservation.status === 'consumed') {
        const debt = await getKizunaDebtByReservationId(reservation.id);
        if (!reservation.tx_hash || !debt) {
          sendSettleFailure(res, 409, 'kizuna_reservation_consumed', 'Kizuna reservation already consumed', network, payment.payer);
          return;
        }

        const feeFromDb = Number((await getSettlementById(debt.settlement_id))?.fee_amount || '0');
        const netFromDb = amount - feeFromDb;
        res.json({
          success: true,
          transaction: reservation.tx_hash,
          payer: payment.payer,
          txHash: reservation.tx_hash,
          amount,
          fee: feeFromDb,
          net: netFromDb,
          network,
          idempotent: true,
          extensions: {
            kizuna: {
              debtId: debt.id,
              outstandingMicro: debt.outstanding_micro,
              lane: debt.lane,
              poolId: debt.pool_id,
            },
          },
        });
        return;
      }

      if (reservation.status !== 'reserved') {
        sendSettleFailure(
          res,
          409,
          'kizuna_reservation_inactive',
          `Kizuna reservation is ${reservation.status}`,
          network,
          payment.payer
        );
        return;
      }

      if (new Date(reservation.expires_at).getTime() <= Date.now()) {
        await releaseKizunaReservation(reservation.id, 'expired').catch(() => {});
        sendSettleFailure(res, 409, 'kizuna_reservation_expired', 'Kizuna reservation expired', network, payment.payer);
        return;
      }

      try {
        if (BigInt(reservation.amount_micro) < amountMicro) {
          sendSettleFailure(
            res,
            400,
            'kizuna_amount_exceeds_reservation',
            'Requested amount exceeds reserved credit',
            network,
            payment.payer
          );
          return;
        }
      } catch {
        sendSettleFailure(res, 500, 'server_error', 'Invalid Kizuna reservation state', network, payment.payer);
        return;
      }

      let envelopeHash: string | null = null;
      if (reservation.decision.decision_envelope_hash) {
        if (!requirementKizuna.decisionEnvelope) {
          sendSettleFailure(
            res,
            400,
            'kizuna_envelope_missing',
            'Kizuna decisionEnvelope is required for settlement',
            network,
            payment.payer
          );
          return;
        }

        try {
          const envelope = verifyKizunaDecisionEnvelope(requirementKizuna.decisionEnvelope);
          envelopeHash = hashKizunaDecisionEnvelope(envelope);
          if (envelopeHash !== reservation.decision.decision_envelope_hash) {
            sendSettleFailure(
              res,
              400,
              'kizuna_envelope_mismatch',
              'Decision envelope does not match reservation',
              network,
              payment.payer
            );
            return;
          }
          if (envelope.payload.agentId !== requirementKizuna.agentId) {
            sendSettleFailure(res, 400, 'kizuna_agent_mismatch', 'Envelope agent mismatch', network, payment.payer);
            return;
          }
          if (envelope.payload.payerWallet !== payment.payer) {
            sendSettleFailure(res, 400, 'payer_mismatch', 'Envelope payer mismatch', network, payment.payer);
            return;
          }
          if (envelope.payload.requestNonce !== payment.nonce) {
            sendSettleFailure(res, 400, 'replayed_payment', 'Envelope nonce mismatch', network, payment.payer);
            return;
          }
          if (envelope.payload.network !== network) {
            sendSettleFailure(res, 400, 'network_mismatch', 'Envelope network mismatch', network, payment.payer);
            return;
          }
          if (envelope.payload.lane !== lane || envelope.payload.poolId !== poolId) {
            sendSettleFailure(res, 400, 'kizuna_cross_lane_replay', 'Envelope lane/pool mismatch', network, payment.payer);
            return;
          }
          const envelopeApproved = BigInt(envelope.payload.approvedMicro);
          if (envelopeApproved < amountMicro) {
            sendSettleFailure(
              res,
              400,
              'kizuna_amount_exceeds_reservation',
              'Amount exceeds envelope-approved credit',
              network,
              payment.payer
            );
            return;
          }
        } catch (err) {
          sendSettleFailure(
            res,
            400,
            'kizuna_envelope_invalid',
            `Invalid decision envelope: ${getErrorMessage(err)}`,
            network,
            payment.payer
          );
          return;
        }
      }

      let settlementId: string | null = null;
      let onchain: { txHash: string; fee: number; net: number; feeTxHash?: string | null } | null = null;
      let kernelCommitted = false;
      let kernelCommitError: string | null = null;

      try {
        const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
          getSettlementStats(merchantWallet),
          getWalletDisputeStats(merchantWallet),
          getWalletAverageQuality(merchantWallet),
          getMonthlyVolume(merchantWallet),
        ]);

        const repScore = calculateReputationScore(
          stats.totalSettlements,
          disputeStats.filed,
          disputeStats.won,
          avgQuality
        );
        const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
        const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

        const settlement = await insertSettlement(
          merchantWallet,
          payment.payer,
          amount,
          0,
          'USDC',
          '',
          'pending',
          network
        );
        settlementId = settlement.id;

        if (isBase) {
          onchain = await settlePaymentBase(merchantWallet, amount, effectiveFeeBps);
        } else {
          onchain = await settlePayment(
            connection,
            facilitatorKeypair,
            new PublicKey(merchantWallet),
            amount,
            effectiveFeeBps
          );
        }

        const debt = await finalizeKizunaSettlement({
          reservationId: reservation.id,
          settlementId: settlement.id,
          txHash: onchain.txHash,
          feeAmount: onchain.fee,
          feeTxHash: onchain.feeTxHash || onchain.txHash,
          lane,
          poolId,
          decisionEnvelopeHash: envelopeHash,
        });

        try {
          await commitKizunaKernelDecision({
            decisionId: reservation.decision.id,
            debtId: debt.id,
            settlementId: settlement.id,
            txHash: onchain.txHash,
            lane,
            poolId,
          });
          kernelCommitted = true;
        } catch (err) {
          kernelCommitError = getErrorMessage(err);
        }

        res.json({
          success: true,
          transaction: onchain.txHash,
          payer: payment.payer,
          txHash: onchain.txHash,
          amount,
          fee: onchain.fee,
          net: onchain.net,
          network,
          extensions: {
            kizuna: {
              debtId: debt.id,
              outstandingMicro: debt.outstanding_micro,
              principalMicro: debt.principal_micro,
              lane: debt.lane,
              poolId: debt.pool_id,
              decisionEnvelopeHash: debt.decision_envelope_hash,
              decisionId: reservation.decision.id,
              kernelCommitted,
              kernelCommitError,
            },
          },
          feeDiscount: discountPct > 0
            ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` }
            : undefined,
        });
      } catch (err) {
        if (settlementId) {
          await updateSettlementStatus(settlementId, 'failed').catch(() => {});
        }
        if (!onchain) {
          await releaseKizunaReservation(reservation.id, 'released').catch(() => {});
        }
        sendSettleFailure(
          res,
          500,
          'settlement_failed',
          `Settlement failed: ${getErrorMessage(err)}`,
          network,
          payment.payer
        );
      }
      return;
    }

    if (mode === 'legacy' && (legacyAmount == null || !Number.isFinite(legacyAmount) || legacyAmount <= 0)) {
      sendSettleFailure(res, 400, 'invalid_amount', 'Invalid amount', network);
      return;
    }

    const isBase = network === BASE_MAINNET_CAIP2;

    if (scheme.scheme === 'session') {
      const sessionHeader = parseSessionPaymentHeader(paymentHeader);
      if (!sessionHeader || canonicalizeNetwork(sessionHeader.network) !== network) {
        sendSettleFailure(res, 400, 'invalid_session_header', 'Malformed session payment header', network);
        return;
      }

      if (!sessionHeader.nonce) {
        sendSettleFailure(res, 400, 'missing_nonce', 'Session payment header must include a nonce', network);
        return;
      }

      if (mode !== 'x402') {
        sendSettleFailure(res, 400, 'invalid_request', 'Session payments require x402 paymentRequirements', network);
        return;
      }

      const session = await getPaymentSessionByTokenHash(hashSessionToken(sessionHeader.token));
      if (!session) {
        sendSettleFailure(res, 401, 'invalid_session', 'Invalid or unknown session token', network);
        return;
      }

      if (session.revoked_at) {
        sendSettleFailure(res, 401, 'session_revoked', 'Session token revoked', network, session.payer_wallet);
        return;
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        sendSettleFailure(res, 401, 'session_expired', 'Session token expired', network, session.payer_wallet);
        return;
      }

      const sessionNetwork = canonicalizeNetwork(session.network);
      if (!sessionNetwork || sessionNetwork !== network) {
        sendSettleFailure(res, 400, 'network_mismatch', 'Session network does not match payment payload network', network, session.payer_wallet);
        return;
      }

      if (session.merchant_wallet !== merchantWallet) {
        sendSettleFailure(res, 400, 'merchant_mismatch', 'Session token not valid for this merchant', network, session.payer_wallet);
        return;
      }

      if (!requirementAmountRaw) {
        sendSettleFailure(res, 400, 'invalid_amount', 'Missing paymentRequirements.amount', network, session.payer_wallet);
        return;
      }

      const amountMicro = parseUsdcMicroAmountBigint(requirementAmountRaw);
      if (amountMicro == null) {
        sendSettleFailure(res, 400, 'invalid_amount', 'Invalid paymentRequirements.amount', network, session.payer_wallet);
        return;
      }

      let maxTotalMicro: bigint;
      let spentMicro: bigint;
      try {
        maxTotalMicro = BigInt(session.max_total_micro);
        spentMicro = BigInt(session.spent_micro);
      } catch {
        sendSettleFailure(res, 500, 'server_error', 'Invalid session limits', network, session.payer_wallet);
        return;
      }

      if (spentMicro < 0n || spentMicro > maxTotalMicro) {
        sendSettleFailure(res, 500, 'server_error', 'Invalid session limits', network, session.payer_wallet);
        return;
      }

      const remainingMicro = maxTotalMicro - spentMicro;
      if (amountMicro > remainingMicro) {
        sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds remaining session cap', network, session.payer_wallet);
        return;
      }

      if (session.max_single_micro) {
        try {
          if (amountMicro > BigInt(session.max_single_micro)) {
            sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds session per-request limit', network, session.payer_wallet);
            return;
          }
        } catch {
          sendSettleFailure(res, 500, 'server_error', 'Invalid session limits', network, session.payer_wallet);
          return;
        }
      }

      const amount = Number(amountMicro) / 1_000_000;
      const config = getConfig();

      if (amount > config.MAX_SETTLEMENT_AMOUNT) {
        sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds limit', network, session.payer_wallet);
        return;
      }

      if ((req as any).merchantWallet !== merchantWallet) {
        sendSettleFailure(res, 403, 'merchant_mismatch', 'Merchant wallet does not match API key', network, session.payer_wallet);
        return;
      }

      if (isBase) {
        if (!isAddress(merchantWallet)) {
          sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Base wallet address', network, session.payer_wallet);
          return;
        }
      } else {
        try {
          new PublicKey(merchantWallet);
        } catch {
          sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Solana wallet address', network, session.payer_wallet);
          return;
        }
      }

      let nonceReserved = false;
      try {
        nonceReserved = await reservePaymentNonce(
          session.payer_wallet,
          sessionHeader.nonce,
          'settle',
          network,
          requirementResource || '',
          amount
        );
      } catch (err) {
        sendSettleFailure(res, 500, 'server_error', 'Failed to reserve payment nonce', network, session.payer_wallet);
        return;
      }

      if (!nonceReserved) {
        const existing = await getPaymentNonceGuard(session.payer_wallet, sessionHeader.nonce).catch(() => null);
        if (existing?.tx_hash) {
          const settlement = existing.settlement_id
            ? await getSettlementById(existing.settlement_id).catch(() => null)
            : null;

          const amountFromDb = settlement ? Number(settlement.amount) : amount;
          const feeFromDb = settlement ? Number(settlement.fee_amount || '0') : 0;
          const netFromDb = amountFromDb - feeFromDb;

          res.json({
            success: true,
            transaction: existing.tx_hash,
            payer: session.payer_wallet,
            txHash: existing.tx_hash,
            amount: amountFromDb,
            fee: feeFromDb,
            net: netFromDb,
            network,
            idempotent: true,
          });
          return;
        }

        sendSettleFailure(res, 409, 'replayed_payment', 'Payment nonce already used', network, session.payer_wallet);
        return;
      }

      const budgetReserved = await reservePaymentSessionSpend(session.token_hash, amountMicro.toString());
      if (!budgetReserved) {
        await deletePaymentNonceGuard(session.payer_wallet, sessionHeader.nonce).catch(() => {});
        sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds remaining session cap', network, session.payer_wallet);
        return;
      }

      let settlementId: string | null = null;
      let onchain: { txHash: string; feeMicro: bigint; netMicro: bigint; feeTxHash: string | null } | null = null;
      try {
        const settlement = await insertSettlement(
          merchantWallet,
          session.payer_wallet,
          amount,
          0,
          'USDC',
          '',
          'pending',
          network
        );
        settlementId = settlement.id;
        await setPaymentNonceSettlementId(session.payer_wallet, sessionHeader.nonce, settlement.id).catch(() => {});

        const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
          getSettlementStats(merchantWallet),
          getWalletDisputeStats(merchantWallet),
          getWalletAverageQuality(merchantWallet),
          getMonthlyVolume(merchantWallet),
        ]);

        const repScore = calculateReputationScore(
          stats.totalSettlements,
          disputeStats.filed,
          disputeStats.won,
          avgQuality
        );
        const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
        const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

        if (isBase) {
          onchain = await settleDelegatedPaymentBase({
            payerAddress: session.payer_wallet,
            merchantAddress: merchantWallet,
            totalMicro: amountMicro,
            feeBps: effectiveFeeBps,
          });
        } else {
          const onchainResult = await settleDelegatedUsdcTransfer({
            connection,
            delegateKeypair: facilitatorKeypair,
            payer: new PublicKey(session.payer_wallet),
            merchant: new PublicKey(merchantWallet),
            treasury: new PublicKey(config.TREASURY_WALLET),
            totalMicro: amountMicro,
            feeBps: effectiveFeeBps,
          });
          onchain = { ...onchainResult, feeTxHash: null };
        }

        const fee = Number(onchain.feeMicro) / 1_000_000;
        const net = Number(onchain.netMicro) / 1_000_000;

        try {
          const treasuryTx = isBase ? onchain.feeTxHash : onchain.txHash;
          await updateSettlementConfirmed(settlement.id, onchain.txHash, fee);
          await insertFeeLedger(settlement.id, null, 'settlement', fee, treasuryTx);
          await setPaymentNonceTxHash(session.payer_wallet, sessionHeader.nonce, onchain.txHash);
        } catch {
          // The on-chain transfer already happened. Keep the session budget reserved and return the tx hash.
          await setPaymentNonceTxHash(session.payer_wallet, sessionHeader.nonce, onchain.txHash).catch(() => {});
        }

        res.json({
          success: true,
          transaction: onchain.txHash,
          payer: session.payer_wallet,
          txHash: onchain.txHash,
          amount,
          fee,
          net,
          network,
          feeDiscount: discountPct > 0 ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` } : undefined,
        });
      } catch (err) {
        if (settlementId) {
          await updateSettlementStatus(settlementId, 'failed');
        }
        if (!onchain) {
          await releasePaymentSessionSpend(session.token_hash, amountMicro.toString());
          await deletePaymentNonceGuard(session.payer_wallet, sessionHeader.nonce).catch(() => {});
        }
        sendSettleFailure(
          res,
          500,
          'settlement_failed',
          `Settlement failed: ${getErrorMessage(err)}`,
          network,
          session.payer_wallet
        );
      }
      return;
    }

    const payment = decodePaymentHeader(paymentHeader);
    if (!payment) {
      sendSettleFailure(res, 400, 'invalid_payment_payload', 'Malformed payment header', network);
      return;
    }

    const config = getConfig();

    if (!isPaymentFresh(payment, config.MAX_PAYMENT_AGE_MS)) {
      sendSettleFailure(res, 400, 'payment_expired', 'Payment expired', network, payment.payer);
      return;
    }

    if (!verifyPaymentAuth(payment)) {
      sendSettleFailure(res, 400, 'invalid_signature', 'Invalid signature', network, payment.payer);
      return;
    }

    if (!isValidPayerForNetwork(payment.payer, network)) {
      sendSettleFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet for network', network, payment.payer);
      return;
    }

    const signedAmountRaw = Number(payment.amount);
    if (!Number.isFinite(signedAmountRaw) || signedAmountRaw <= 0) {
      sendSettleFailure(res, 400, 'invalid_amount', 'Invalid amount', network, payment.payer);
      return;
    }

    const expectedAmountRaw =
      mode === 'x402'
        ? requirementAmountRaw
        : String(Math.round((legacyAmount as number) * 1_000_000));
    const signedAmount = parseSignedUsdcAmount(payment.amount, expectedAmountRaw);
    if (signedAmount == null) {
      sendSettleFailure(
        res,
        400,
        'amount_mismatch',
        mode === 'x402' ? 'Amount mismatch with payment requirements' : 'Amount mismatch with signed payload',
        network,
        payment.payer
      );
      return;
    }

    if (
      requirementResource &&
      payment.resource &&
      requirementResource !== payment.resource
    ) {
      sendSettleFailure(
        res,
        400,
        'resource_mismatch',
        'Resource mismatch with payment requirements',
        network,
        payment.payer
      );
      return;
    }

    const amount = mode === 'x402' ? signedAmount : (legacyAmount as number);

    if (amount > config.MAX_SETTLEMENT_AMOUNT) {
      sendSettleFailure(res, 400, 'amount_exceeds_limit', 'Amount exceeds limit', network, payment.payer);
      return;
    }

    if (mode === 'legacy' && toBaseUnits(signedAmount) !== toBaseUnits(amount)) {
      sendSettleFailure(res, 400, 'amount_mismatch', 'Amount mismatch with signed payload', network, payment.payer);
      return;
    }

    if ((req as any).merchantWallet !== merchantWallet) {
      sendSettleFailure(res, 403, 'merchant_mismatch', 'Merchant wallet does not match API key', network, payment.payer);
      return;
    }

    if (isBase) {
      if (!isAddress(merchantWallet)) {
        sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Base wallet address', network, payment.payer);
        return;
      }
    } else {
      try {
        new PublicKey(merchantWallet);
      } catch {
        sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Solana wallet address', network, payment.payer);
        return;
      }
    }

    const nonceReserved = await reservePaymentNonce(
      payment.payer,
      payment.nonce,
      'settle',
      network,
      payment.resource || requirementResource || '',
      amount
    );
    if (!nonceReserved) {
      const existing = await getPaymentNonceGuard(payment.payer, payment.nonce).catch(() => null);
      if (existing?.tx_hash) {
        const settled = existing.settlement_id
          ? await getSettlementById(existing.settlement_id).catch(() => null)
          : null;

        const amountFromDb = settled ? Number(settled.amount) : amount;
        const feeFromDb = settled ? Number(settled.fee_amount || '0') : 0;
        const netFromDb = amountFromDb - feeFromDb;

        res.json({
          success: true,
          transaction: existing.tx_hash,
          payer: payment.payer,
          txHash: existing.tx_hash,
          amount: amountFromDb,
          fee: feeFromDb,
          net: netFromDb,
          network,
          idempotent: true,
        });
        return;
      }

      sendSettleFailure(res, 409, 'replayed_payment', 'Payment nonce already used', network, payment.payer);
      return;
    }

    const settlement = await insertSettlement(
      merchantWallet,
      payment.payer,
      amount,
      0,
      'USDC',
      '',
      'pending',
      network
    );

    await setPaymentNonceSettlementId(payment.payer, payment.nonce, settlement.id).catch(() => {});

    let onchain: { txHash: string; fee: number; net: number; feeTxHash?: string | null } | null = null;

    try {
      const [stats, disputeStats, avgQuality, monthlyVol] = await Promise.all([
        getSettlementStats(merchantWallet),
        getWalletDisputeStats(merchantWallet),
        getWalletAverageQuality(merchantWallet),
        getMonthlyVolume(merchantWallet)
      ]);

      const repScore = calculateReputationScore(
        stats.totalSettlements,
        disputeStats.filed,
        disputeStats.won,
        avgQuality
      );
      const discountPct = calculateFeeDiscountPct(repScore, monthlyVol);
      const effectiveFeeBps = applyDiscount(config.SETTLEMENT_FEE_BPS, discountPct);

      if (isBase) {
        let transferAuth: TransferWithAuthorization | null = null;
        let feeAuth: TransferWithAuthorization | null = null;

        try {
          transferAuth = parseTransferWithAuthorization((req.body as any).usdcAuthorization, 'usdcAuthorization');
          feeAuth = parseTransferWithAuthorization((req.body as any).usdcFeeAuthorization, 'usdcFeeAuthorization');
        } catch (err) {
          await updateSettlementStatus(settlement.id, 'failed');
          await deletePaymentNonceGuard(payment.payer, payment.nonce).catch(() => {});
          sendSettleFailure(
            res,
            400,
            'invalid_usdc_authorization',
            `Invalid USDC authorization: ${getErrorMessage(err)}`,
            network,
            payment.payer
          );
          return;
        }

        if (transferAuth) {
          try {
            const provider = getBaseProvider();
            const code = await provider.getCode(payment.payer);
            if (code && code !== '0x') {
              throw new Error('Payer must be an EOA for transferWithAuthorization');
            }

            const totalMicro = requirementAmountRaw
              ? parseUsdcMicroAmountBigint(requirementAmountRaw)
              : toBaseUnits(amount);

            if (totalMicro == null) {
              throw new Error('Invalid amount');
            }

            const feeMicro = (totalMicro * BigInt(effectiveFeeBps)) / 10_000n;
            const netMicro = totalMicro - feeMicro;

            if (netMicro <= 0n) {
              throw new Error('Net amount after fees is zero or negative');
            }

            const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

            if (transferAuth.validAfter > nowSeconds) {
              throw new Error('usdcAuthorization.validAfter is in the future');
            }
            if (transferAuth.validBefore <= nowSeconds) {
              throw new Error('usdcAuthorization.validBefore already expired');
            }

            if (/^0x[0-9a-fA-F]{64}$/.test(payment.nonce) && transferAuth.nonce.toLowerCase() !== payment.nonce.toLowerCase()) {
              throw new Error('usdcAuthorization.nonce does not match payment nonce');
            }

            const domain = await getBaseUsdcEip712Domain();
            if (domain.verifyingContract.toLowerCase() !== BASE_USDC.toLowerCase()) {
              throw new Error('Unexpected USDC verifyingContract');
            }

            if (!verifyTransferWithAuthorization({ domain, from: payment.payer, to: merchantWallet, value: netMicro, auth: transferAuth })) {
              throw new Error('Invalid usdcAuthorization signature');
            }

            let feeAuthorization: TransferWithAuthorization | undefined = undefined;
            if (feeMicro > 0n && config.BASE_TREASURY_ADDRESS && isAddress(config.BASE_TREASURY_ADDRESS)) {
              if (!feeAuth) {
                throw new Error('Missing usdcFeeAuthorization');
              }
              if (feeAuth.nonce.toLowerCase() === transferAuth.nonce.toLowerCase()) {
                throw new Error('usdcFeeAuthorization.nonce must be different from usdcAuthorization.nonce');
              }
              if (feeAuth.validAfter > nowSeconds) {
                throw new Error('usdcFeeAuthorization.validAfter is in the future');
              }
              if (feeAuth.validBefore <= nowSeconds) {
                throw new Error('usdcFeeAuthorization.validBefore already expired');
              }

              if (!verifyTransferWithAuthorization({ domain, from: payment.payer, to: config.BASE_TREASURY_ADDRESS, value: feeMicro, auth: feeAuth })) {
                throw new Error('Invalid usdcFeeAuthorization signature');
              }

              feeAuthorization = feeAuth;
            }

            const settled = await settleAuthorizedPaymentBase({
              payerAddress: payment.payer,
              merchantAddress: merchantWallet,
              totalMicro,
              feeBps: effectiveFeeBps,
              netAuthorization: transferAuth,
              feeAuthorization,
            });

            onchain = {
              txHash: settled.txHash,
              fee: Number(settled.feeMicro) / 1_000_000,
              net: Number(settled.netMicro) / 1_000_000,
              feeTxHash: settled.feeTxHash,
            };
          } catch (err) {
            await updateSettlementStatus(settlement.id, 'failed');
            await deletePaymentNonceGuard(payment.payer, payment.nonce).catch(() => {});
            const msg = getErrorMessage(err);
            const code = typeof err === 'object' && err && 'code' in err ? String((err as any).code) : '';
            const lower = msg.toLowerCase();
            const upstream =
              code.includes('NETWORK') ||
              code.includes('TIMEOUT') ||
              lower.includes('timed out') ||
              lower.includes('timeout') ||
              lower.includes('econn') ||
              lower.includes('socket') ||
              lower.includes('fetch');
            sendSettleFailure(
              res,
              upstream ? 502 : 400,
              upstream ? 'upstream_error' : 'invalid_usdc_authorization',
              `${upstream ? 'Upstream error' : 'Invalid USDC authorization'}: ${msg}`,
              network,
              payment.payer
            );
            return;
          }
        } else {
          onchain = await settlePaymentBase(merchantWallet, amount, effectiveFeeBps);
        }
      } else {
        onchain = await settlePayment(
          connection,
          facilitatorKeypair,
          new PublicKey(merchantWallet),
          amount,
          effectiveFeeBps
        );
      }

      if (!onchain) throw new Error('Missing settlement result');

      const treasuryTx = onchain.feeTxHash === undefined ? onchain.txHash : onchain.feeTxHash;
      try {
        await updateSettlementConfirmed(settlement.id, onchain.txHash, onchain.fee);
        await insertFeeLedger(settlement.id, null, 'settlement', onchain.fee, treasuryTx);
        await setPaymentNonceTxHash(payment.payer, payment.nonce, onchain.txHash);
      } catch {
        // On-chain transfer already happened. Preserve the tx hash for idempotent retries.
        await setPaymentNonceTxHash(payment.payer, payment.nonce, onchain.txHash).catch(() => {});
      }

      res.json({
        success: true,
        transaction: onchain.txHash,
        payer: payment.payer,
        txHash: onchain.txHash,
        amount,
        fee: onchain.fee,
        net: onchain.net,
        network,
        feeDiscount: discountPct > 0 ? { discountPct, effectiveFeeBps, reason: `reputation=${repScore}, volume=${monthlyVol}` } : undefined
      });
    } catch (err) {
      await updateSettlementStatus(settlement.id, 'failed');
      sendSettleFailure(
        res,
        500,
        'settlement_failed',
        `Settlement failed: ${getErrorMessage(err)}`,
        network,
        payment.payer
      );
    }
  });

  return router;
}
