/**
 * KAMIYO Pay - Embeddable Payment Widget
 *
 * Usage:
 *
 * 1. Custom Element:
 *    <kamiyo-pay provider="..." amount="1" mode="escrow"></kamiyo-pay>
 *
 * 2. JavaScript:
 *    KamiyoPay.create('#container', { provider: '...', amount: 1 })
 *
 * 3. Programmatic:
 *    const widget = new KamiyoPayEmbed(element, config);
 *    await widget.pay();
 */

export interface EmbedConfig {
  provider: string;
  amount: number;
  mode?: 'escrow' | 'direct';
  timelock?: '1h' | '24h' | '7d' | '30d';
  description?: string;
  apiBase?: string;
  rpcUrl?: string;
  network?: 'mainnet' | 'devnet';
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  buttonText?: string;
  showDetails?: boolean;
  confirmationTimeout?: number;
  onStateChange?: (state: WidgetState) => void;
  onSuccess?: (result: EmbedPaymentResult) => void;
  onError?: (error: Error) => void;
}

export interface EmbedPaymentResult {
  signature: string;
  transactionId: string;
  amount: number;
  provider: string;
  escrowId?: string;
  mode: 'escrow' | 'direct';
  network: 'mainnet' | 'devnet';
  explorerUrl: string;
}

export interface WidgetState {
  status: EmbedStatus;
  error: string | null;
  signature: string | null;
  escrowId: string | null;
  walletConnected: boolean;
  walletAddress: string | null;
}

type EmbedStatus = 'idle' | 'connecting' | 'confirming' | 'processing' | 'success' | 'error';

