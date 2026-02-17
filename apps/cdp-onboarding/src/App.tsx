import { useState } from 'react';
import { AuthButton } from '@coinbase/cdp-react';
import {
  useCreateEvmEoaAccount,
  useCreateEvmSmartAccount,
  useCreateSpendPermission,
  useCurrentUser,
  useEvmAddress,
  useGetAccessToken,
  useSignEvmMessage,
  useSignEvmTypedData,
} from '@coinbase/cdp-hooks';
import type { EvmAddress, EIP712TypedData } from '@coinbase/cdp-core';

type AgentWallets = {
  evm?: { address: string; name?: string | null };
  solana?: { address: string; name?: string | null };
};

type SessionChallenge = {
  nonce: string;
  message: string;
  expiresAt: number;
  sessionExpiresAt: number;
  facilitator: string;
  usdcAuthorization?: {
    kind: 'approveWithAuthorization';
    contract: string;
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
    types: {
      ApproveWithAuthorization: Array<{ name: string; type: string }>;
    };
    primaryType: 'ApproveWithAuthorization';
    message: {
      owner: string;
      spender: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
};

type SessionAuthorizeResponse = {
  token: string;
  expiresAt: number;
  paymentHeader: string;
};

const USDC_BASE: EvmAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function envUrl(key: string, fallback: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key];
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Request failed';
}

function microFromUsdString(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    try {
      const n = BigInt(trimmed);
      return n > 0n ? n.toString(10) : null;
    } catch {
      return null;
    }
  }

  const match = /^(\d+)\.(\d{1,6})$/.exec(trimmed);
  if (!match) return null;

  try {
    const whole = BigInt(match[1]);
    const frac = match[2].padEnd(6, '0');
    const micro = whole * 1_000_000n + BigInt(frac);
    return micro > 0n ? micro.toString(10) : null;
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json && typeof json === 'object' && typeof (json as any).error === 'string'
      ? (json as any).error
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json as T;
}

function parseEvmAddress(value: string): EvmAddress | null {
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? (trimmed as EvmAddress) : null;
}

export function App() {
  const walletControlPlaneUrl = envUrl('VITE_WALLET_CONTROL_PLANE_URL', 'http://localhost:3600');
  const facilitatorUrl = envUrl('VITE_X402_FACILITATOR_URL', 'http://localhost:3500');

  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();

  const { getAccessToken } = useGetAccessToken();
  const { createEvmEoaAccount } = useCreateEvmEoaAccount();
  const { createEvmSmartAccount } = useCreateEvmSmartAccount();
  const { signEvmMessage } = useSignEvmMessage();
  const { signEvmTypedData } = useSignEvmTypedData();
  const spendPermission = useCreateSpendPermission();

  const [accessTokenPreview, setAccessTokenPreview] = useState<string | null>(null);
  const [accessTokenError, setAccessTokenError] = useState<string | null>(null);
  const [accessTokenBusy, setAccessTokenBusy] = useState(false);

  const [eoaOverride, setEoaOverride] = useState<EvmAddress | null>(null);
  const [smartOverride, setSmartOverride] = useState<EvmAddress | null>(null);
  const payerEoa = evmAddress ?? eoaOverride;
  const smartAccount = smartOverride ?? (currentUser?.evmSmartAccounts?.[0] ?? null);

  const [agentId, setAgentId] = useState('');
  const [agentWallets, setAgentWallets] = useState<AgentWallets | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionBusy, setProvisionBusy] = useState(false);

  const agentEvmAddress = agentWallets?.evm?.address ?? null;

  const [spendAllowanceUsd, setSpendAllowanceUsd] = useState('5');
  const [spendPeriodSeconds, setSpendPeriodSeconds] = useState('86400');
  const [spendError, setSpendError] = useState<string | null>(null);
  const [spendResult, setSpendResult] = useState<{ userOperationHash: string } | null>(null);

  const [sessionMerchant, setSessionMerchant] = useState('');
  const [sessionCapUsd, setSessionCapUsd] = useState('25');
  const [useGaslessApproval, setUseGaslessApproval] = useState(true);
  const [sessionResult, setSessionResult] = useState<SessionAuthorizeResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  async function handleRevealAccessToken() {
    setAccessTokenError(null);
    setAccessTokenPreview(null);

    setAccessTokenBusy(true);
    try {
      const token = await getAccessToken();
      setAccessTokenPreview(token);
    } catch (err) {
      setAccessTokenError(asErrorMessage(err));
    } finally {
      setAccessTokenBusy(false);
    }
  }

  async function handleCreateEoa() {
    try {
      const addr = await createEvmEoaAccount();
      setEoaOverride(addr);
    } catch (err) {
      setProvisionError(asErrorMessage(err));
    }
  }

  async function handleCreateSmartAccount() {
    try {
      const addr = await createEvmSmartAccount({ enableSpendPermissions: true });
      setSmartOverride(addr);
    } catch (err) {
      setSpendError(asErrorMessage(err));
    }
  }

  async function handleProvisionWallets() {
    setProvisionError(null);
    setAgentWallets(null);

    const trimmed = agentId.trim();
    if (!trimmed) {
      setProvisionError('Missing agentId');
      return;
    }

    setProvisionBusy(true);
    try {
      const resp = await postJson<{ agentId: string; wallets: AgentWallets }>(
        `${walletControlPlaneUrl}/v1/agents/${encodeURIComponent(trimmed)}/wallets/provision`,
        { evm: true, solana: true }
      );
      setAgentWallets(resp.wallets);
    } catch (err) {
      setProvisionError(asErrorMessage(err));
    } finally {
      setProvisionBusy(false);
    }
  }

  async function handleCreateSpendPermission() {
    setSpendError(null);
    setSpendResult(null);

    if (!smartAccount) {
      setSpendError('Create / load a smart account first');
      return;
    }

    if (!agentEvmAddress) {
      setSpendError('Provision agent wallets first');
      return;
    }

    const spender = parseEvmAddress(agentEvmAddress);
    if (!spender) {
      setSpendError('Invalid agent EVM address');
      return;
    }

    const allowanceMicro = microFromUsdString(spendAllowanceUsd);
    if (!allowanceMicro) {
      setSpendError('Invalid allowance (USDC)');
      return;
    }

    const periodSeconds = parseInt(spendPeriodSeconds.trim(), 10);
    if (!Number.isFinite(periodSeconds) || periodSeconds <= 0) {
      setSpendError('Invalid period');
      return;
    }

    try {
      const res = await spendPermission.createSpendPermission({
        evmSmartAccount: smartAccount as EvmAddress,
        network: 'base',
        spender,
        token: USDC_BASE,
        allowance: BigInt(allowanceMicro),
        period: periodSeconds,
        start: new Date(),
        end: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      });
      setSpendResult({ userOperationHash: res.userOperationHash });
    } catch (err) {
      setSpendError(asErrorMessage(err));
    }
  }

  async function handleCreateBaseSession() {
    setSessionError(null);
    setSessionResult(null);

    if (!payerEoa) {
      setSessionError('Create / load an EVM EOA first');
      return;
    }

    const merchant = parseEvmAddress(sessionMerchant);
    if (!merchant) {
      setSessionError('Invalid merchant address');
      return;
    }

    const capMicro = microFromUsdString(sessionCapUsd);
    if (!capMicro) {
      setSessionError('Invalid session cap (USDC)');
      return;
    }

    setSessionBusy(true);
    try {
      const challenge = await postJson<SessionChallenge>(`${facilitatorUrl}/session/challenge`, {
        payerWallet: payerEoa,
        network: 'eip155:8453',
        merchantWallet: merchant,
        maxTotalMicro: capMicro,
        sessionTtlSeconds: 7 * 24 * 60 * 60,
      });

      const msgSig = await signEvmMessage({ evmAccount: payerEoa, message: challenge.message });

      let usdcAuthorization: any = undefined;
      if (useGaslessApproval && challenge.usdcAuthorization) {
        const auth = challenge.usdcAuthorization;
        if (auth.contract.toLowerCase() !== USDC_BASE.toLowerCase()) {
          throw new Error('Unexpected USDC contract in challenge');
        }

        const typedData: EIP712TypedData = {
          domain: {
            name: auth.domain.name,
            version: auth.domain.version,
            chainId: auth.domain.chainId,
            verifyingContract: auth.domain.verifyingContract as EvmAddress,
          },
          types: auth.types,
          primaryType: auth.primaryType,
          message: {
            owner: auth.message.owner,
            spender: auth.message.spender,
            value: BigInt(auth.message.value),
            validAfter: BigInt(auth.message.validAfter),
            validBefore: BigInt(auth.message.validBefore),
            nonce: auth.message.nonce,
          },
        };

        const typedSig = await signEvmTypedData({ evmAccount: payerEoa, typedData });

        usdcAuthorization = {
          kind: 'approveWithAuthorization',
          validAfter: auth.message.validAfter,
          validBefore: auth.message.validBefore,
          nonce: auth.message.nonce,
          signature: typedSig.signature,
        };
      }

      const session = await postJson<SessionAuthorizeResponse>(`${facilitatorUrl}/session/authorize`, {
        nonce: challenge.nonce,
        signature: msgSig.signature,
        usdcAuthorization,
      });

      setSessionResult(session);
    } catch (err) {
      setSessionError(asErrorMessage(err));
    } finally {
      setSessionBusy(false);
    }
  }

  const spendBusy = spendPermission.status === 'pending';

  return (
    <div className="page">
      <div className="shell">
        <header className="top">
          <div>
            <div className="kicker">kamiyo</div>
            <h1 className="title">Embedded Wallet Onboarding</h1>
            <p className="subtitle">CDP end-user auth + spend permissions + gasless Base sessions.</p>
          </div>
          <div className="auth">
            <AuthButton />
          </div>
        </header>

        <div className="grid">
          <section className="card">
            <h2 className="cardTitle">Identity</h2>
            <div className="rows">
              <div className="row">
                <div className="label">CDP user</div>
                <div className="value">{currentUser?.userId ?? 'not signed in'}</div>
              </div>
              <div className="row">
                <div className="label">EOA</div>
                <div className="value mono">{payerEoa ?? '—'}</div>
              </div>
              <div className="row">
                <div className="label">Smart</div>
                <div className="value mono">{smartAccount ?? '—'}</div>
              </div>
            </div>

            <div className="actions">
              <button className="btn" onClick={handleCreateEoa}>
                Create / load EOA
              </button>
              <button className="btn ghost" onClick={handleCreateSmartAccount}>
                Create / load smart account
              </button>
            </div>

            <div className="divider" />

            <h3 className="cardSubtitle">Access token</h3>
            <p className="muted">Use this to validate the session in your backend if needed.</p>
            <div className="actions">
              <button className="btn" disabled={accessTokenBusy} onClick={handleRevealAccessToken}>
                {accessTokenBusy ? 'Fetching…' : 'Reveal access token'}
              </button>
            </div>

            {accessTokenError ? <p className="error">{accessTokenError}</p> : null}
            {accessTokenPreview ? (
              <div className="rows">
                <div className="row">
                  <div className="label">Token</div>
                  <div className="value mono">{accessTokenPreview.slice(0, 16)}…</div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2 className="cardTitle">Agent Wallets</h2>
            <p className="muted">
              Provisions agent-controlled CDP accounts (EVM + Solana) and persists the mapping in the wallet control plane.
            </p>

            <label className="field">
              <span className="fieldLabel">Agent ID</span>
              <input
                className="input"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="Solana agent identity (base58) or your internal ID"
              />
            </label>

            <div className="actions">
              <button className="btn" disabled={provisionBusy} onClick={handleProvisionWallets}>
                {provisionBusy ? 'Provisioning…' : 'Provision wallets'}
              </button>
            </div>

            {provisionError ? <p className="error">{provisionError}</p> : null}

            {agentWallets ? (
              <div className="rows">
                <div className="row">
                  <div className="label">EVM</div>
                  <div className="value mono">{agentWallets.evm?.address ?? '—'}</div>
                </div>
                <div className="row">
                  <div className="label">Solana</div>
                  <div className="value mono">{agentWallets.solana?.address ?? '—'}</div>
                </div>
              </div>
            ) : null}

            <div className="divider" />

            <h2 className="cardTitle">Spend Permission</h2>
            <p className="muted">Grants the provisioned agent wallet a bounded USDC allowance on your smart account (Base).</p>

            <div className="rows">
              <div className="row">
                <div className="label">Smart</div>
                <div className="value mono">{smartAccount ?? '—'}</div>
              </div>
              <div className="row">
                <div className="label">Spender</div>
                <div className="value mono">{agentEvmAddress ?? '—'}</div>
              </div>
              <div className="row">
                <div className="label">Token</div>
                <div className="value mono">{USDC_BASE}</div>
              </div>
            </div>

            <div className="fieldRow">
              <label className="field">
                <span className="fieldLabel">Allowance / period (USDC)</span>
                <input
                  className="input"
                  value={spendAllowanceUsd}
                  onChange={(e) => setSpendAllowanceUsd(e.target.value)}
                  placeholder="5.00"
                />
              </label>

              <label className="field">
                <span className="fieldLabel">Period (seconds)</span>
                <input
                  className="input"
                  value={spendPeriodSeconds}
                  onChange={(e) => setSpendPeriodSeconds(e.target.value)}
                  placeholder="86400"
                />
              </label>
            </div>

            <div className="actions">
              <button className="btn" disabled={spendBusy} onClick={handleCreateSpendPermission}>
                {spendBusy ? 'Granting…' : 'Grant spend permission'}
              </button>
            </div>

            {spendError ? <p className="error">{spendError}</p> : null}
            {spendPermission.error ? <p className="error">{spendPermission.error.message}</p> : null}

            {spendResult ? (
              <div className="rows">
                <div className="row">
                  <div className="label">UserOp</div>
                  <div className="value mono">{spendResult.userOperationHash}</div>
                </div>
              </div>
            ) : null}

            <div className="divider" />

            <h2 className="cardTitle">Base Session (Gasless)</h2>
            <p className="muted">
              Creates a session token and, if needed, submits a gasless USDC approval via <code>approveWithAuthorization</code>.
            </p>

            <label className="field">
              <span className="fieldLabel">Merchant (Base)</span>
              <input
                className="input mono"
                value={sessionMerchant}
                onChange={(e) => setSessionMerchant(e.target.value)}
                placeholder="0x…"
              />
            </label>

            <div className="fieldRow">
              <label className="field">
                <span className="fieldLabel">Session cap (USDC)</span>
                <input
                  className="input"
                  value={sessionCapUsd}
                  onChange={(e) => setSessionCapUsd(e.target.value)}
                  placeholder="25.00"
                />
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={useGaslessApproval}
                  onChange={(e) => setUseGaslessApproval(e.target.checked)}
                />
                <span>Use gasless approval</span>
              </label>
            </div>

            <div className="actions">
              <button className="btn" disabled={sessionBusy} onClick={handleCreateBaseSession}>
                {sessionBusy ? 'Authorizing…' : 'Create session'}
              </button>
            </div>

            {sessionError ? <p className="error">{sessionError}</p> : null}

            {sessionResult ? (
              <div className="rows">
                <div className="row">
                  <div className="label">Payment header</div>
                  <div className="value mono">{sessionResult.paymentHeader}</div>
                </div>
                <div className="row">
                  <div className="label">Expires</div>
                  <div className="value">{new Date(sessionResult.expiresAt).toLocaleString()}</div>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="foot">
          <div className="muted">
            Control plane: <span className="mono">{walletControlPlaneUrl}</span>
          </div>
          <div className="muted">
            Facilitator: <span className="mono">{facilitatorUrl}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
