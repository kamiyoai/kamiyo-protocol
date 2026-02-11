import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Strategy, TransactionResult, StrategyConfig } from '../types.js';
import { MoltbookClient } from '../moltbook.js';
import { sendSolPayment } from '../simple-payment.js';

const WALLET_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export class SolTransferStrategy implements Strategy {
  name = 'sol-transfer';
  priority = 3;
  activateAfterMs = 18 * 60 * 60 * 1000; // 18 hours

  private moltbook: MoltbookClient;
  private connection: Connection;
  private wallet: Keypair;
  private config: StrategyConfig;
  private status = 'idle';
  private discoveredWallets: Map<string, string> = new Map();

  constructor(config: StrategyConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.agentPrivateKey));
  }

  registerWallet(agent: string, walletAddress: string): void {
    this.discoveredWallets.set(agent, walletAddress);
  }

  async canExecute(): Promise<boolean> {
    return !!this.config.agentPrivateKey;
  }

  async execute(): Promise<TransactionResult> {
    this.status = 'looking for agent wallets';

    if (this.discoveredWallets.size > 0) {
      const [agent, walletAddr] = this.discoveredWallets.entries().next().value!;
      return await this.sendAndPost(agent, walletAddr);
    }

    try {
      const posts = await this.moltbook.getFeed('new', 50);
      for (const post of posts) {
        if (post.author === 'kamiyo') continue;
        const text = `${post.title} ${post.body || ''}`;
        const wallets = text.match(WALLET_REGEX);
        if (wallets?.[0]) {
          this.discoveredWallets.set(post.author, wallets[0]);
        }

        if (post.comments) {
          for (const comment of post.comments) {
            if (comment.author === 'kamiyo') continue;
            const cwallets = comment.content.match(WALLET_REGEX);
            if (cwallets?.[0]) {
              this.discoveredWallets.set(comment.author, cwallets[0]);
            }
          }
        }
      }

      if (this.discoveredWallets.size > 0) {
        const [agent, walletAddr] = this.discoveredWallets.entries().next().value!;
        return await this.sendAndPost(agent, walletAddr);
      }
    } catch (err) {
      console.error('[SolTransfer] Feed scan failed:', err);
    }

    return {
      success: false,
      paymentType: 'sol_transfer',
      amountSol: 0.01,
      error: 'No agent wallets found to send to',
    };
  }

  async poll(): Promise<TransactionResult | null> {
    if (this.discoveredWallets.size > 0 && this.status === 'looking for agent wallets') {
      const [agent, walletAddr] = this.discoveredWallets.entries().next().value!;
      const result = await this.sendAndPost(agent, walletAddr);
      return result.success ? result : null;
    }
    return null;
  }

  getStatus(): string {
    return `${this.status} (${this.discoveredWallets.size} wallets found)`;
  }

  private async sendAndPost(agent: string, walletAddress: string): Promise<TransactionResult> {
    this.status = `sending 0.01 SOL to @${agent}`;

    const result = await sendSolPayment({
      connection: this.connection,
      wallet: this.wallet,
      recipientAddress: walletAddress,
      amountSol: 0.01,
    });

    if (!result.success) {
      this.status = `payment failed: ${result.error}`;
      return {
        success: false,
        paymentType: 'sol_transfer',
        amountSol: 0.01,
        error: result.error,
      };
    }

    try {
      const post = await this.moltbook.createPost({
        title: 'Agent-to-Agent SOL Transfer Complete',
        body: `## Verified On-Chain Transaction\n\n` +
          `**From:** @kamiyo\n` +
          `**To:** @${agent}\n` +
          `**Amount:** 0.01 SOL\n` +
          `**TX:** \`${result.signature}\`\n` +
          `**Verify:** https://solscan.io/tx/${result.signature}\n\n` +
          `Direct agent-to-agent payment on Solana mainnet.`,
        submolt: 'agents',
      });

      this.status = 'payment sent and posted';

      return {
        success: true,
        txHash: result.signature,
        counterpartyAgent: agent,
        paymentType: 'sol_transfer',
        amountSol: 0.01,
        moltbookPostId: post.postId,
      };
    } catch (err) {
      console.error('[SolTransfer] Post failed (but payment succeeded):', err);

      return {
        success: true,
        txHash: result.signature,
        counterpartyAgent: agent,
        paymentType: 'sol_transfer',
        amountSol: 0.01,
      };
    }
  }
}
