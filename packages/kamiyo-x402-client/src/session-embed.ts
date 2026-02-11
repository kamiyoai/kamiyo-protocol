/**
 * Embeddable authorize-once session widget for x402 on Solana mainnet.
 *
 * Flow:
 * 1) Connect wallet
 * 2) Approve USDC delegate allowance to facilitator (one-time tx)
 * 3) Sign session challenge message (one-time signature)
 * 4) Receive session token and use `session:<network>:<token>.<nonce>` as payment header
 */

import { authorizeSession, requestSessionChallenge, revokeSession } from './session';

export interface SessionEmbedConfig {
  facilitatorUrl: string;
  merchantWallet: string;

  rpcUrl?: string;
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';

  defaultMaxTotalUsdc?: string;
  defaultMaxSingleUsdc?: string;
  defaultSessionDays?: number;

  showDetails?: boolean;
  buttonText?: string;

  onStateChange?: (state: SessionWidgetState) => void;
  onAuthorized?: (result: SessionAuthorizedResult) => void;
  onError?: (error: Error) => void;
}

export type SessionAuthorizedResult = {
  token: string;
  paymentHeader: string;
  expiresAt: number;
  network: string;
  payerWallet: string;
  merchantWallet: string;
};

export interface SessionWidgetState {
  status: SessionStatus;
  error: string | null;
  walletConnected: boolean;
  walletAddress: string | null;
  authorized: boolean;
  expiresAt: number | null;
}

type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'approving_delegate'
  | 'disabling_allowance'
  | 'signing'
  | 'authorizing'
  | 'revoking'
  | 'success'
  | 'error';

