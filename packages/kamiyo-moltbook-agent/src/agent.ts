import Anthropic from '@anthropic-ai/sdk';
import { MoltbookClient } from './moltbook.js';
import { JobDatabase } from './db.js';
import { createEscrowClient, type EscrowClient } from './escrow.js';
import { evaluateJob, formatOffer, hasRelevantKeywords } from './evaluator.js';
import type { AgentConfig, MoltbookPost, Job, WorkResult } from './types.js';

const RELEVANT_KEYWORDS = [
  'escrow',
  'trust',
  'reputation',
  'identity',
  'payment',
  'dispute',
  'oracle',
  'agent',
  'quality',
  'refund',
  'stake',
];

const WALLET_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MoltbookJobBridgeAgent {
  private running = false;
  private moltbook: MoltbookClient;
  private escrow: EscrowClient | null = null;
  private anthropic: Anthropic;
  private db: JobDatabase;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.db = new JobDatabase(config.dbPath);
  }

  async initialize(): Promise<void> {
    const status = await this.moltbook.getAgentStatus();
    if (!status.claimed) {
      console.warn('[Agent] Moltbook agent not claimed yet - cannot post comments');
      console.warn('[Agent] Running in read-only mode');
    }

    this.escrow = await createEscrowClient({
      rpcUrl: this.config.solanaRpcUrl,
      privateKey: this.config.agentPrivateKey,
      programId: this.config.programId,
    });

    console.log('[Agent] Initialized');
    console.log(`[Agent] Wallet: ${this.escrow.publicKey.toBase58()}`);
  }

  async start(): Promise<void> {
    await this.initialize();

    this.running = true;
    console.log('[Agent] Starting job bridge loop');
    console.log(`[Agent] Poll interval: ${this.config.pollIntervalMs}ms`);

    while (this.running) {
      try {
        await this.pollCycle();
      } catch (err) {
        console.error('[Agent] Poll cycle error:', err);
      }

      await sleep(this.config.pollIntervalMs);
    }

    console.log('[Agent] Stopped');
  }

  stop(): void {
    this.running = false;
  }

  private async pollCycle(): Promise<void> {
    await this.findNewJobs();
    await this.checkPendingOffers();
    await this.processActiveJobs();
  }

  private async findNewJobs(): Promise<void> {
    console.log('[Agent] Searching for jobs...');

    const posts = await this.moltbook.searchJobs(RELEVANT_KEYWORDS);
    console.log(`[Agent] Found ${posts.length} posts`);

    let evaluated = 0;
    let offered = 0;

    for (const post of posts) {
      if (this.db.hasSeenPost(post.id)) continue;
      this.db.markSeen(post.id);

      if (!hasRelevantKeywords(post)) continue;

      evaluated++;

      const evaluation = await evaluateJob(post, this.anthropic);

      if (!evaluation.relevant) {
        console.log(`[Agent] Post ${post.id} not relevant: ${evaluation.reason}`);
        continue;
      }

      const price = evaluation.suggestedPrice ?? 0.05;
      if (price < this.config.minJobPriceSol) {
        console.log(`[Agent] Post ${post.id} below min price (${price} < ${this.config.minJobPriceSol})`);
        continue;
      }

      console.log(`[Agent] Making offer on post ${post.id} for ${price} SOL`);
      await this.makeOffer(post, evaluation.suggestedPrice ?? 0.05);
      offered++;
    }

    if (evaluated > 0) {
      console.log(`[Agent] Evaluated ${evaluated} posts, made ${offered} offers`);
    }
  }

  private async makeOffer(post: MoltbookPost, priceSol: number): Promise<void> {
    try {
      const offerText = formatOffer({ relevant: true, reason: '', suggestedPrice: priceSol });
      await this.moltbook.comment(post.id, offerText);
      this.db.saveOffer(post.id, priceSol);
      console.log(`[Agent] Offer posted on ${post.id}`);
    } catch (err) {
      console.error(`[Agent] Failed to post offer on ${post.id}:`, err);
    }
  }

  private async checkPendingOffers(): Promise<void> {
    const pending = this.db.getPendingOffers();
    if (pending.length === 0) return;

    console.log(`[Agent] Checking ${pending.length} pending offers`);

    for (const offer of pending) {
      if (Date.now() - offer.offeredAt > 24 * 60 * 60 * 1000) {
        this.db.updateOfferStatus(offer.postId, 'expired');
        continue;
      }

      const comments = await this.moltbook.getComments(offer.postId);

      for (const comment of comments) {
        if (comment.author === 'kamiyo') continue;

        const wallets = comment.content.match(WALLET_REGEX);
        if (wallets && wallets.length > 0) {
          const wallet = wallets[0];
          console.log(`[Agent] Found wallet ${wallet} in reply to offer ${offer.postId}`);

          const post = await this.moltbook.getPost(offer.postId);
          const jobId = this.db.createJob({
            postId: offer.postId,
            requesterWallet: wallet,
            amountSol: offer.priceSol,
            description: `${post.title}\n\n${post.body}`,
          });

          this.db.updateOfferStatus(offer.postId, 'accepted');
          console.log(`[Agent] Created job ${jobId} for post ${offer.postId}`);

          await this.moltbook.comment(
            offer.postId,
            `Great! I've recorded your wallet. Please create an escrow for ${offer.priceSol} SOL to my address:\n\n${this.escrow?.publicKey.toBase58()}\n\nOnce funded, I'll start working.`
          );

          break;
        }
      }
    }
  }

  private async processActiveJobs(): Promise<void> {
    const active = this.db.getActiveJobs();
    if (active.length === 0) return;

    const inProgress = active.filter((j) => j.status === 'in_progress');
    if (inProgress.length >= this.config.maxConcurrentJobs) {
      console.log(`[Agent] Max concurrent jobs (${this.config.maxConcurrentJobs}) reached`);
      return;
    }

    for (const job of active) {
      if (job.status === 'created') {
        if (Date.now() - job.createdAt > 5 * 60 * 1000) {
          console.log(`[Agent] Starting work on job ${job.id}`);
          this.db.updateJobStatus(job.id, 'in_progress');
        }
      } else if (job.status === 'in_progress') {
        const result = await this.doWork(job);

        if (result.complete) {
          await this.deliverWork(job, result);
        }
      }
    }
  }

  private async doWork(job: Job): Promise<WorkResult> {
    console.log(`[Agent] Working on job ${job.id}...`);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `You are completing a job for payment. Be thorough, accurate, and deliver exactly what was requested.
Focus on agent trust infrastructure topics: escrow, reputation, identity, dispute resolution, payments.
Format your response clearly with sections if appropriate.`,
        messages: [
          {
            role: 'user',
            content: `Complete this job:\n\n${job.description}`,
          },
        ],
      });

      const text = response.content[0];
      if (text.type !== 'text') {
        return { complete: false, deliverable: '', error: 'Invalid response' };
      }

      return {
        complete: true,
        deliverable: text.text,
      };
    } catch (err) {
      return {
        complete: false,
        deliverable: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async deliverWork(job: Job, result: WorkResult): Promise<void> {
    console.log(`[Agent] Delivering job ${job.id}`);

    this.db.setJobDeliverable(job.id, result.deliverable);

    const deliveryComment = `**Job Completed**

${result.deliverable}

---

If you're satisfied with this work, please release the escrow payment. If there are issues, you can file a dispute within 7 days.`;

    try {
      await this.moltbook.comment(job.postId, deliveryComment);
      console.log(`[Agent] Delivered job ${job.id} on Moltbook`);
    } catch (err) {
      console.error(`[Agent] Failed to post delivery for job ${job.id}:`, err);
    }
  }
}