interface WalletAdapter {
  publicKey: { toBase58(): string } | null;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction<T>(tx: T): Promise<T>;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

const RPC_ENDPOINTS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

const EXPLORER_URLS = {
  mainnet: 'https://solscan.io/tx/',
  devnet: 'https://solscan.io/tx/',
};

const STYLES = `
.kamiyo-pay-widget {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  display: inline-block;
  text-align: left;
}
.kamiyo-pay-widget * {
  box-sizing: border-box;
}
.kamiyo-pay-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #ff44f5 0%, #00f0ff 100%);
  color: #fff;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.kamiyo-pay-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #00f0ff 0%, #ff44f5 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.kamiyo-pay-btn:hover::before {
  opacity: 1;
}
.kamiyo-pay-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 68, 245, 0.3);
}
.kamiyo-pay-btn:active {
  transform: translateY(0);
}
.kamiyo-pay-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.kamiyo-pay-btn:disabled::before {
  display: none;
}
.kamiyo-pay-btn span {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.kamiyo-pay-btn.sm { padding: 8px 16px; font-size: 12px; border-radius: 6px; }
.kamiyo-pay-btn.md { padding: 12px 24px; font-size: 14px; border-radius: 8px; }
.kamiyo-pay-btn.lg { padding: 16px 32px; font-size: 16px; border-radius: 10px; }
.kamiyo-pay-btn.success {
  background: #14f195;
  color: #000;
}
.kamiyo-pay-btn.success::before { display: none; }
.kamiyo-pay-btn.error {
  background: #ff4444;
}
.kamiyo-pay-btn.error::before { display: none; }
.kamiyo-pay-details {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1);
}
.kamiyo-pay-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #888;
}
.kamiyo-pay-row + .kamiyo-pay-row {
  margin-top: 4px;
}
.kamiyo-pay-row-value {
  color: #fff;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.kamiyo-pay-info {
  margin-top: 6px;
  font-size: 11px;
  color: #888;
}
.kamiyo-pay-error {
  margin-top: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #ff4444;
  background: rgba(255,68,68,0.1);
  border-radius: 6px;
  border: 1px solid rgba(255,68,68,0.2);
}
.kamiyo-pay-success-box {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(20,241,149,0.1);
  border-radius: 6px;
  border: 1px solid rgba(20,241,149,0.2);
}
.kamiyo-pay-success-box a {
  color: #14f195;
  text-decoration: none;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.kamiyo-pay-success-box a:hover {
  text-decoration: underline;
}
.kamiyo-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: kamiyo-spin 0.8s linear infinite;
}
@keyframes kamiyo-spin {
  to { transform: rotate(360deg); }
}
.kamiyo-pay-widget.light .kamiyo-pay-details {
  background: rgba(0,0,0,0.03);
  border-color: rgba(0,0,0,0.1);
}
.kamiyo-pay-widget.light .kamiyo-pay-row { color: #666; }
.kamiyo-pay-widget.light .kamiyo-pay-row-value { color: #000; }
.kamiyo-pay-widget.light .kamiyo-pay-info { color: #666; }
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'kamiyo-pay-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function validateConfig(config: EmbedConfig): void {
  if (!config.provider || typeof config.provider !== 'string') {
    throw new Error('Invalid provider address');
  }
  if (config.provider.length < 32 || config.provider.length > 44) {
    throw new Error('Provider address must be a valid Solana address');
  }
  if (typeof config.amount !== 'number' || config.amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  if (config.amount > 1000) {
    throw new Error('Amount exceeds maximum (1000 SOL)');
  }
}

function getWallet(): WalletAdapter | null {
  if (typeof window === 'undefined') return null;

  const win = window as any;

  // Check multiple wallet providers
  const wallets = [
    win.phantom?.solana,
    win.solflare,
    win.backpack,
    win.glow,
    win.solana,
  ];

  for (const wallet of wallets) {
    if (wallet?.isPhantom || wallet?.isSolflare || wallet?.isBackpack || wallet?.isGlow || wallet?.publicKey) {
      return wallet;
    }
  }

  return null;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export class KamiyoPayEmbed {
  private container: HTMLElement;
  private config: Required<Omit<EmbedConfig, 'onStateChange' | 'onSuccess' | 'onError' | 'buttonText' | 'description'>> &
    Pick<EmbedConfig, 'onStateChange' | 'onSuccess' | 'onError' | 'buttonText' | 'description'>;
  private status: EmbedStatus = 'idle';
  private error: string | null = null;
  private signature: string | null = null;
  private escrowId: string | null = null;
  private walletAddress: string | null = null;
  private abortController: AbortController | null = null;

  constructor(container: HTMLElement, config: EmbedConfig) {
    validateConfig(config);

    this.container = container;
    this.config = {
      mode: 'escrow',
      timelock: '24h',
      apiBase: '',
      rpcUrl: '',
      network: 'mainnet',
      theme: 'dark',
      size: 'md',
      showDetails: true,
      confirmationTimeout: 60000,
      ...config,
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
      if (this.status === 'confirming' || this.status === 'processing') {
        this.update('error', 'Wallet disconnected');
      }
      this.render();
    };

    wallet.on?.('connect', handleConnect);
    wallet.on?.('disconnect', handleDisconnect);

    if (wallet.connected && wallet.publicKey) {
      this.walletAddress = wallet.publicKey.toBase58();
    }
  }

  getState(): WidgetState {
    return {
      status: this.status,
      error: this.error,
      signature: this.signature,
      escrowId: this.escrowId,
      walletConnected: !!this.walletAddress,
      walletAddress: this.walletAddress,
    };
  }

  private render(): void {
    const { amount, provider, mode, timelock, theme, size, showDetails, buttonText, description } = this.config;
    const themeClass = theme === 'light' ? 'light' : '';

    const btnClasses = [
      'kamiyo-pay-btn',
      size,
      this.status === 'success' ? 'success' : '',
      this.status === 'error' ? 'error' : '',
    ].filter(Boolean).join(' ');

    const isDisabled = ['connecting', 'confirming', 'processing'].includes(this.status);
    const showSpinner = this.status === 'connecting' || this.status === 'processing';

    const statusText: Record<EmbedStatus, string> = {
      idle: buttonText || `Pay ${formatAmount(amount)} SOL`,
      connecting: 'Connecting wallet...',
      confirming: 'Confirm in wallet',
      processing: 'Processing...',
      success: 'Payment complete',
      error: 'Try again',
    };

    const spinner = '<div class="kamiyo-spinner" aria-hidden="true"></div>';

    let html = `<div class="kamiyo-pay-widget ${themeClass}">`;

    html += `
      <button
        class="${btnClasses}"
        ${isDisabled ? 'disabled aria-busy="true"' : ''}
        aria-label="${this.status === 'idle' ? `Pay ${amount} SOL to ${shortenAddress(provider)}` : statusText[this.status]}"
      >
        <span>${showSpinner ? spinner : ''}${escapeHtml(statusText[this.status])}</span>
      </button>
    `;

    if (this.status === 'idle' && showDetails) {
      html += `
        <div class="kamiyo-pay-details">
          <div class="kamiyo-pay-row">
            <span>Amount</span>
            <span class="kamiyo-pay-row-value">${formatAmount(amount)} SOL</span>
          </div>
          <div class="kamiyo-pay-row">
            <span>To</span>
            <span class="kamiyo-pay-row-value">${shortenAddress(provider)}</span>
          </div>
          ${mode === 'escrow' ? `
          <div class="kamiyo-pay-row">
            <span>Protection</span>
            <span class="kamiyo-pay-row-value">Escrow (${timelock})</span>
          </div>
          ` : ''}
        </div>
      `;
    }

    if (description && this.status === 'idle') {
      html += `<div class="kamiyo-pay-info">${escapeHtml(description)}</div>`;
    }

    if (this.error) {
      html += `<div class="kamiyo-pay-error" role="alert">${escapeHtml(this.error)}</div>`;
    }

    if (this.status === 'success' && this.signature) {
      const explorerUrl = this.getExplorerUrl();
      html += `
        <div class="kamiyo-pay-success-box">
          <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">
            View on Solscan
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      `;
    }

    html += '</div>';

    this.container.innerHTML = html;

    const btn = this.container.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this.status === 'error') {
          this.reset();
        } else if (this.status === 'idle') {
          this.pay();
        }
      });
    }
  }

  private getExplorerUrl(): string {
    const base = EXPLORER_URLS[this.config.network];
    const cluster = this.config.network === 'devnet' ? '?cluster=devnet' : '';
    return `${base}${this.signature}${cluster}`;
  }

  private update(status: EmbedStatus, error?: string): void {
    this.status = status;
    this.error = error || null;
    this.render();
    this.config.onStateChange?.(this.getState());
  }

  reset(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.status = 'idle';
    this.error = null;
    this.signature = null;
    this.escrowId = null;
    this.render();
    this.config.onStateChange?.(this.getState());
  }

  async pay(): Promise<EmbedPaymentResult | null> {
    if (this.status !== 'idle' && this.status !== 'error') {
      return null;
    }

    const wallet = getWallet();

    if (!wallet) {
      const error = 'No Solana wallet found. Please install Phantom or another Solana wallet.';
      this.update('error', error);
      this.config.onError?.(new Error(error));
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
      this.update('confirming');

      const { provider, amount, mode, timelock, apiBase } = this.config;
      const apiUrl = mode === 'escrow'
        ? `${apiBase}/api/actions/create-escrow?provider=${encodeURIComponent(provider)}&amount=${amount}&timelock=${timelock}`
        : `${apiBase}/api/actions/pay?provider=${encodeURIComponent(provider)}&amount=${amount}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: wallet.publicKey.toBase58() }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        let errorMsg = 'Payment request failed';
        try {
          const err = await response.json();
          errorMsg = err.error || err.message || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const { transaction, message } = await response.json();

      if (!transaction) {
        throw new Error('Invalid response from server');
      }

      this.update('processing');

      const txBuffer = Uint8Array.from(atob(transaction), c => c.charCodeAt(0));
      const { Transaction: SolanaTx, Connection } = await import('@solana/web3.js');
      const tx = SolanaTx.from(txBuffer);

      const signedTx = await wallet.signTransaction(tx);

      const rpcUrl = this.config.rpcUrl || RPC_ENDPOINTS[this.config.network];
      const connection = new Connection(rpcUrl, 'confirmed');

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      const confirmPromise = connection.confirmTransaction(signature, 'confirmed');
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), this.config.confirmationTimeout);
      });

      await Promise.race([confirmPromise, timeoutPromise]);

      this.signature = signature;
      const escrowIdMatch = message?.match(/ID: ([\w_]+)/);
      this.escrowId = escrowIdMatch?.[1] || null;

      this.update('success');

      const result: EmbedPaymentResult = {
        signature,
        transactionId: this.escrowId || signature,
        amount,
        provider,
        escrowId: mode === 'escrow' ? this.escrowId || undefined : undefined,
        mode: mode,
        network: this.config.network,
        explorerUrl: this.getExplorerUrl(),
      };

      this.config.onSuccess?.(result);
      return result;

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return null;
      }

      let errorMessage = 'Payment failed';

      if (err instanceof Error) {
        if (err.message.includes('User rejected')) {
          errorMessage = 'Transaction cancelled';
        } else if (err.message.includes('insufficient')) {
          errorMessage = 'Insufficient balance';
        } else if (err.message.includes('timeout')) {
          errorMessage = 'Transaction timeout - check wallet for status';
        } else {
          errorMessage = err.message;
        }
      }

      this.update('error', errorMessage);
      this.config.onError?.(err instanceof Error ? err : new Error(errorMessage));
      return null;
    }
  }

  destroy(): void {
    this.abortController?.abort();
    this.container.innerHTML = '';
  }
}

