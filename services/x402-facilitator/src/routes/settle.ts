import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { settlePayment, toBaseUnits } from '../services/settlement';
import { isAddress } from 'ethers';
import { settlePaymentBase, isBaseEnabled } from '../services/base-settlement';
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
} from '../db/queries';
import { calculateReputationScore } from '../services/reputation';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2, isValidPayerForNetwork } from '../protocol/networks';
import { parseSignedUsdcAmount, parseSettleInput, parseUsdcMicroAmountBigint } from '../protocol/request-compat';
import { hashSessionToken, parseSessionPaymentHeader } from '../services/session';
import { settleDelegatedUsdcTransfer } from '../services/solana-session';

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
        sendSettleFailure(res, 400, 'unsupported_network', 'Session payments not supported for Base', network, session.payer_wallet);
        return;
      }

      try {
        new PublicKey(merchantWallet);
      } catch {
        sendSettleFailure(res, 400, 'invalid_wallet', 'Invalid Solana wallet address', network, session.payer_wallet);
        return;
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
      let onchain: { txHash: string; feeMicro: bigint; netMicro: bigint } | null = null;
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

        const onchainResult = await settleDelegatedUsdcTransfer({
          connection,
          delegateKeypair: facilitatorKeypair,
          payer: new PublicKey(session.payer_wallet),
          merchant: new PublicKey(merchantWallet),
          treasury: new PublicKey(config.TREASURY_WALLET),
          totalMicro: amountMicro,
          feeBps: effectiveFeeBps,
        });
        onchain = onchainResult;

        const fee = Number(onchainResult.feeMicro) / 1_000_000;
        const net = Number(onchainResult.netMicro) / 1_000_000;

        try {
          await updateSettlementConfirmed(settlement.id, onchainResult.txHash, fee);
          await insertFeeLedger(settlement.id, null, 'settlement', fee, onchainResult.txHash);
          await setPaymentNonceTxHash(session.payer_wallet, sessionHeader.nonce, onchainResult.txHash);
        } catch {
          // The on-chain transfer already happened. Keep the session budget reserved and return the tx hash.
          await setPaymentNonceTxHash(session.payer_wallet, sessionHeader.nonce, onchainResult.txHash).catch(() => {});
        }

        res.json({
          success: true,
          transaction: onchainResult.txHash,
          payer: session.payer_wallet,
          txHash: onchainResult.txHash,
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

      let onchain: { txHash: string; fee: number; net: number };

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

      await updateSettlementConfirmed(settlement.id, onchain.txHash, onchain.fee);
      await insertFeeLedger(settlement.id, null, 'settlement', onchain.fee, onchain.txHash);

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
