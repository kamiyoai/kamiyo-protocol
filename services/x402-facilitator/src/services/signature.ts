import { PublicKey } from '@solana/web3.js';
import { isAddress, verifyMessage } from 'ethers';
import * as nacl from 'tweetnacl';
import { DecodedPayment } from '../types';

const MAX_PAYMENT_HEADER_LENGTH = 8192;
const MAX_PAYER_LENGTH = 128;
const MAX_NONCE_LENGTH = 64;
const MAX_RESOURCE_LENGTH = 2048;
const MAX_AMOUNT_LENGTH = 64;
const MAX_SIGNATURE_LENGTH = 512;
const MAX_AUTH_SIGNATURE_LENGTH = 512;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function decodePaymentHeader(header: string): DecodedPayment | null {
  if (typeof header !== 'string' || header.length === 0 || header.length > MAX_PAYMENT_HEADER_LENGTH) {
    return null;
  }

  const parts = header.split(':');
  if (parts.length < 3) return null;
  const payload = parts[parts.length - 1];

  if (!payload || payload.length > MAX_PAYMENT_HEADER_LENGTH) return null;

  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    const parsed = asRecord(JSON.parse(decoded));
    if (!parsed) return null;

    const signature = asString(parsed.signature, MAX_SIGNATURE_LENGTH);
    const payer = asString(parsed.payer, MAX_PAYER_LENGTH);
    const nonce = asString(parsed.nonce, MAX_NONCE_LENGTH);
    const resource = asString(parsed.resource, MAX_RESOURCE_LENGTH);
    const amount = asString(parsed.amount, MAX_AMOUNT_LENGTH);
    const authSignature = asString(parsed.authSignature, MAX_AUTH_SIGNATURE_LENGTH);
    const timestamp = typeof parsed.timestamp === 'number' && Number.isFinite(parsed.timestamp)
      ? parsed.timestamp
      : null;

    if (!signature || !payer || timestamp == null || !nonce || !resource || !amount || !authSignature) {
      return null;
    }

    return { signature, payer, timestamp, nonce, resource, amount, authSignature };
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
      if (authSig.length !== 64 && authSig.length !== 65) return false;
      const signatureHex = `0x${authSig.toString('hex')}`;
      const recovered = verifyMessage(message, signatureHex);
      return recovered.toLowerCase() === payment.payer.toLowerCase();
    }

    if (authSig.length !== 64) return false;
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