interface WalletAdapter {
  publicKey: { toBase58(): string } | null;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction<T>(tx: T): Promise<T>;
  signMessage?: (...args: any[]) => Promise<any>;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

const STYLES = `
.kamiyo-session-widget {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  display: inline-block;
  text-align: left;
  width: 100%;
  max-width: 420px;
}
.kamiyo-session-widget * { box-sizing: border-box; }
.kamiyo-session-card {
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
}
.kamiyo-session-widget.light .kamiyo-session-card {
  border-color: rgba(0,0,0,0.12);
  background: rgba(0,0,0,0.03);
}
.kamiyo-session-title {
  font-size: 13px;
  font-weight: 650;
  color: #fff;
  margin-bottom: 10px;
}
.kamiyo-session-widget.light .kamiyo-session-title { color: #000; }
.kamiyo-session-row { display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 10px; }
.kamiyo-session-label {
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.kamiyo-session-widget.light .kamiyo-session-label { color: rgba(0,0,0,0.65); }
.kamiyo-session-input, .kamiyo-session-select {
  width: 100%;
  padding: 10px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.22);
  color: #fff;
  font-size: 14px;
}
.kamiyo-session-widget.light .kamiyo-session-input,
.kamiyo-session-widget.light .kamiyo-session-select {
  border-color: rgba(0,0,0,0.16);
  background: rgba(255,255,255,0.7);
  color: #000;
}
.kamiyo-session-input::placeholder { color: rgba(255,255,255,0.5); }
.kamiyo-session-widget.light .kamiyo-session-input::placeholder { color: rgba(0,0,0,0.45); }
.kamiyo-session-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  background: linear-gradient(135deg, #ff44f5 0%, #00f0ff 100%);
  color: #fff;
  border: none;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.kamiyo-session-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #00f0ff 0%, #ff44f5 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.kamiyo-session-btn:hover::before { opacity: 1; }
.kamiyo-session-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(255, 68, 245, 0.22); }
.kamiyo-session-btn:active { transform: translateY(0); }
.kamiyo-session-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.kamiyo-session-btn:disabled::before { display: none; }
.kamiyo-session-btn span { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; }
.kamiyo-session-btn.sm { padding: 10px 14px; font-size: 12px; border-radius: 10px; }
.kamiyo-session-btn.md { padding: 12px 16px; font-size: 14px; border-radius: 10px; }
.kamiyo-session-btn.lg { padding: 14px 18px; font-size: 16px; border-radius: 12px; }
.kamiyo-session-btn.success { background: #14f195; color: #000; }
.kamiyo-session-btn.success::before { display: none; }
.kamiyo-session-btn.error { background: #ff4444; }
.kamiyo-session-btn.error::before { display: none; }
.kamiyo-session-meta {
  margin-top: 10px;
  padding: 10px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.18);
  font-size: 12px;
  color: rgba(255,255,255,0.75);
}
.kamiyo-session-widget.light .kamiyo-session-meta {
  border-color: rgba(0,0,0,0.12);
  background: rgba(255,255,255,0.6);
  color: rgba(0,0,0,0.7);
}
.kamiyo-session-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #fff;
  word-break: break-all;
}
.kamiyo-session-widget.light .kamiyo-session-mono { color: #000; }
.kamiyo-session-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.kamiyo-session-linkbtn {
  flex: 1 1 140px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(0,0,0,0.16);
  color: rgba(255,255,255,0.85);
  padding: 10px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}
.kamiyo-session-widget.light .kamiyo-session-linkbtn {
  border-color: rgba(0,0,0,0.16);
  background: rgba(255,255,255,0.5);
  color: rgba(0,0,0,0.8);
}
.kamiyo-session-error {
  margin-top: 10px;
  padding: 10px 10px;
  border-radius: 10px;
  font-size: 12px;
  color: #ff4444;
  background: rgba(255,68,68,0.1);
  border: 1px solid rgba(255,68,68,0.2);
}
.kamiyo-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: kamiyo-spin 0.8s linear infinite;
}
@keyframes kamiyo-spin { to { transform: rotate(360deg); } }
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'kamiyo-session-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function parseUsdcAmountToMicro(input: string): bigint | null {
  const s = input.trim();
  if (!s) return null;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!match) return null;
  try {
    const whole = BigInt(match[1]);
    const frac = (match[2] || '').padEnd(6, '0');
    const micro = whole * 1_000_000n + BigInt(frac || '0');
    return micro > 0n ? micro : null;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getWallet(): WalletAdapter | null {
  if (typeof window === 'undefined') return null;
  const win = window as any;

  const wallets = [
    win.phantom?.solana,
    win.solflare,
    win.backpack,
    win.glow,
    win.solana,
  ];

  for (const wallet of wallets) {
    if (wallet?.isPhantom || wallet?.isSolflare || wallet?.isBackpack || wallet?.isGlow || wallet?.connect) {
      return wallet as WalletAdapter;
    }
  }
  return null;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  el.style.top = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

export class KamiyoX402SessionEmbed {
  private container: HTMLElement;
  private config: Required<Omit<SessionEmbedConfig, 'onStateChange' | 'onAuthorized' | 'onError' | 'buttonText'>> &
    Pick<SessionEmbedConfig, 'onStateChange' | 'onAuthorized' | 'onError' | 'buttonText'>;
  private status: SessionStatus = 'idle';
  private error: string | null = null;
  private walletAddress: string | null = null;
  private token: string | null = null;
  private paymentHeader: string | null = null;
  private expiresAt: number | null = null;
  private facilitatorPubkey: string | null = null;
  private abortController: AbortController | null = null;
  private walletListeners: { wallet: WalletAdapter; connect: () => void; disconnect: () => void } | null = null;

  constructor(container: HTMLElement, config: SessionEmbedConfig) {
    if (!config.facilitatorUrl) throw new Error('facilitatorUrl required');
    if (!config.merchantWallet) throw new Error('merchantWallet required');

    this.container = container;
    this.config = {
      rpcUrl: MAINNET_RPC,
      theme: 'dark',
      size: 'md',
      defaultMaxTotalUsdc: '5',
      defaultMaxSingleUsdc: '',
      defaultSessionDays: 7,
      showDetails: true,
      ...config,
      facilitatorUrl: normalizeUrl(config.facilitatorUrl),
    };

    injectStyles();
    this.render();
    this.setupWalletListeners();
  }

  private setupWalletListeners(): void {
    const wallet = getWallet();
    if (!wallet) return;

    const handleConnect = () => {
      this.walletAddress = wallet.publicKey?.toBase58() || null;
      this.render();
    };

    const handleDisconnect = () => {
      this.walletAddress = null;
      this.render();
    };

    wallet.on?.('connect', handleConnect);
    wallet.on?.('disconnect', handleDisconnect);
    this.walletListeners = { wallet, connect: handleConnect, disconnect: handleDisconnect };

    if (wallet.connected && wallet.publicKey) {
      this.walletAddress = wallet.publicKey.toBase58();
    }
  }

  private cleanupWalletListeners(): void {
    if (!this.walletListeners) return;
    const { wallet, connect, disconnect } = this.walletListeners;
    wallet.off?.('connect', connect);
    wallet.off?.('disconnect', disconnect);
    this.walletListeners = null;
  }

  getState(): SessionWidgetState {
    return {
      status: this.status,
      error: this.error,
      walletConnected: !!this.walletAddress,
      walletAddress: this.walletAddress,
      authorized: !!this.token,
      expiresAt: this.expiresAt,
    };
  }

  private update(status: SessionStatus, error?: string): void {
    this.status = status;
    this.error = error || null;
    this.render();
    this.config.onStateChange?.(this.getState());
  }

  private render(): void {
    const themeClass = this.config.theme === 'light' ? 'light' : '';
    const size = this.config.size;

    const isDisabled = ['connecting', 'approving_delegate', 'disabling_allowance', 'signing', 'authorizing', 'revoking'].includes(this.status);
    const showSpinner = ['connecting', 'approving_delegate', 'disabling_allowance', 'signing', 'authorizing', 'revoking'].includes(this.status);

    const statusText: Record<SessionStatus, string> = {
      idle: this.config.buttonText || 'Authorize spending',
      connecting: 'Connecting wallet...',
      approving_delegate: 'Approve USDC allowance...',
      disabling_allowance: 'Disabling allowance...',
      signing: 'Sign authorization...',
      authorizing: 'Creating session...',
      revoking: 'Revoking session...',
      success: 'Session ready',
      error: 'Try again',
    };

    const spinner = '<div class="kamiyo-spinner" aria-hidden="true"></div>';

    const maxTotalValue = escapeHtml(this.config.defaultMaxTotalUsdc || '');
    const maxSingleValue = escapeHtml(this.config.defaultMaxSingleUsdc || '');
    const sessionDays = Number.isFinite(this.config.defaultSessionDays) ? this.config.defaultSessionDays : 7;

    const merchant = shortenAddress(this.config.merchantWallet);
    const payer = this.walletAddress ? shortenAddress(this.walletAddress) : 'Not connected';

    const btnClasses = [
      'kamiyo-session-btn',
      size,
      this.status === 'success' ? 'success' : '',
      this.status === 'error' ? 'error' : '',
    ].filter(Boolean).join(' ');

    let html = `<div class="kamiyo-session-widget ${themeClass}">`;
    html += `<div class="kamiyo-session-card">`;
    html += `<div class="kamiyo-session-title">Authorize x402 session (Solana)</div>`;

    if (!this.token) {
      html += `
        <div class="kamiyo-session-row">
          <div class="kamiyo-session-label">Spending limit (total, USDC)</div>
          <input class="kamiyo-session-input" data-kamiyo="maxTotal" placeholder="e.g. 5" value="${maxTotalValue}" ${isDisabled ? 'disabled' : ''} />
        </div>
        <div class="kamiyo-session-row">
          <div class="kamiyo-session-label">Per-request cap (optional, USDC)</div>
          <input class="kamiyo-session-input" data-kamiyo="maxSingle" placeholder="e.g. 0.25" value="${maxSingleValue}" ${isDisabled ? 'disabled' : ''} />
        </div>
        <div class="kamiyo-session-row">
          <div class="kamiyo-session-label">Session duration</div>
          <select class="kamiyo-session-select" data-kamiyo="days" ${isDisabled ? 'disabled' : ''}>
            ${[1, 7, 30].map((d) => `<option value="${d}" ${d === sessionDays ? 'selected' : ''}>${d} day${d === 1 ? '' : 's'}</option>`).join('')}
          </select>
        </div>
      `;
    }

    html += `
      <button class="${btnClasses}" ${isDisabled ? 'disabled aria-busy="true"' : ''}>
        <span>${showSpinner ? spinner : ''}${escapeHtml(statusText[this.status])}</span>
      </button>
    `;

    if (this.error) {
      html += `<div class="kamiyo-session-error" role="alert">${escapeHtml(this.error)}</div>`;
    }

    if (this.config.showDetails) {
      const exp = this.expiresAt ? new Date(this.expiresAt).toLocaleString() : '—';
      html += `
        <div class="kamiyo-session-meta">
          <div><span class="kamiyo-session-label">Merchant</span><div class="kamiyo-session-mono">${escapeHtml(merchant)}</div></div>
          <div style="margin-top:8px"><span class="kamiyo-session-label">Wallet</span><div class="kamiyo-session-mono">${escapeHtml(payer)}</div></div>
          <div style="margin-top:8px"><span class="kamiyo-session-label">Session expires</span><div class="kamiyo-session-mono">${escapeHtml(exp)}</div></div>
          ${this.paymentHeader ? `<div style="margin-top:8px"><span class="kamiyo-session-label">Payment header</span><div class="kamiyo-session-mono">${escapeHtml(this.paymentHeader)}</div></div>` : ''}
        </div>
      `;
    }

    if (this.token) {
      html += `
        <div class="kamiyo-session-actions">
          <button class="kamiyo-session-linkbtn" data-kamiyo="copy">Copy token</button>
          <button class="kamiyo-session-linkbtn" data-kamiyo="disable">Disable allowance</button>
          <button class="kamiyo-session-linkbtn" data-kamiyo="revoke">Revoke</button>
        </div>
      `;
    }

    html += `</div></div>`;
    this.container.innerHTML = html;

    const btn = this.container.querySelector<HTMLButtonElement>('button.kamiyo-session-btn');
    btn?.addEventListener('click', () => {
      if (this.status === 'error') {
        this.reset();
        return;
      }
      if (this.token) return;
      this.authorize().catch(() => {});
    });

    const copyBtn = this.container.querySelector<HTMLButtonElement>('button[data-kamiyo="copy"]');
    copyBtn?.addEventListener('click', () => {
      if (!this.token) return;
      copyToClipboard(this.token).catch(() => {});
    });

    const revokeBtn = this.container.querySelector<HTMLButtonElement>('button[data-kamiyo="revoke"]');
    revokeBtn?.addEventListener('click', () => {
      if (!this.token) return;
      this.revoke().catch(() => {});
    });

    const disableBtn = this.container.querySelector<HTMLButtonElement>('button[data-kamiyo="disable"]');
    disableBtn?.addEventListener('click', () => {
      if (!this.token) return;
      this.disableAllowance().catch(() => {});
    });
  }

  reset(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'idle';
    this.error = null;
    this.token = null;
    this.paymentHeader = null;
    this.expiresAt = null;
    this.facilitatorPubkey = null;
    this.render();
    this.config.onStateChange?.(this.getState());
  }

  async authorize(): Promise<SessionAuthorizedResult | null> {
    if (this.token) return null;
    if (this.status !== 'idle' && this.status !== 'error') return null;

    const wallet = getWallet();
    if (!wallet) {
      const err = 'No Solana wallet found. Install Phantom, Backpack, or Solflare.';
      this.update('error', err);
      this.config.onError?.(new Error(err));
      return null;
    }

    this.abortController = new AbortController();

    try {
      this.update('connecting');
      if (!wallet.connected) {
        await wallet.connect();
      }
      if (!wallet.publicKey) {
        throw new Error('Failed to connect wallet');
      }

      this.walletAddress = wallet.publicKey.toBase58();

      const maxTotalEl = this.container.querySelector<HTMLInputElement>('input[data-kamiyo="maxTotal"]');
      const maxSingleEl = this.container.querySelector<HTMLInputElement>('input[data-kamiyo="maxSingle"]');
      const daysEl = this.container.querySelector<HTMLSelectElement>('select[data-kamiyo="days"]');

      const maxTotalUsdc = maxTotalEl?.value ?? this.config.defaultMaxTotalUsdc;
      const maxSingleUsdc = maxSingleEl?.value ?? this.config.defaultMaxSingleUsdc;
      const days = daysEl ? Number(daysEl.value) : this.config.defaultSessionDays;

      const maxTotalMicro = parseUsdcAmountToMicro(maxTotalUsdc);
      if (maxTotalMicro == null) {
        throw new Error('Invalid spending limit');
      }

      const maxSingleMicro = maxSingleUsdc.trim().length ? parseUsdcAmountToMicro(maxSingleUsdc) : null;
      if (maxSingleUsdc.trim().length && maxSingleMicro == null) {
        throw new Error('Invalid per-request cap');
      }

      if (maxSingleMicro != null && maxSingleMicro > maxTotalMicro) {
        throw new Error('Per-request cap cannot exceed total cap');
      }

      const sessionTtlSeconds = Number.isFinite(days) && days > 0 ? Math.floor(days * 86400) : undefined;

      this.update('authorizing');
      const challenge = await requestSessionChallenge({
        facilitatorUrl: this.config.facilitatorUrl,
        payerWallet: this.walletAddress,
        network: SOLANA_MAINNET_CAIP2,
        merchantWallet: this.config.merchantWallet,
        maxTotalMicro: maxTotalMicro.toString(),
        maxSingleMicro: maxSingleMicro ? maxSingleMicro.toString() : undefined,
        sessionTtlSeconds,
      });

      this.update('approving_delegate');
      this.facilitatorPubkey = challenge.facilitator;
      await this.ensureDelegateAllowance(wallet, challenge.facilitator, maxTotalMicro);

      this.update('signing');
      const signature = await this.signChallenge(wallet, challenge.message);

      this.update('authorizing');
      const authorized = await authorizeSession({
        facilitatorUrl: this.config.facilitatorUrl,
        nonce: challenge.nonce,
        signature,
      });

      this.token = authorized.token;
      this.paymentHeader = authorized.paymentHeader;
      this.expiresAt = authorized.expiresAt;
      this.update('success');

      const result: SessionAuthorizedResult = {
        token: authorized.token,
        paymentHeader: authorized.paymentHeader,
        expiresAt: authorized.expiresAt,
        network: SOLANA_MAINNET_CAIP2,
        payerWallet: this.walletAddress,
        merchantWallet: this.config.merchantWallet,
      };

      this.container.dispatchEvent(new CustomEvent('kamiyo-x402-session-authorized', { detail: result }));
      this.config.onAuthorized?.(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authorization failed';
      this.update('error', msg);
      this.config.onError?.(err instanceof Error ? err : new Error(msg));
      return null;
    }
  }

  async revoke(): Promise<boolean> {
    if (!this.token) return false;
    if (this.status === 'revoking') return false;

    this.update('revoking');
    try {
      const ok = await revokeSession({ facilitatorUrl: this.config.facilitatorUrl, token: this.token });
      if (ok) {
        this.reset();
      } else {
        this.update('error', 'Failed to revoke session');
      }
      return ok;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke session';
      this.update('error', msg);
      return false;
    }
  }

  async disableAllowance(): Promise<boolean> {
    if (!this.token) return false;
    if (this.status === 'disabling_allowance') return false;

    const wallet = getWallet();
    if (!wallet) {
      const err = 'No Solana wallet found. Install Phantom, Backpack, or Solflare.';
      this.update('error', err);
      this.config.onError?.(new Error(err));
      return false;
    }

    this.update('disabling_allowance');
    try {
      if (!wallet.connected) {
        await wallet.connect();
      }
      if (!wallet.publicKey) {
        throw new Error('Failed to connect wallet');
      }

      const facilitator = await this.getFacilitatorPubkey();
      await this.setDelegateAllowance(wallet, facilitator, 0n);

      this.update('success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable allowance';
      this.update('error', msg);
      return false;
    }
  }

  private async getFacilitatorPubkey(): Promise<string> {
    if (this.facilitatorPubkey) return this.facilitatorPubkey;

    const res = await fetch(`${this.config.facilitatorUrl}/health`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Failed to fetch facilitator identity (${res.status})`);
    }

    const body = (await res.json().catch(() => ({}))) as { facilitator?: unknown };
    const facilitator = typeof body.facilitator === 'string' ? body.facilitator.trim() : '';
    if (!facilitator) {
      throw new Error('Invalid facilitator identity response');
    }

    this.facilitatorPubkey = facilitator;
    return facilitator;
  }

  private async ensureDelegateAllowance(wallet: WalletAdapter, facilitatorPubkey: string, capMicro: bigint): Promise<void> {
    const ok = await this.setDelegateAllowance(wallet, facilitatorPubkey, capMicro);
    if (!ok) {
      throw new Error('USDC allowance approval failed');
    }
  }

  private async setDelegateAllowance(wallet: WalletAdapter, facilitatorPubkey: string, amountMicro: bigint): Promise<boolean> {
    const { Connection, PublicKey, Transaction } = await import('@solana/web3.js');
    const {
      createApproveInstruction,
      createAssociatedTokenAccountInstruction,
      getAccount,
      getAssociatedTokenAddress,
    } = await import('@solana/spl-token');

    const rpcUrl = this.config.rpcUrl || MAINNET_RPC;
    const connection = new Connection(rpcUrl, 'confirmed');

    const owner = new PublicKey(wallet.publicKey!.toBase58());
    const mint = new PublicKey(USDC_MINT_MAINNET);
    const delegate = new PublicKey(facilitatorPubkey);

    const ata = await getAssociatedTokenAddress(mint, owner);

    const info = await connection.getAccountInfo(ata, 'confirmed');
    let account: any | null = null;
    if (info) {
      try {
        account = await getAccount(connection, ata);
      } catch {
        throw new Error('Failed to read USDC token account');
      }
    }

    if (amountMicro > 0n && account) {
      const alreadyDelegated =
        account.delegate?.equals?.(delegate) &&
        typeof account.delegatedAmount === 'bigint' &&
        account.delegatedAmount >= amountMicro;
      if (alreadyDelegated) return true;
    }

    const tx = new Transaction();
    if (!account) {
      tx.add(createAssociatedTokenAccountInstruction(owner, ata, owner, mint));
    }
    tx.add(createApproveInstruction(ata, delegate, owner, amountMicro));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.feePayer = owner;
    tx.recentBlockhash = blockhash;

    const signedTx = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction((signedTx as any).serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const confirmation = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return !confirmation.value.err;
  }

  private async signChallenge(wallet: WalletAdapter, message: string): Promise<string> {
    if (!wallet.signMessage) {
      throw new Error('Wallet does not support message signing');
    }

    const bytes = new TextEncoder().encode(message);

    let signed: any;
    try {
      signed = await wallet.signMessage(bytes, 'utf8');
    } catch {
      signed = await wallet.signMessage(bytes);
    }

    const sigBytes =
      signed instanceof Uint8Array
        ? signed
        : signed?.signature instanceof Uint8Array
          ? signed.signature
          : null;

    if (!sigBytes || sigBytes.length !== 64) {
      throw new Error('Invalid signature');
    }

    return encodeBase64(sigBytes);
  }

  destroy(): void {
    this.abortController?.abort();
    this.cleanupWalletListeners();
    this.container.innerHTML = '';
  }
}

