import * as crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { isAddress, verifyMessage } from 'ethers';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const MAX_SESSION_TOKEN_LENGTH = 256;
const MAX_SESSION_NONCE_LENGTH = 96;
const MAX_MESSAGE_LENGTH = 4096;
const SESSION_TOKEN_BYTES = 32;

export type SessionPaymentHeader = {
  network: string;
  token: string;
  nonce: string | null;
};

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

function isBase58(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

function decodeEd25519Signature(sig: string): Uint8Array | null {
  const trimmed = sig.trim();
  if (!trimmed) return null;

  if (isBase58(trimmed)) {
    try {
      return bs58.decode(trimmed);
    } catch {
      return null;
    }
  }

  try {
    const bytes = Buffer.from(trimmed, 'base64');
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

export function verifySessionChallengeSignature(params: {
  payerWallet: string;
  message: string;
  signature: string;
}): boolean {
  const message = params.message;
  if (!message || message.length > MAX_MESSAGE_LENGTH) return false;
  const bytes = new TextEncoder().encode(message);

  if (isAddress(params.payerWallet)) {
    const sig = params.signature.trim();
    if (!sig.startsWith('0x') || sig.length > 2048) return false;
    try {
      const recovered = verifyMessage(bytes, sig);
      return recovered.toLowerCase() === params.payerWallet.toLowerCase();
    } catch {
      return false;
    }
  }

  try {
    const pk = new PublicKey(params.payerWallet);
    const sigBytes = decodeEd25519Signature(params.signature);
    if (!sigBytes || sigBytes.length !== 64) return false;
    return nacl.sign.detached.verify(bytes, sigBytes, pk.toBytes());
  } catch {
    return false;
  }
}

export function buildSessionChallengeMessage(input: {
  payerWallet: string;
  network: string;
  merchantWallet: string;
  maxTotalMicro: string;
  maxSingleMicro: string | null;
  sessionExpiresAtIso: string;
  nonce: string;
}): string {
  const lines = [
    'KAMIYO x402 session authorization',
    '',
    `payer: ${input.payerWallet}`,
    `network: ${input.network}`,
    `merchant: ${input.merchantWallet}`,
    `max_total_micro_usdc: ${input.maxTotalMicro}`,
  ];

  if (input.maxSingleMicro) {
    lines.push(`max_single_micro_usdc: ${input.maxSingleMicro}`);
  }

  lines.push(
    `session_expires_at: ${input.sessionExpiresAtIso}`,
    `nonce: ${input.nonce}`,
    '',
    'By signing, you authorize session-based x402 payments under this cap until expiry.',
  );

  return lines.join('\n');
}

export function parseSessionPaymentHeader(header: string): SessionPaymentHeader | null {
  if (typeof header !== 'string' || header.length === 0) return null;
  const parts = header.split(':');
  if (parts.length < 3) return null;

  const scheme = parts[0];
  if (scheme !== 'session') return null;

  const network = parts.slice(1, -1).join(':').trim();
  if (!network) return null;

  const payload = parts[parts.length - 1].trim();
  if (!payload || payload.length > MAX_SESSION_TOKEN_LENGTH + MAX_SESSION_NONCE_LENGTH + 1) {
    return null;
  }

  const [token, nonce = null] = payload.split('.', 2);
  if (!token || token.length > MAX_SESSION_TOKEN_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;

  if (nonce != null) {
    if (!nonce || nonce.length > MAX_SESSION_NONCE_LENGTH) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(nonce)) return null;
  }

  return { network, token, nonce };
}