export function createKamiyoPayWidget(
  container: HTMLElement | string,
  config: EmbedConfig
): KamiyoPayEmbed {
  const el = typeof container === 'string'
    ? document.querySelector<HTMLElement>(container)
    : container;

  if (!el) {
    throw new Error(`Container not found: ${container}`);
  }

  return new KamiyoPayEmbed(el, config);
}

// Custom Element
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  class KamiyoPayElement extends HTMLElement {
    private widget?: KamiyoPayEmbed;

    static get observedAttributes() {
      return ['provider', 'amount', 'mode', 'timelock', 'description', 'theme', 'size', 'network'];
    }

    connectedCallback() {
      this.initWidget();
    }

    disconnectedCallback() {
      this.widget?.destroy();
    }

    attributeChangedCallback() {
      if (this.widget) {
        this.widget.destroy();
        this.initWidget();
      }
    }

    private initWidget() {
      const provider = this.getAttribute('provider');
      const amount = parseFloat(this.getAttribute('amount') || '0');

      if (!provider || !amount) {
        this.innerHTML = '<p style="color:#ff4444;font-size:12px">Missing provider or amount attribute</p>';
        return;
      }

      this.widget = new KamiyoPayEmbed(this, {
        provider,
        amount,
        mode: (this.getAttribute('mode') || 'escrow') as 'escrow' | 'direct',
        timelock: (this.getAttribute('timelock') || '24h') as '1h' | '24h' | '7d' | '30d',
        description: this.getAttribute('description') || undefined,
        theme: (this.getAttribute('theme') || 'dark') as 'dark' | 'light',
        size: (this.getAttribute('size') || 'md') as 'sm' | 'md' | 'lg',
        network: (this.getAttribute('network') || 'mainnet') as 'mainnet' | 'devnet',
        apiBase: this.getAttribute('api-base') || '',
        rpcUrl: this.getAttribute('rpc-url') || '',
        showDetails: this.getAttribute('show-details') !== 'false',
      });
    }

    pay() {
      return this.widget?.pay();
    }

    reset() {
      this.widget?.reset();
    }

    getState() {
      return this.widget?.getState();
    }
  }

  if (!customElements.get('kamiyo-pay')) {
    customElements.define('kamiyo-pay', KamiyoPayElement);
  }
}

// Global namespace
if (typeof window !== 'undefined') {
  (window as any).KamiyoPay = {
    create: createKamiyoPayWidget,
    Embed: KamiyoPayEmbed,
    version: '1.0.0',
  };
}
