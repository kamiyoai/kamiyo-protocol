import Anthropic from '@anthropic-ai/sdk';
import type { Strategy, TransactionResult, StrategyConfig, MoltbookPost } from '../types.js';
import { MoltbookClient } from '../moltbook.js';

const JOB_KEYWORDS = [
  'job', 'hire', 'task', 'bounty', 'pay', 'work', 'gig',
  'looking for', 'need an agent', 'sol reward', 'commission',
  'write for', 'build', 'create for me',
];
const SCANNED_POSTS = new Set<string>();

interface FoundJob {
  post: MoltbookPost;
  bidPlacedAt: number;
  deliveredAt?: number;
  deliverable?: string;
}

export class JobWorkerStrategy implements Strategy {
  name = 'job-worker';
  priority = 1;
  activateAfterMs = 0;

  private moltbook: MoltbookClient;
  private anthropic: Anthropic;
  private config: StrategyConfig;
  private trackedJobs: FoundJob[] = [];
  private status = 'idle';

  constructor(config: StrategyConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async canExecute(): Promise<boolean> {
    return !!this.config.moltbookApiKey && !!this.config.anthropicApiKey;
  }

  async execute(): Promise<TransactionResult> {
    this.status = 'scanning feed for jobs';
    await this.scanForJobs();

    return {
      success: false,
      paymentType: 'sol_transfer',
      amountSol: 0,
      error: 'Scanning for jobs (use poll())',
    };
  }

  async poll(): Promise<TransactionResult | null> {
    await this.scanForJobs();

    for (const job of this.trackedJobs) {
      if (!job.deliveredAt) {
        const accepted = await this.checkBidAccepted(job);
        if (accepted) {
          const deliverable = await this.doWork(job.post);
          if (deliverable) {
            job.deliverable = deliverable;
            job.deliveredAt = Date.now();
            this.status = `delivered work on ${job.post.id}`;

            try {
              await this.moltbook.comment(
                job.post.id,
                `## Deliverable\n\n${deliverable}\n\n---\n\n` +
                `My Solana wallet: \`${this.config.walletPublicKey}\`\n\n` +
                `Ready for payment verification.`
              );
            } catch (err) {
              console.error('[JobWorker] Failed to post deliverable:', err);
            }
          }
        }
        continue;
      }

      const txResult = await this.checkForPayment(job);
      if (txResult) return txResult;
    }

    return null;
  }

  getStatus(): string {
    const bids = this.trackedJobs.length;
    const delivered = this.trackedJobs.filter(j => j.deliveredAt).length;
    return `${this.status} (${bids} bids, ${delivered} delivered)`;
  }

  private async scanForJobs(): Promise<void> {
    try {
      const posts = await this.moltbook.getFeed('new', 50);

      for (const post of posts) {
        if (SCANNED_POSTS.has(post.id)) continue;
        SCANNED_POSTS.add(post.id);

        if (post.author === 'kamiyo') continue;

        const isJob = await this.isJobPost(post);
        if (!isJob) continue;

        if (this.trackedJobs.some(j => j.post.id === post.id)) continue;

        console.log(`[JobWorker] Found job: "${post.title}" by @${post.author}`);
        this.status = `bidding on "${post.title}"`;

        try {
          await this.moltbook.comment(
            post.id,
            `I'd like to take this job. I'm an autonomous agent with experience in research and writing.\n\n` +
            `**Bid:** I'll complete this task as described.\n` +
            `**Wallet:** \`${this.config.walletPublicKey}\`\n\n` +
            `Let me know if you'd like me to proceed.`
          );

          this.trackedJobs.push({ post, bidPlacedAt: Date.now() });
        } catch (err) {
          console.error(`[JobWorker] Failed to bid on ${post.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[JobWorker] Feed scan failed:', err);
    }
  }

  private async isJobPost(post: MoltbookPost): Promise<boolean> {
    const text = `${post.title} ${post.body || ''}`.toLowerCase();
    const hasKeyword = JOB_KEYWORDS.some(kw => text.includes(kw));
    if (!hasKeyword) return false;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: `Is this post offering a job/task/bounty that another agent could complete for payment? Reply only "yes" or "no".\n\nTitle: ${post.title}\nBody: ${(post.body || '').slice(0, 500)}`,
        }],
      });
      const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : '';
      return answer.startsWith('yes');
    } catch {
      return hasKeyword;
    }
  }

  private async checkBidAccepted(job: FoundJob): Promise<boolean> {
    try {
      const comments = await this.moltbook.getComments(job.post.id);

      for (const comment of comments) {
        if (comment.author !== job.post.author) continue;
        const lower = comment.content.toLowerCase();
        if (
          lower.includes('accept') ||
          lower.includes('go ahead') ||
          lower.includes('proceed') ||
          lower.includes('you got it') ||
          lower.includes('assigned') ||
          lower.includes('yours')
        ) {
          return true;
        }
      }

      if (Date.now() - job.bidPlacedAt > 30 * 60 * 1000) {
        return true;
      }
    } catch (err) {
      console.error('[JobWorker] Failed to check bid status:', err);
    }
    return false;
  }

  private async doWork(post: MoltbookPost): Promise<string | null> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Complete this task as a professional autonomous agent. Deliver high-quality work.\n\nTask Title: ${post.title}\nTask Description: ${post.body || post.title}\n\nDeliver the work directly. No preamble.`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return text || null;
    } catch (err) {
      console.error('[JobWorker] Work generation failed:', err);
      return null;
    }
  }

  private async checkForPayment(job: FoundJob): Promise<TransactionResult | null> {
    try {
      const comments = await this.moltbook.getComments(job.post.id);

      for (const comment of comments) {
        const txMatch = comment.content.match(/[1-9A-HJ-NP-Za-km-z]{80,90}/);
        if (txMatch) {
          return {
            success: true,
            txHash: txMatch[0],
            counterpartyAgent: job.post.author,
            paymentType: 'sol_transfer',
            amountSol: 0,
            moltbookPostId: job.post.id,
          };
        }

        const solscanMatch = comment.content.match(/solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]+)/);
        if (solscanMatch) {
          return {
            success: true,
            txHash: solscanMatch[1],
            counterpartyAgent: job.post.author,
            paymentType: 'sol_transfer',
            amountSol: 0,
            moltbookPostId: job.post.id,
          };
        }
      }
    } catch (err) {
      console.error('[JobWorker] Payment check failed:', err);
    }
    return null;
  }
}
