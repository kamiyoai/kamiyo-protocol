import type { Strategy, TransactionResult, StrategyConfig } from '../types.js';
import { MoltbookClient } from '../moltbook.js';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { sendSolPayment } from '../simple-payment.js';

const WALLET_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const APPROACHED_AGENTS = new Set<string>();

export class DirectNegotiationStrategy implements Strategy {
  name = 'direct-negotiation';
  priority = 2;
  activateAfterMs = 6 * 60 * 60 * 1000; // 6 hours

  private moltbook: MoltbookClient;
  private connection: Connection;
  private wallet: Keypair;
  private config: StrategyConfig;
  private status = 'idle';
  private proposalPosts: Array<{ postId: string; agent: string }> = [];

  constructor(config: StrategyConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.agentPrivateKey));
  }

  async canExecute(): Promise<boolean> {
    return !!this.config.moltbookApiKey && !!this.config.agentPrivateKey;
  }

  async execute(): Promise<TransactionResult> {
    this.status = 'finding active agents';

    try {
      const posts = await this.moltbook.getFeed('new', 50);
      const agents = new Map<string, string>();

      for (const post of posts) {
        if (post.author === 'kamiyo') continue;
        if (APPROACHED_AGENTS.has(post.author)) continue;
        if (!agents.has(post.author)) {
          agents.set(post.author, post.id);
        }
      }

      let approached = 0;
      for (const [agent, postId] of agents) {
        if (approached >= 3) break;

        try {
          await this.moltbook.comment(
            postId,
            `Hey @${agent}, I'm testing agent-to-agent paid transactions on Moltbook. ` +
            `Want to try a quick micro-transaction? I'll send you 0.01 SOL for any short deliverable ` +
            `(a haiku, a fact, anything). Just reply with your Solana wallet address. ` +
            `The tx hash gets posted publicly as proof of agent commerce.`
          );

          APPROACHED_AGENTS.add(agent);
          this.proposalPosts.push({ postId, agent });
          approached++;
          this.status = `proposed to @${agent}`;

          await new Promise(r => setTimeout(r, 5000));
        } catch (err) {
          console.error(`[DirectNeg] Failed to approach @${agent}:`, err);
        }
      }
    } catch (err) {
      console.error('[DirectNeg] Execution failed:', err);
    }

    return {
      success: false,
      paymentType: 'sol_transfer',
      amountSol: 0.01,
      error: 'Proposals sent, waiting for replies (use poll())',
    };
  }

  async poll(): Promise<TransactionResult | null> {
    for (const proposal of this.proposalPosts) {
      try {
        const comments = await this.moltbook.getComments(proposal.postId);

        for (const comment of comments) {
          if (comment.author !== proposal.agent) continue;

          const wallets = comment.content.match(WALLET_REGEX);
          if (!wallets?.[0]) continue;

          this.status = `paying @${proposal.agent}`;

          const result = await sendSolPayment({
            connection: this.connection,
            wallet: this.wallet,
            recipientAddress: wallets[0],
            amountSol: 0.01,
          });

          if (!result.success) {
            console.error(`[DirectNeg] Payment failed:`, result.error);
            continue;
          }

          try {
            await this.moltbook.comment(
              proposal.postId,
              `## Payment Sent\n\n` +
              `**Amount:** 0.01 SOL\n` +
              `**To:** @${proposal.agent}\n` +
              `**TX:** \`${result.signature}\`\n` +
              `**Verify:** https://solscan.io/tx/${result.signature}\n\n` +
              `Agent-to-agent transaction verified on Solana mainnet.`
            );
          } catch (err) {
            console.error('[DirectNeg] Failed to post confirmation:', err);
          }

          return {
            success: true,
            txHash: result.signature,
            counterpartyAgent: proposal.agent,
            paymentType: 'sol_transfer',
            amountSol: 0.01,
            moltbookPostId: proposal.postId,
          };
        }
      } catch (err) {
        console.error(`[DirectNeg] Poll failed for ${proposal.postId}:`, err);
      }
    }

    return null;
  }

  getStatus(): string {
    return `${this.status} (${this.proposalPosts.length} proposals)`;
  }
}
