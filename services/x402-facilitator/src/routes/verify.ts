import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { decodePaymentHeader, verifyPaymentAuth, isPaymentFresh, parsePaymentScheme } from '../services/signature';
import { getUsdcBalance } from '../services/settlement';
import { getBaseUsdcBalanceForAddress, isBaseEnabled } from '../services/base-settlement';
import { getConfig } from '../config';
import { VerifyResponse } from '../types';
import { canonicalizeNetwork, isSupportedNetwork, BASE_MAINNET_CAIP2 } from '../protocol/networks';
import { isAddress } from 'ethers';
import { matchesUsdcAmount, parseVerifyInput } from '../protocol/request-compat';

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

export function createVerifyRouter(connection: Connection): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const parsedInput = parseVerifyInput(req.body);
    if (!parsedInput.ok) {
      sendVerifyFailure(res, 400, 'invalid_request', parsedInput.error);
      return;
    }

    const { paymentHeader, resource, maxAmount, requirementAmountRaw, requirementNetwork } = parsedInput.value;

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

    const amount = parseFloat(payment.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      sendVerifyFailure(res, 400, 'invalid_amount', 'Invalid amount', payment.payer);
      return;
    }

    if (!matchesUsdcAmount(amount, requirementAmountRaw)) {
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
        if (isAddress(payment.payer)) {
          balance = await getBaseUsdcBalanceForAddress(payment.payer);
        } else {
          const payerKey = new PublicKey(payment.payer);
          balance = await getUsdcBalance(connection, payerKey);
        }
      } catch {
        sendVerifyFailure(res, 502, 'balance_lookup_failed', 'Balance lookup failed', payment.payer);
        return;
      }
    } else {
      let payerKey: PublicKey;
      try {
        payerKey = new PublicKey(payment.payer);
      } catch {
        sendVerifyFailure(res, 400, 'invalid_payer_wallet', 'Invalid payer wallet', payment.payer);
        return;
      }

      try {
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
      amount: payment.amount,
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