export function createKamiyoX402SessionWidget(
  container: HTMLElement | string,
  config: SessionEmbedConfig
): KamiyoX402SessionEmbed {
  const el = typeof container === 'string'
    ? document.querySelector<HTMLElement>(container)
    : container;

  if (!el) {
    throw new Error(`Container not found: ${container}`);
  }

  return new KamiyoX402SessionEmbed(el, config);
}

if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  class KamiyoX402SessionElement extends HTMLElement {
    private widget?: KamiyoX402SessionEmbed;

    static get observedAttributes() {
      return [
        'facilitator-url',
        'merchant-wallet',
        'rpc-url',
        'theme',
        'size',
        'default-max-total-usdc',
        'default-max-single-usdc',
        'default-session-days',
        'show-details',
        'button-text',
      ];
    }

    connectedCallback() {
      this.initWidget();
    }

    disconnectedCallback() {
      this.widget?.destroy();
    }

    attributeChangedCallback() {
      if (!this.widget) return;
      this.widget.destroy();
      this.initWidget();
    }

    private initWidget() {
      const facilitatorUrl = this.getAttribute('facilitator-url') || '';
      const merchantWallet = this.getAttribute('merchant-wallet') || '';
      if (!facilitatorUrl || !merchantWallet) {
        this.innerHTML = '<p style="color:#ff4444;font-size:12px">Missing facilitator-url or merchant-wallet</p>';
        return;
      }

      const daysRaw = this.getAttribute('default-session-days') || '';
      const days = daysRaw ? Number(daysRaw) : undefined;

      this.widget = new KamiyoX402SessionEmbed(this, {
        facilitatorUrl,
        merchantWallet,
        rpcUrl: this.getAttribute('rpc-url') || undefined,
        theme: (this.getAttribute('theme') || 'dark') as 'dark' | 'light',
        size: (this.getAttribute('size') || 'md') as 'sm' | 'md' | 'lg',
        defaultMaxTotalUsdc: this.getAttribute('default-max-total-usdc') || undefined,
        defaultMaxSingleUsdc: this.getAttribute('default-max-single-usdc') || undefined,
        defaultSessionDays: Number.isFinite(days as number) ? (days as number) : undefined,
        showDetails: this.getAttribute('show-details') !== 'false',
        buttonText: this.getAttribute('button-text') || undefined,
      });
    }

    authorize() {
      return this.widget?.authorize();
    }

    revoke() {
      return this.widget?.revoke();
    }

    reset() {
      this.widget?.reset();
    }

    getState() {
      return this.widget?.getState();
    }
  }

  if (!customElements.get('kamiyo-x402-session')) {
    customElements.define('kamiyo-x402-session', KamiyoX402SessionElement);
  }
}

if (typeof window !== 'undefined') {
  (window as any).KamiyoX402Session = {
    create: createKamiyoX402SessionWidget,
    Embed: KamiyoX402SessionEmbed,
    version: '1.0.0',
  };
}
