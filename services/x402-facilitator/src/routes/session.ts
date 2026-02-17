import * as crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { isAddress, verifyTypedData } from 'ethers';
import { canonicalizeNetwork, isValidPayerForNetwork, BASE_MAINNET_CAIP2, SOLANA_MAINNET_CAIP2 } from '../protocol/networks';
import { parseUsdcMicroAmountBigint } from '../protocol/request-compat';
import {
  getSessionChallenge,
  getPaymentSessionByTokenHash,
  insertPaymentSession,
  insertSessionChallenge,
  markSessionChallengeUsed,
  revokePaymentSession,
} from '../db/queries';
import {
  buildSessionChallengeMessage,
  generateSessionToken,
  hashSessionToken,
  verifySessionChallengeSignature,
} from '../services/session';
import { getUsdcDelegateState } from '../services/solana-session';
import { verifyEvmMessageSignature } from '../services/evm-signature';
import {
  approveBaseUsdcWithAuthorization,
  BASE_USDC,
  getBaseFacilitatorAddress,
  getBaseUsdcAllowanceMicro,
  getBaseUsdcEip712Domain,
  isBaseEnabled,
} from '../services/base-settlement';

const CHALLENGE_TTL_MS = 5 * 60_000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

type SessionChallengeRequest = {
  payerWallet: string;
  network: string;
  merchantWallet: string;
  maxTotalMicro: string;
  maxSingleMicro?: string;
  sessionTtlSeconds?: number;
};

type SessionAuthorizeRequest = {
  nonce: string;
  signature: string;
  usdcAuthorization?: {
    kind: 'approveWithAuthorization';
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature: string;
  };
};

type SessionRevokeRequest = {
  token: string;
};

function clampSessionTtlMs(input?: unknown): number {
  const seconds = typeof input === 'number' && Number.isFinite(input) ? input : null;
  if (seconds == null || seconds <= 0) return DEFAULT_SESSION_TTL_MS;
  const ms = Math.floor(seconds * 1000);
  return Math.max(60_000, Math.min(MAX_SESSION_TTL_MS, ms));
}

