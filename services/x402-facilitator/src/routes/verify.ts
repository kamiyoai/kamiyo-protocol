import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { getUsdcBalance } from '../services/settlement';
import { getBaseFacilitatorAddress, getBaseUsdcAllowanceMicro, getBaseUsdcBalanceForAddress, getBaseUsdcBalanceMicroForAddress, isBaseEnabled } from '../services/base-settlement';
import { getConfig } from '../config';
import { VerifyResponse } from '../types';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2, isValidPayerForNetwork } from '../protocol/networks';
import { parseSignedUsdcAmount, parseUsdcMicroAmountBigint, parseVerifyInput } from '../protocol/request-compat';
import { getPaymentSessionByTokenHash } from '../db/queries';
import { hashSessionToken, parseSessionPaymentHeader } from '../services/session';
import { getUsdcDelegateState } from '../services/solana-session';

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
