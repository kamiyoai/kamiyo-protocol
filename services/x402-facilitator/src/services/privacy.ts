import * as crypto from 'crypto';
import { Keypair } from '@solana/web3.js';
import { getConfig } from '../config';
import { PrivacyTier, PrivacyTierConfig, ShadowProof } from '../types';

const SHADOWPAY_RELAYER_FEE_BPS = 100;

const PRIVACY_TIERS: PrivacyTierConfig[] = [
  { tier: 'none', minReputationScore: 0, maxTransferAmount: 0, relayerFeeBps: 0 },
  { tier: 'basic', minReputationScore: 350, maxTransferAmount: 10_000, relayerFeeBps: SHADOWPAY_RELAYER_FEE_BPS },
  { tier: 'full', minReputationScore: 700, maxTransferAmount: 100_000, relayerFeeBps: SHADOWPAY_RELAYER_FEE_BPS },
];

export function getPrivacyTierConfig(tier: PrivacyTier): PrivacyTierConfig {
  return PRIVACY_TIERS.find((t) => t.tier === tier) ?? PRIVACY_TIERS[0];
}

export function getEligiblePrivacyTier(reputationScore: number): PrivacyTier {
  for (let i = PRIVACY_TIERS.length - 1; i >= 0; i--) {
    if (reputationScore >= PRIVACY_TIERS[i].minReputationScore) return PRIVACY_TIERS[i].tier;
  }
  return 'none';
}

export function isPrivacyEnabled(): boolean {
  return getConfig().PRIVACY_ENABLED;
}

export function calculateRelayerFee(amount: number, feeBps: number): number {
  return Math.ceil(((amount * feeBps) / 10_000) * 1e6) / 1e6;
}

export function generateShadowProof(
  senderWallet: string,
  recipientWallet: string,
  amount: number,
  salt?: Uint8Array | Buffer
): ShadowProof {
  const proofSalt = salt ? Buffer.from(salt) : crypto.randomBytes(32);

  const commitmentData = Buffer.concat([
    Buffer.from('kamiyo-shadow-v1:commitment'),
    Buffer.from(senderWallet),
    Buffer.from(recipientWallet),
    Buffer.from(amount.toFixed(6)),
    proofSalt,
  ]);
  const commitment = crypto.createHash('sha256').update(commitmentData).digest('hex');

  const nullifierData = Buffer.concat([
    Buffer.from('kamiyo-shadow-v1:nullifier'),
    proofSalt,
    Buffer.from(commitment, 'hex'),
  ]);
  const nullifier = crypto.createHash('sha256').update(nullifierData).digest('hex');

  return { commitment, nullifier };
}

const SHADOWPAY_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 250;

let breakerFailures = 0;
let breakerOpenUntil = 0;

function breakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

function breakerRecordSuccess(): void {
  breakerFailures = 0;
}

function breakerRecordFailure(): void {
  breakerFailures += 1;
  if (breakerFailures >= 3) breakerOpenUntil = Date.now() + 30_000;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SHADOWPAY_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status >= 500 && res.status <= 599 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

export async function routePrivateTransfer(
  facilitatorKeypair: Keypair,
  recipientWallet: string,
  amount: number
): Promise<{ success: boolean; signature?: string; relayerFee: number; error?: string }> {
  const config = getConfig();
  const relayerFee = calculateRelayerFee(amount, SHADOWPAY_RELAYER_FEE_BPS);

  if (breakerOpen()) {
    return { success: false, relayerFee, error: 'ShadowPay unavailable' };
    }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'kamiyo-x402-facilitator/1',
  };

  if (config.SHADOWPAY_REFERRAL_ID) headers['X-Referral-Id'] = config.SHADOWPAY_REFERRAL_ID;
  if (config.SHADOWPAY_API_KEY) headers['Authorization'] = `Bearer ${config.SHADOWPAY_API_KEY}`;

  const url = `${config.SHADOWPAY_API_URL}/zk/external-transfer`;

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sender: facilitatorKeypair.publicKey.toBase58(),
        recipient: recipientWallet,
        amount,
        token: 'USDC',
      }),
    });

    if (!response.ok) {
      breakerRecordFailure();
      const text = await response.text().catch(() => '');
      return { success: false, relayerFee, error: `ShadowPay API error ${response.status}${text ? `: ${text}` : ''}` };
    }

    const body = (await response.json()) as { success: boolean; signature?: string; error?: string };
    if (body.success) breakerRecordSuccess(); else breakerRecordFailure();
    return { success: body.success, signature: body.signature, relayerFee, error: body.error };
  } catch (err: any) {
    breakerRecordFailure();
    return { success: false, relayerFee, error: err?.message || 'ShadowPay request failed' };
  }
}

export { PRIVACY_TIERS, SHADOWPAY_RELAYER_FEE_BPS };
