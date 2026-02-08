import { PublicKey } from '@solana/web3.js';
import { isAddress, verifyMessage } from 'ethers';
import * as nacl from 'tweetnacl';
import { DecodedPayment } from '../types';

export function decodePaymentHeader(header: string): DecodedPayment | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;
  const payload = parts[parts.length - 1];
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function verifyPaymentAuth(payment: DecodedPayment): boolean {
  try {
    const authSig = Buffer.from(payment.authSignature, 'base64');
    const { authSignature: _, ...rest } = payment;
    const canonical = JSON.stringify({
      amount: rest.amount,
      nonce: rest.nonce,
      payer: rest.payer,
      resource: rest.resource,
      signature: rest.signature,
      timestamp: rest.timestamp,
    });
    const message = new TextEncoder().encode(canonical);

    if (isAddress(payment.payer)) {
      const signatureHex = `0x${authSig.toString('hex')}`;
      const recovered = verifyMessage(message, signatureHex);
      return recovered.toLowerCase() === payment.payer.toLowerCase();
    }

    const publicKey = new PublicKey(payment.payer);
    return nacl.sign.detached.verify(message, authSig, publicKey.toBytes());
  } catch {
    return false;
  }
}

export function isPaymentFresh(payment: DecodedPayment, maxAgeMs: number): boolean {
  const ts = payment.timestamp < 1_000_000_000_000 ? payment.timestamp * 1000 : payment.timestamp;
  const age = Date.now() - ts;
  return age >= 0 && age <= maxAgeMs;
}

export function parsePaymentScheme(header: string): { scheme: string; network: string } | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;
  return { scheme: parts[0], network: parts.slice(1, -1).join(':') };
}
