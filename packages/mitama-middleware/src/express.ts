import { Request, Response, NextFunction } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';

export interface X402Options {
  realm: string;
  programId: PublicKey;
  connection: Connection;
  price: number;
  qualityGuarantee?: boolean;
}

export interface X402Request extends Request {
  escrow?: {
    pubkey: PublicKey;
    amount: number;
    provider: PublicKey;
    consumer: PublicKey;
  };
}

/**
 * HTTP 402 Payment Required middleware for Express.js
 *
 * Implements RFC 9110 Section 15.5.3 - 402 Payment Required
 * https://httpwg.org/specs/rfc9110.html#status.402
 *
 * Usage:
 * ```typescript
 * app.use('/api/*', NaoriPaymentMiddleware({
 *   realm: 'my-api',
 *   programId: ESCROW_PROGRAM_ID,
 *   connection: new Connection('https://api.devnet.solana.com'),
 *   price: 0.001,
 *   qualityGuarantee: true
 * }));
 * ```
 */
export function NaoriPaymentMiddleware(options: X402Options) {
  return async (req: X402Request, res: Response, next: NextFunction) => {
    const paymentProof = req.headers['x-payment-proof'] as string;

    if (!paymentProof) {
      return res.status(402)
        .set({
          'WWW-Authenticate': `Solana realm="${options.realm}"`,
          'X-Escrow-Address': 'Required',
          'X-Price': `${options.price} SOL`,
          'X-Quality-Guarantee': options.qualityGuarantee ? 'true' : 'false',
          'X-Program-Id': options.programId.toString()
        })
        .json({
          error: 'Payment Required',
          message: 'This API requires payment via Solana escrow',
          amount: options.price,
          currency: 'SOL',
          escrow_program: options.programId.toString(),
          quality_guarantee: options.qualityGuarantee || false,
          payment_flow: {
            step_1: 'Create escrow with specified amount',
            step_2: 'Retry request with X-Payment-Proof header',
            step_3: 'Receive data with quality score',
            step_4: 'Automatic dispute if quality < threshold'
          }
        });
    }

    try {
      const escrowPubkey = new PublicKey(paymentProof);

      const accountInfo = await options.connection.getAccountInfo(escrowPubkey);

      if (!accountInfo) {
        return res.status(403).json({
          error: 'Invalid Payment',
          message: 'Escrow account not found',
          provided: escrowPubkey.toString()
        });
      }

      if (accountInfo.owner.toString() !== options.programId.toString()) {
        return res.status(403).json({
          error: 'Invalid Payment',
          message: 'Escrow not owned by expected program',
          expected_program: options.programId.toString(),
          actual_owner: accountInfo.owner.toString()
        });
      }

      req.escrow = {
        pubkey: escrowPubkey,
        amount: options.price,
        provider: options.programId,
        consumer: escrowPubkey
      };

      next();
    } catch (err: any) {
      return res.status(403).json({
        error: 'Payment Verification Failed',
        message: err.message || 'Invalid escrow address format'
      });
    }
  };
}

/**
 * Helper to extract escrow info from request
 */
export function getEscrowInfo(req: X402Request) {
  return req.escrow;
}
