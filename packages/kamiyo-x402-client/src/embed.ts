/**
 * Embeddable KAMIYO Pay Widget
 *
 * Usage:
 * <script src="https://cdn.kamiyo.ai/pay.js"></script>
 * <kamiyo-pay provider="..." amount="1" mode="escrow"></kamiyo-pay>
 *
 * Or programmatically:
 * KamiyoPay.create({ provider: '...', amount: 1 })
 */

export interface EmbedConfig {
  provider: string;
  amount: number;
  mode?: 'escrow' | 'direct';
  timelock?: '1h' | '24h' | '7d' | '30d';
  description?: string;
  apiBase?: string;
  theme?: 'dark' | 'light';
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
}

type EmbedStatus = 'idle' | 'connecting' | 'confirming' | 'processing' | 'success' | 'error';

const STYLES = `
.kamiyo-pay-widget {
  font-family: system-ui, -apple-system, sans-serif;
  display: inline-block;
}
.kamiyo-pay-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(90deg, #ff44f5, #00f0ff);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.kamiyo-pay-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
.kamiyo-pay-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
.kamiyo-pay-btn.success {
  background: #14f195;
  color: #000;
}
.kamiyo-pay-btn.error {
  background: #ff4444;
}
.kamiyo-pay-info {
  margin-top: 6px;
  font-size: 11px;
  color: #888;
}
.kamiyo-pay-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ff4444;
}
.kamiyo-pay-success {
  margin-top: 6px;
  font-size: 12px;
  color: #14f195;
}
.kamiyo-pay-success a {
  color: inherit;
}
.kamiyo-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: kamiyo-spin 1s linear infinite;
}
@keyframes kamiyo-spin {
  to { transform: rotate(360deg); }
}
`;

function injectStyles() {
  if (document.getElementById('kamiyo-pay-styles')) return;
  const style = document.createElement('style');
  style.id = 'kamiyo-pay-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function getWallet(): any {
  return (window as any).phantom?.solana || (window as any).solana || null;
}

export class KamiyoPayEmbed {
  private container: HTMLElement;
  private config: EmbedConfig;
  private status: EmbedStatus = 'idle';
  private error: string | null = null;
  private signature: string | null = null;
  private escrowId: string | null = null;

  constructor(container: HTMLElement, config: EmbedConfig) {
    this.container = container;
    this.config = {
      mode: 'escrow',
      timelock: '24h',
      apiBase: '',
      theme: 'dark',
      ...config,
    };
    injectStyles();
    this.render();
  }

  private render() {
    const { amount, provider, mode, timelock, description } = this.config;

    const btnClass = `kamiyo-pay-btn ${this.status === 'success' ? 'success' : ''} ${this.status === 'error' ? 'error' : ''}`;
    const isDisabled = ['connecting', 'confirming', 'processing'].includes(this.status);
    const showSpinner = this.status === 'processing';

    const buttonText = {
      idle: `Pay ${amount} SOL`,
      connecting: 'Connecting...',
      confirming: 'Confirm in wallet',
      processing: 'Processing...',
      success: 'Paid',
      error: 'Try again',
    }[this.status];

    let html = `
      <div class="kamiyo-pay-widget">
        <button class="${btnClass}" ${isDisabled ? 'disabled' : ''}>
          ${showSpinner ? '<div class="kamiyo-spinner"></div>' : ''}
          ${buttonText}
        </button>
    `;

    if (this.status === 'idle') {
      if (description) {
        html += `<div class="kamiyo-pay-info">${description}</div>`;
      }
      if (mode === 'escrow') {
        html += `<div class="kamiyo-pay-info">Escrow • ${timelock} timelock • To ${shortenAddress(provider)}</div>`;
      }
    }

    if (this.error) {
      html += `<div class="kamiyo-pay-error">${this.error}</div>`;
    }

    if (this.status === 'success' && this.signature) {
      html += `<div class="kamiyo-pay-success"><a href="https://solscan.io/tx/${this.signature}" target="_blank">View transaction →</a></div>`;
    }

    html += '</div>';

    this.container.innerHTML = html;

    const btn = this.container.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this.status === 'error') {
          this.reset();
        } else {
          this.pay();
        }
      });
    }
  }

  private update(status: EmbedStatus, error?: string) {
    this.status = status;
    this.error = error || null;
    this.render();
  }

  private reset() {
    this.status = 'idle';
    this.error = null;
    this.signature = null;
    this.escrowId = null;
    this.render();
  }

  async pay() {
    const wallet = getWallet();

    if (!wallet) {
      this.update('error', 'No Solana wallet found. Install Phantom.');
      this.config.onError?.(new Error('No wallet'));
      return;
    }

    try {
      this.update('connecting');

      if (!wallet.connected) {
        await wallet.connect();
      }

      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      this.update('confirming');

      const { provider, amount, mode, timelock, apiBase } = this.config;
      const apiUrl = mode === 'escrow'
        ? `${apiBase}/api/actions/create-escrow?provider=${provider}&amount=${amount}&timelock=${timelock}`
        : `${apiBase}/api/actions/pay?provider=${provider}&amount=${amount}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: wallet.publicKey.toBase58() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Payment failed');
      }

      const { transaction, message } = await response.json();

      this.update('processing');

      const txBuffer = Uint8Array.from(atob(transaction), c => c.charCodeAt(0));
      const { Transaction: SolanaTx, Connection } = await import('@solana/web3.js');
      const tx = SolanaTx.from(txBuffer);

      const signedTx = await wallet.signTransaction(tx);
      const connection = new Connection('https://api.mainnet-beta.solana.com');
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      this.signature = signature;
      const escrowIdMatch = message?.match(/ID: ([\w_]+)/);
      this.escrowId = escrowIdMatch?.[1] || null;

      this.update('success');

      this.config.onSuccess?.({
        signature,
        transactionId: this.escrowId || signature,
        amount,
        provider,
        escrowId: mode === 'escrow' ? this.escrowId || undefined : undefined,
        mode: mode || 'escrow',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      this.update('error', message);
      this.config.onError?.(err instanceof Error ? err : new Error(message));
    }
  }
}

export function createKamiyoPayWidget(container: HTMLElement | string, config: EmbedConfig): KamiyoPayEmbed {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) throw new Error('Container not found');
  return new KamiyoPayEmbed(el as HTMLElement, config);
}

// Auto-initialize custom elements
if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  class KamiyoPayElement extends HTMLElement {
    private widget?: KamiyoPayEmbed;

    connectedCallback() {
      const provider = this.getAttribute('provider');
      const amount = parseFloat(this.getAttribute('amount') || '0');
      const mode = (this.getAttribute('mode') || 'escrow') as 'escrow' | 'direct';
      const timelock = (this.getAttribute('timelock') || '24h') as '1h' | '24h' | '7d' | '30d';
      const description = this.getAttribute('description') || undefined;

      if (!provider || !amount) {
        this.innerHTML = '<p style="color:red">Missing provider or amount</p>';
        return;
      }

      this.widget = new KamiyoPayEmbed(this, {
        provider,
        amount,
        mode,
        timelock,
        description,
      });
    }
  }

  if (!customElements.get('kamiyo-pay')) {
    customElements.define('kamiyo-pay', KamiyoPayElement);
  }
}

// Global namespace for script tag usage
if (typeof window !== 'undefined') {
  (window as any).KamiyoPay = {
    create: createKamiyoPayWidget,
    Embed: KamiyoPayEmbed,
  };
}
