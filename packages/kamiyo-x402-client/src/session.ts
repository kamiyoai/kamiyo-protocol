import * as nacl from 'tweetnacl';
import { withPaymentHeaders } from './http-payment';

const MAX_TOKEN_LENGTH = 256;
const MAX_NONCE_LENGTH = 96;

export type SessionPaymentHeaderParts = {
  network: string;
  token: string;
  nonce: string | null;
};

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function generateSessionNonce(): string {
  const random = toHex(nacl.randomBytes(12));
  const ts = Date.now().toString(16);
  return `${random}${ts}`;
}

export function createSessionPaymentHeader(params: {
  network: string;
  token: string;
  nonce?: string;
}): string {
  const network = params.network.trim();
  const token = params.token.trim();
  const nonce = typeof params.nonce === 'string' ? params.nonce.trim() : '';

  if (!network) throw new Error('network required');
  if (!token) throw new Error('token required');
  if (token.length > MAX_TOKEN_LENGTH) throw new Error('token too long');
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('token must be base64url-safe');

  if (nonce) {
    if (nonce.length > MAX_NONCE_LENGTH) throw new Error('nonce too long');
    if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error('nonce must be url-safe');
  }

  return `session:${network}:${token}${nonce ? `.${nonce}` : ''}`;
}

export function parseSessionPaymentHeader(header: string): SessionPaymentHeaderParts | null {
  if (typeof header !== 'string') return null;
  const parts = header.split(':');
  if (parts.length < 3) return null;

  const scheme = parts[0];
  if (scheme !== 'session') return null;

  const network = parts.slice(1, -1).join(':').trim();
  if (!network) return null;

  const payload = parts[parts.length - 1].trim();
  if (!payload || payload.length > MAX_TOKEN_LENGTH + MAX_NONCE_LENGTH + 1) return null;

  const [token, nonce = null] = payload.split('.', 2);
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;

  if (nonce != null) {
    if (!nonce || nonce.length > MAX_NONCE_LENGTH) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(nonce)) return null;
  }

  return { network, token, nonce };
}

export function withSessionPaymentHeaders(
  sessionPaymentHeader: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return withPaymentHeaders(sessionPaymentHeader, headers);
}

export type SessionChallengeResponse = {
  nonce: string;
  message: string;
  expiresAt: number;
  sessionExpiresAt: number;
  facilitator: string;
};

export async function requestSessionChallenge(params: {
  facilitatorUrl: string;
  payerWallet: string;
  network: string;
  merchantWallet: string;
  maxTotalMicro: string;
  maxSingleMicro?: string;
  sessionTtlSeconds?: number;
}): Promise<SessionChallengeResponse> {
  const res = await fetch(`${params.facilitatorUrl.replace(/\/+$/, '')}/session/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payerWallet: params.payerWallet,
      network: params.network,
      merchantWallet: params.merchantWallet,
      maxTotalMicro: params.maxTotalMicro,
      maxSingleMicro: params.maxSingleMicro,
      sessionTtlSeconds: params.sessionTtlSeconds,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`challenge failed (${res.status})${text ? `: ${text}` : ''}`);
  }

  return (await res.json()) as SessionChallengeResponse;
}

export type SessionAuthorizeResponse = {
  token: string;
  expiresAt: number;
  paymentHeader: string;
  hint?: string;
};

export async function authorizeSession(params: {
  facilitatorUrl: string;
  nonce: string;
  signature: string;
}): Promise<SessionAuthorizeResponse> {
  const res = await fetch(`${params.facilitatorUrl.replace(/\/+$/, '')}/session/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: params.nonce, signature: params.signature }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`authorize failed (${res.status})${text ? `: ${text}` : ''}`);
  }

  return (await res.json()) as SessionAuthorizeResponse;
}

export async function revokeSession(params: { facilitatorUrl: string; token: string }): Promise<boolean> {
  const res = await fetch(`${params.facilitatorUrl.replace(/\/+$/, '')}/session/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: params.token }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`revoke failed (${res.status})${text ? `: ${text}` : ''}`);
  }

  const body = (await res.json()) as { success?: boolean };
  return !!body.success;
}