export function createSessionRouter(connection: Connection, facilitatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/challenge', async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionChallengeRequest>;
    const payerWallet = typeof body.payerWallet === 'string' ? body.payerWallet.trim() : '';
    const merchantWallet = typeof body.merchantWallet === 'string' ? body.merchantWallet.trim() : '';
    const networkRaw = typeof body.network === 'string' ? body.network.trim() : '';

    const network = canonicalizeNetwork(networkRaw);
    if (!network || (network !== SOLANA_MAINNET_CAIP2 && network !== BASE_MAINNET_CAIP2)) {
      res.status(400).json({ error: 'Unsupported network' });
      return;
    }

    const baseSpender = network === BASE_MAINNET_CAIP2 ? getBaseFacilitatorAddress() : null;
    if (network === BASE_MAINNET_CAIP2 && (!isBaseEnabled() || !baseSpender)) {
      res.status(400).json({ error: 'Unsupported network' });
      return;
    }

    if (!payerWallet || !merchantWallet) {
      res.status(400).json({ error: 'Missing payerWallet or merchantWallet' });
      return;
    }

    if (!isValidPayerForNetwork(payerWallet, network)) {
      res.status(400).json({ error: 'Invalid payer wallet for network' });
      return;
    }

    if (network === BASE_MAINNET_CAIP2) {
      if (!isAddress(merchantWallet)) {
        res.status(400).json({ error: 'Invalid merchant wallet' });
        return;
      }
    } else {
      try {
        new PublicKey(merchantWallet);
      } catch {
        res.status(400).json({ error: 'Invalid merchant wallet' });
        return;
      }
    }

    const maxTotalMicroRaw = typeof body.maxTotalMicro === 'string' ? body.maxTotalMicro.trim() : '';
    const maxTotalMicro = parseUsdcMicroAmountBigint(maxTotalMicroRaw);
    if (maxTotalMicro == null) {
      res.status(400).json({ error: 'Invalid maxTotalMicro' });
      return;
    }

    const maxSingleMicroRaw = typeof body.maxSingleMicro === 'string' ? body.maxSingleMicro.trim() : '';
    const maxSingleMicroParsed = maxSingleMicroRaw.length ? parseUsdcMicroAmountBigint(maxSingleMicroRaw) : null;
    if (maxSingleMicroRaw.length && maxSingleMicroParsed == null) {
      res.status(400).json({ error: 'Invalid maxSingleMicro' });
      return;
    }

    if (maxSingleMicroParsed != null && maxSingleMicroParsed > maxTotalMicro) {
      res.status(400).json({ error: 'maxSingleMicro cannot exceed maxTotalMicro' });
      return;
    }

    const now = Date.now();
    const expiresAt = new Date(now + CHALLENGE_TTL_MS);
    const sessionExpiresAt = new Date(now + clampSessionTtlMs(body.sessionTtlSeconds));
    const nonce = crypto.randomBytes(16).toString('hex');

    const message = buildSessionChallengeMessage({
      payerWallet,
      network,
      merchantWallet,
      maxTotalMicro: maxTotalMicro.toString(),
      maxSingleMicro: maxSingleMicroParsed ? maxSingleMicroParsed.toString() : null,
      sessionExpiresAtIso: sessionExpiresAt.toISOString(),
      nonce,
    });

    await insertSessionChallenge({
      nonce,
      payerWallet,
      network,
      merchantWallet,
      maxTotalMicro: maxTotalMicro.toString(),
      maxSingleMicro: maxSingleMicroParsed ? maxSingleMicroParsed.toString() : null,
      sessionExpiresAt,
      message,
      expiresAt,
    });

    const usdcDomain =
      network === BASE_MAINNET_CAIP2
        ? await getBaseUsdcEip712Domain().catch(() => null)
        : null;

    res.json({
      nonce,
      message,
      expiresAt: expiresAt.getTime(),
      sessionExpiresAt: sessionExpiresAt.getTime(),
      facilitator: network === BASE_MAINNET_CAIP2 ? baseSpender : facilitatorKeypair.publicKey.toBase58(),
      ...(network === BASE_MAINNET_CAIP2 && usdcDomain
        ? {
            usdcAuthorization: {
              kind: 'approveWithAuthorization' as const,
              contract: BASE_USDC,
              domain: usdcDomain,
              types: {
                ApproveWithAuthorization: [
                  { name: 'owner', type: 'address' },
                  { name: 'spender', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'validAfter', type: 'uint256' },
                  { name: 'validBefore', type: 'uint256' },
                  { name: 'nonce', type: 'bytes32' },
                ],
              },
              primaryType: 'ApproveWithAuthorization' as const,
              message: {
                owner: payerWallet,
                spender: baseSpender,
                value: maxTotalMicro.toString(10),
                validAfter: '0',
                validBefore: String(Math.floor(sessionExpiresAt.getTime() / 1000)),
                nonce: `0x${crypto.randomBytes(32).toString('hex')}`,
              },
            },
          }
        : null),
    });
  });

  router.post('/authorize', async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionAuthorizeRequest>;
    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (!nonce || !signature) {
      res.status(400).json({ error: 'Missing nonce or signature' });
      return;
    }

    const challenge = await getSessionChallenge(nonce);
    if (!challenge) {
      res.status(400).json({ error: 'Invalid or expired challenge' });
      return;
    }

    const network = canonicalizeNetwork(challenge.network);
    if (!network || (network !== SOLANA_MAINNET_CAIP2 && network !== BASE_MAINNET_CAIP2)) {
      res.status(400).json({ error: 'Unsupported network' });
      return;
    }

    if (network === BASE_MAINNET_CAIP2 && !isBaseEnabled()) {
      res.status(400).json({ error: 'Unsupported network' });
      return;
    }

    const ok =
      network === BASE_MAINNET_CAIP2
        ? await verifyEvmMessageSignature({
            address: challenge.payer_wallet,
            message: challenge.message,
            signature,
          })
        : verifySessionChallengeSignature({
            payerWallet: challenge.payer_wallet,
            message: challenge.message,
            signature,
          });

    if (!ok) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    if (network === BASE_MAINNET_CAIP2) {

      const spender = getBaseFacilitatorAddress();
      if (!spender) {
        res.status(500).json({ error: 'Base facilitator not configured' });
        return;
      }

      const requiredMicro = BigInt(challenge.max_total_micro);
      try {
        const allowanceBefore = await getBaseUsdcAllowanceMicro(challenge.payer_wallet, spender);
        if (allowanceBefore < requiredMicro) {
          const auth = body.usdcAuthorization;

          if (auth && auth.kind === 'approveWithAuthorization') {
            let validAfter: bigint;
            let validBefore: bigint;
            try {
              validAfter = BigInt(auth.validAfter);
              validBefore = BigInt(auth.validBefore);
            } catch {
              res.status(400).json({ error: 'Invalid usdcAuthorization validity window' });
              return;
            }
            const nonce = auth.nonce as `0x${string}`;
            const signature = auth.signature as `0x${string}`;

            if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) {
              res.status(400).json({ error: 'Invalid usdcAuthorization.nonce' });
              return;
            }
            if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
              res.status(400).json({ error: 'Invalid usdcAuthorization.signature' });
              return;
            }

            const sessionExpiresAt = new Date(challenge.session_expires_at).getTime();
            const sessionExpiresAtSeconds = BigInt(Math.floor(sessionExpiresAt / 1000));
            const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

            if (validAfter > nowSeconds) {
              res.status(400).json({ error: 'usdcAuthorization.validAfter is in the future' });
              return;
            }
            if (validBefore <= nowSeconds) {
              res.status(400).json({ error: 'usdcAuthorization.validBefore already expired' });
              return;
            }
            if (validBefore > sessionExpiresAtSeconds) {
              res.status(400).json({ error: 'usdcAuthorization.validBefore exceeds session expiry' });
              return;
            }

            const domain = await getBaseUsdcEip712Domain();
            const types = {
              ApproveWithAuthorization: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' },
              ],
            };

            const recovered = verifyTypedData(
              domain,
              types,
              {
                owner: challenge.payer_wallet,
                spender,
                value: requiredMicro,
                validAfter,
                validBefore,
                nonce,
              },
              signature
            );

            if (recovered.toLowerCase() !== challenge.payer_wallet.toLowerCase()) {
              res.status(401).json({ error: 'Invalid usdcAuthorization signature' });
              return;
            }

            await approveBaseUsdcWithAuthorization({
              owner: challenge.payer_wallet,
              spender,
              value: requiredMicro,
              validAfter,
              validBefore,
              nonce,
              signature,
            });

            const allowanceAfter = await getBaseUsdcAllowanceMicro(challenge.payer_wallet, spender);
            if (allowanceAfter < requiredMicro) {
              res.status(412).json({
                error: 'USDC allowance insufficient',
                spender,
                requiredMicro: challenge.max_total_micro,
                allowanceMicro: allowanceAfter.toString(),
              });
              return;
            }
          } else {
            res.status(412).json({
              error: 'USDC allowance insufficient',
              spender,
              requiredMicro: challenge.max_total_micro,
              allowanceMicro: allowanceBefore.toString(),
              hint: 'Provide usdcAuthorization for a gasless approval or approve USDC allowance onchain.',
            });
            return;
          }
        }
      } catch (err: any) {
        res.status(502).json({ error: err?.message || 'Failed to check token allowance' });
        return;
      }
    } else {
      let payerKey: PublicKey;
      try {
        payerKey = new PublicKey(challenge.payer_wallet);
      } catch {
        res.status(400).json({ error: 'Invalid payer wallet' });
        return;
      }

      try {
        const state = await getUsdcDelegateState(connection, payerKey);
        if (!state.delegate || !state.delegate.equals(facilitatorKeypair.publicKey)) {
          res.status(412).json({
            error: 'USDC delegate not set',
            requiredDelegate: facilitatorKeypair.publicKey.toBase58(),
          });
          return;
        }

        const requiredMicro = BigInt(challenge.max_total_micro);
        if (state.delegatedMicro < requiredMicro) {
          res.status(412).json({
            error: 'USDC delegated allowance insufficient',
            requiredMicro: challenge.max_total_micro,
            delegatedMicro: state.delegatedMicro.toString(),
          });
          return;
        }
      } catch (err: any) {
        res.status(502).json({ error: err?.message || 'Failed to check token delegation' });
        return;
      }
    }

    const marked = await markSessionChallengeUsed(nonce);
    if (!marked) {
      res.status(409).json({ error: 'Challenge already used or expired' });
      return;
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);

    const session = await insertPaymentSession({
      tokenHash,
      payerWallet: challenge.payer_wallet,
      network,
      merchantWallet: challenge.merchant_wallet,
      maxTotalMicro: challenge.max_total_micro,
      maxSingleMicro: challenge.max_single_micro,
      expiresAt: challenge.session_expires_at,
    });

    res.json({
      token,
      expiresAt: new Date(session.expires_at).getTime(),
      paymentHeader: `session:${network}:${token}`,
      hint: 'Append .<nonce> to the token for idempotency, e.g. session:<network>:<token>.<nonce>',
    });
  });

  router.post('/revoke', async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionRevokeRequest>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const ok = await revokePaymentSession(hashSessionToken(token));
    res.json({ success: ok });
  });

  router.post('/introspect', async (req: Request, res: Response) => {
    const body = req.body as Partial<SessionRevokeRequest>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const tokenHash = hashSessionToken(token);
    const session = await getPaymentSessionByTokenHash(tokenHash);
    if (!session || session.revoked_at) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      payerWallet: session.payer_wallet,
      network: session.network,
      merchantWallet: session.merchant_wallet,
      maxTotalMicro: session.max_total_micro,
      maxSingleMicro: session.max_single_micro,
      spentMicro: session.spent_micro,
      expiresAt: new Date(session.expires_at).getTime(),
      revokedAt: session.revoked_at ? new Date(session.revoked_at).getTime() : null,
      lastUsedAt: session.last_used_at ? new Date(session.last_used_at).getTime() : null,
    });
  });

  return router;
}
