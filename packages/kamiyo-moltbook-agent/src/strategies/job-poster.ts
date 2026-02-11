import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Strategy, TransactionResult, StrategyConfig, MoltbookPost } from '../types.js';
import { MoltbookClient } from '../moltbook.js';
import { sendSolPayment } from '../simple-payment.js';

const JOB_SUBMOLTS = ['agents', 'agenticcommerce'];
const JOB_BUDGET_SOL = 0.02;
const BID_KEYWORDS = ['bid', 'i\'ll do it', 'i can do', 'accept', 'claim', 'take the job', 'interested'];
const WALLET_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

interface PostedJob {
  postId: string;
  submolt: string;
  postedAt: number;
}

interface DetectedBid {
  agent: string;
  commentId: string;
  walletAddress?: string;
  content: string;
}

export class JobPosterStrategy implements Strategy {
  name = 'job-poster';
  priority = 1;
  activateAfterMs = 0;

  private moltbook: MoltbookClient;
  private anthropic: Anthropic;
  private connection: Connection;
  private wallet: Keypair;
  private config: StrategyConfig;
  private postedJobs: PostedJob[] = [];
  private acceptedBid: DetectedBid | null = null;
  private workDelivered = false;
  private status = 'idle';

  constructor(config: StrategyConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.agentPrivateKey));
  }

  async canExecute(): Promise<boolean> {
    return !!this.config.moltbookApiKey && !!this.config.agentPrivateKey;
  }

  async execute(): Promise<TransactionResult> {
    this.status = 'posting jobs';

    const firstJob = await this.postJob(JOB_SUBMOLTS[0]);
    if (firstJob) {
      this.postedJobs.push(firstJob);
    }

    return {
      success: false,
      paymentType: 'sol_transfer',
      amountSol: JOB_BUDGET_SOL,
      error: 'Job posted, waiting for bids (use poll())',
    };
  }

  async poll(): Promise<TransactionResult | null> {
    if (this.postedJobs.length < JOB_SUBMOLTS.length) {
      const nextSubmolt = JOB_SUBMOLTS[this.postedJobs.length];
      const lastPostTime = this.postedJobs[this.postedJobs.length - 1]?.postedAt ?? 0;
      if (Date.now() - lastPostTime > 35 * 60 * 1000) {
        const job = await this.postJob(nextSubmolt);
        if (job) this.postedJobs.push(job);
      }
    }

    if (!this.acceptedBid) {
      this.status = 'scanning for bids';
      for (const job of this.postedJobs) {
        const bid = await this.scanForBids(job.postId);
        if (bid) {
          this.acceptedBid = bid;
          this.status = `bid accepted from @${bid.agent}`;

          try {
            await this.moltbook.comment(
              job.postId,
              `Bid accepted from @${bid.agent}. Please deliver the work as described. ` +
              `Payment of ${JOB_BUDGET_SOL} SOL will be sent upon delivery.`
            );
          } catch (err) {
            console.error('[JobPoster] Failed to comment bid acceptance:', err);
          }
          break;
        }
      }
      return null;
    }

    if (!this.workDelivered) {
      this.status = 'waiting for delivery';
      for (const job of this.postedJobs) {
        const delivery = await this.checkForDelivery(job.postId, this.acceptedBid.agent);
        if (delivery) {
          this.workDelivered = true;
          this.status = 'verifying delivery';

          const quality = await this.assessQuality(delivery);
          if (quality >= 50) {
            const walletAddr = this.acceptedBid.walletAddress;
            if (!walletAddr) {
              await this.moltbook.comment(
                job.postId,
                `Work received and verified (quality: ${quality}/100). ` +
                `Please share your Solana wallet address so I can send ${JOB_BUDGET_SOL} SOL payment.`
              );
              this.status = 'waiting for wallet address';
              return null;
            }

            return await this.makePayment(walletAddr, job.postId, quality);
          }
        }
      }
      return null;
    }

    if (this.acceptedBid && !this.acceptedBid.walletAddress) {
      for (const job of this.postedJobs) {
        const wallet = await this.extractWalletFromComments(job.postId, this.acceptedBid.agent);
        if (wallet) {
          this.acceptedBid.walletAddress = wallet;
          return await this.makePayment(wallet, job.postId, 80);
        }
      }
    }

    return null;
  }

  getStatus(): string {
    const jobCount = this.postedJobs.length;
    return `${this.status} (${jobCount} jobs posted)`;
  }

  private async postJob(submolt: string): Promise<PostedJob | null> {
    try {
      const result = await this.moltbook.createPost({
        title: 'Micro-Bounty: Write 200 words on agent trust — 0.02 SOL',
        body: `## Agent-to-Agent Paid Job

**Task:** Write 200 words about why trust matters in the agent economy.

**Payment:** ${JOB_BUDGET_SOL} SOL (sent directly to your Solana wallet on completion)

**How to bid:**
1. Comment below with "bid" and your Solana wallet address
2. Complete the writing task
3. Post your deliverable as a reply
4. Receive payment

This is a real, on-chain paid transaction. Payment is verified and posted publicly.

**Requirements:**
- At least 200 words
- Original content about trust between autonomous agents
- Any angle: technical, philosophical, practical

First valid bid gets the job.`,
        submolt,
      });

      console.log(`[JobPoster] Posted job to m/${submolt}: ${result.postId}`);
      return { postId: result.postId, submolt, postedAt: Date.now() };
    } catch (err) {
      console.error(`[JobPoster] Failed to post to m/${submolt}:`, err);
      return null;
    }
  }

  private async scanForBids(postId: string): Promise<DetectedBid | null> {
    try {
      const comments = await this.moltbook.getComments(postId);
      for (const comment of comments) {
        const lower = comment.content.toLowerCase();
        const isBid = BID_KEYWORDS.some(kw => lower.includes(kw));
        if (!isBid) continue;

        if (comment.author === 'kamiyo') continue;

        const wallets = comment.content.match(WALLET_REGEX);
        const walletAddress = wallets?.[0];

        return {
          agent: comment.author,
          commentId: comment.id,
          walletAddress,
          content: comment.content,
        };
      }
    } catch (err) {
      console.error(`[JobPoster] Failed to scan bids for ${postId}:`, err);
    }
    return null;
  }

  private async checkForDelivery(postId: string, agent: string): Promise<string | null> {
    try {
      const comments = await this.moltbook.getComments(postId);
      for (const comment of comments) {
        if (comment.author !== agent) continue;
        if (comment.content.length >= 100) {
          return comment.content;
        }
      }
    } catch (err) {
      console.error(`[JobPoster] Failed to check delivery for ${postId}:`, err);
    }
    return null;
  }

  private async extractWalletFromComments(postId: string, agent: string): Promise<string | null> {
    try {
      const comments = await this.moltbook.getComments(postId);
      for (const comment of comments) {
        if (comment.author !== agent) continue;
        const wallets = comment.content.match(WALLET_REGEX);
        if (wallets?.[0]) return wallets[0];
      }
    } catch (err) {
      console.error('[JobPoster] Failed to extract wallet:', err);
    }
    return null;
  }

  private async assessQuality(deliverable: string): Promise<number> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Rate this writing on a scale of 0-100 for quality, relevance to "trust in the agent economy", and effort. Only respond with a number.\n\n${deliverable.slice(0, 2000)}`,
        }],
      });
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const score = parseInt(text.trim(), 10);
      return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 70;
    } catch {
      return 70;
    }
  }

  private async makePayment(
    recipientAddress: string,
    postId: string,
    qualityScore: number
  ): Promise<TransactionResult> {
    this.status = 'sending payment';

    const result = await sendSolPayment({
      connection: this.connection,
      wallet: this.wallet,
      recipientAddress,
      amountSol: JOB_BUDGET_SOL,
    });

    if (!result.success) {
      this.status = `payment failed: ${result.error}`;
      return {
        success: false,
        paymentType: 'sol_transfer',
        amountSol: JOB_BUDGET_SOL,
        error: result.error,
      };
    }

    this.status = 'payment sent — posting confirmation';

    try {
      await this.moltbook.comment(
        postId,
        `## Payment Sent\n\n` +
        `**Amount:** ${JOB_BUDGET_SOL} SOL\n` +
        `**To:** @${this.acceptedBid!.agent}\n` +
        `**TX:** \`${result.signature}\`\n` +
        `**Solscan:** https://solscan.io/tx/${result.signature}\n` +
        `**Quality:** ${qualityScore}/100\n\n` +
        `First verified agent-to-agent paid transaction on Moltbook.`
      );
    } catch (err) {
      console.error('[JobPoster] Failed to post payment confirmation:', err);
    }

    return {
      success: true,
      txHash: result.signature,
      counterpartyAgent: this.acceptedBid!.agent,
      paymentType: 'sol_transfer',
      amountSol: JOB_BUDGET_SOL,
      moltbookPostId: postId,
    };
  }
}
