import { Transaction } from '@solana/web3.js';

export type LockConfigSource = 'user_lock_config' | 'pool_default';

export type ApiError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

export type GetUserLockConfigResponse = {
  poolAddress: string;
  wallet: string;
  poolCooldownSeconds: number;
  userLockConfigAddress: string | null;
  userCooldownSeconds: number | null;
  effectiveCooldownSeconds: number;
  source: LockConfigSource;
  updatedAt: string | null;
};

export type SetUserLockConfigRequest = {
  wallet: string;
  poolAddress: string;
  cooldownSeconds: number;
};

export type SetUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  cooldownSeconds: number;
  effectiveCooldownSeconds: number;
  instruction: 'set_user_lock_config';
};

export type ClearUserLockConfigRequest = {
  wallet: string;
  poolAddress: string;
};

export type ClearUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  instruction: 'clear_user_lock_config';
};

export type UnstakeV2Request = {
  wallet: string;
  poolAddress: string;
  amountRaw: string;
};

export type UnstakeV2Response = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  unstakeAddress: string;
  userLockConfigAddress: string | null;
  amountRaw: string;
  poolCooldownSeconds: number;
  effectiveCooldownSeconds: number;
  unlockAtUnix: number;
  unlockAtIso: string;
  source: LockConfigSource;
  instruction: 'unstake_v2';
};

export type SubmitSignedTxRequest = {
  transaction: string;
};

export type SubmitSignedTxResponse = {
  signature: string;
  slot?: number;
};

export type WalletSigner = {
  publicKey: { toBase58(): string };
  signTransaction(tx: Transaction): Promise<Transaction>;
};

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T | ApiError;
  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Buffer.from(base64, 'base64');
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class FundryStakingV2Client {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBase(baseUrl);
  }

  async getUserLockConfig(params: { poolAddress: string; wallet: string }): Promise<GetUserLockConfigResponse> {
    const query = new URLSearchParams({ wallet: params.wallet }).toString();
    const response = await fetch(`${this.baseUrl}/api/staking/pools/${params.poolAddress}/user-lock-config?${query}`);
    return parseJson<GetUserLockConfigResponse>(response);
  }

  async prepareSetUserLockConfig(input: SetUserLockConfigRequest): Promise<SetUserLockConfigResponse> {
    const response = await fetch(`${this.baseUrl}/api/staking/pools/user-lock-config/set`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson<SetUserLockConfigResponse>(response);
  }

  async prepareClearUserLockConfig(input: ClearUserLockConfigRequest): Promise<ClearUserLockConfigResponse> {
    const response = await fetch(`${this.baseUrl}/api/staking/pools/user-lock-config/clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson<ClearUserLockConfigResponse>(response);
  }

  async prepareUnstakeV2(input: UnstakeV2Request): Promise<UnstakeV2Response> {
    const response = await fetch(`${this.baseUrl}/api/staking/unstake-v2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson<UnstakeV2Response>(response);
  }

  async submitSignedTx(input: SubmitSignedTxRequest): Promise<SubmitSignedTxResponse> {
    const response = await fetch(`${this.baseUrl}/api/staking/stake/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson<SubmitSignedTxResponse>(response);
  }

  async signAndSubmitTx(unsignedTxBase64: string, wallet: WalletSigner): Promise<SubmitSignedTxResponse> {
    const unsigned = Transaction.from(decodeBase64(unsignedTxBase64));
    const signed = await wallet.signTransaction(unsigned);
    const transaction = encodeBase64(signed.serialize({ requireAllSignatures: false }));
    return this.submitSignedTx({ transaction });
  }
}
