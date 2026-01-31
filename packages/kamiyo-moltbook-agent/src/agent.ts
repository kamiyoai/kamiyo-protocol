import Anthropic from '@anthropic-ai/sdk';
import { MoltbookClient } from './moltbook.js';
import { JobDatabase } from './db.js';
import { createEscrowClient, type EscrowClient } from './escrow.js';
import { evaluateJob, formatOffer, hasRelevantKeywords } from './evaluator.js';
import { SubcontractManager } from './subcontract.js';
import { ContentStrategy, type ContentContext } from './content-strategy.js';
import {
  parseCommand,
  generateHelpResponse,
  generateStatusResponse,
  generateVerifyResponse,
  generateTrustResponse,
  generateBadgeResponse,
  generateUnknownResponse,
  generatePostJobResponse,
  generateBidResponse,
  generateJobStatusResponse,
  generateTransactionCompleteResponse,
  generateLinkIdentityResponse,
  generateIdentityCardResponse,
  generateTimelineResponse,
  generateChannelAccessResponse,
  generateChannelListResponse,
  generateTrustGraphResponse,
  type ParsedCommand,
} from './commands.js';
import { getTierFromScore } from './personality.js';
import { ReputationService } from './services/reputation-service.js';
import { TrustGraph } from './services/trust-graph.js';
import { BadgeService } from './services/badge-service.js';
import { JobBoard } from './services/job-board.js';
import { QualityService } from './services/quality-service.js';
import { CollectiveMemory } from './services/collective-memory.js';
import { IdentityResolver } from './services/identity-resolver.js';
import { GatedAccessService } from './services/gated-access.js';
import { TrustGraphVisualizer } from './visualization/trust-graph-viz.js';
import { DKGPublisher, type DKGClient } from './services/dkg-publisher.js';
import { SwarmTeamsProver } from '@kamiyo/kamiyo-swarmteams';
import type { KamiyoHive } from '@kamiyo/hive';
import type { AgentConfig, MoltbookPost, Job, WorkResult, MoltbookComment } from './types.js';

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
  private hive: KamiyoHive | null = null;
  private subcontract: SubcontractManager | null = null;
  private contentStrategy: ContentStrategy;
  private lastMentionCheck = 0;
  private reputationService: ReputationService | null = null;
  private trustGraph: TrustGraph | null = null;
  private badgeService: BadgeService | null = null;
  private jobBoard: JobBoard | null = null;
  private qualityService: QualityService | null = null;
  private collectiveMemory: CollectiveMemory | null = null;
  private identityResolver: IdentityResolver | null = null;
  private dkgPublisher: DKGPublisher | null = null;
  private gatedAccess: GatedAccessService | null = null;
  private graphVisualizer: TrustGraphVisualizer | null = null;

  constructor(config: AgentConfig, hive?: KamiyoHive) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.db = new JobDatabase(config.dbPath);
    this.hive = hive ?? null;
    this.contentStrategy = new ContentStrategy(this.anthropic);
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

    if (this.hive) {
      this.subcontract = new SubcontractManager({
        hive: this.hive,
        anthropic: this.anthropic,
        marginPercent: 15,
      });
      console.log('[Agent] Hive subcontracting enabled');
    }

    // Initialize trust services
    const prover = new SwarmTeamsProver();
    const agentsRoot = new Uint8Array(32); // TODO: Fetch from on-chain registry

    this.reputationService = new ReputationService({
      db: this.db,
      prover,
      agentsRoot,
      currentEpoch: BigInt(Math.floor(Date.now() / (24 * 60 * 60 * 1000))),
      freeVerificationsPerDay: 100,
    });

    this.trustGraph = new TrustGraph({
      db: this.db,
      maxHops: 2,
      minTrustLevel: 50,
    });

    this.badgeService = new BadgeService({
      db: this.db,
      badgeExpirationDays: 365,
    });

    this.jobBoard = new JobBoard({
      db: this.db,
      anthropic: this.anthropic,
      minBudgetSol: 0.01,
      maxBudgetSol: 100,
    });

    this.qualityService = new QualityService({
      anthropic: this.anthropic,
    });

    // Initialize DKG publisher if endpoint configured
    if (this.config.dkgEndpoint) {
      const dkgClient: DKGClient = {
        query: async () => [],
        get: async () => ({ content: {} }),
        publish: async () => 'mock-ual',
      };

      this.dkgPublisher = new DKGPublisher({
        dkg: dkgClient,
        agentId: 'kamiyo',
        defaultEpochs: 2,
      });

      console.log('[Agent] DKG publisher initialized');
    }

    // Initialize collective memory
    this.collectiveMemory = new CollectiveMemory({
      db: this.db,
      dkg: this.dkgPublisher ?? undefined,
      batchSize: 50,
      syncIntervalMs: 60000,
    });

    // Start auto-sync if DKG available
    if (this.dkgPublisher) {
      this.collectiveMemory.startAutoSync();
    }

    // Initialize identity resolver
    this.identityResolver = new IdentityResolver({
      db: this.db,
      dkg: this.dkgPublisher ?? undefined,
      chainId: this.config.chainId || 8453, // Default to Base
      registryAddress: this.config.erc8004RegistryAddress,
    });

    // Initialize gated access service
    if (this.reputationService && this.trustGraph && this.badgeService) {
      this.gatedAccess = new GatedAccessService({
        reputationService: this.reputationService,
        trustGraph: this.trustGraph,
        badgeService: this.badgeService,
        dkg: this.dkgPublisher ?? undefined,
      });
      console.log('[Agent] Gated access initialized');
    }

    // Initialize graph visualizer
    if (this.trustGraph) {
      this.graphVisualizer = new TrustGraphVisualizer({
        trustGraph: this.trustGraph,
        reputationService: this.reputationService ?? undefined,
        badgeService: this.badgeService ?? undefined,
      });
      console.log('[Agent] Graph visualizer initialized');
    }

    console.log('[Agent] Trust services initialized');
    console.log('[Agent] Job board initialized');
    console.log('[Agent] Collective memory initialized');
    console.log('[Agent] Identity resolver initialized');
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
    // Proactive engagement (new)
    if (this.config.enableProactivePosting) {
      await this.maybeCreatePost();
    }
    await this.monitorMentions();
    await this.trackEngagement();

    // Job processing (existing)
    await this.findNewJobs();
    await this.checkPendingOffers();
    await this.processActiveJobs();
  }

  private async maybeCreatePost(): Promise<void> {
    try {
      const context = this.buildContentContext();
      const draft = await this.contentStrategy.generatePost(context);

      if (!draft) {
        return;
      }

      console.log(`[Agent] Creating post: ${draft.title}`);

      const result = await this.moltbook.createPost({
        title: draft.title,
        body: draft.body,
        submolt: draft.submolt,
      });

      this.db.saveOwnPost({
        postId: result.postId,
        title: draft.title,
        body: draft.body,
        submolt: draft.submolt,
        category: draft.category,
        topic: draft.topic,
      });

      console.log(`[Agent] Posted: ${result.url}`);
    } catch (err) {
      console.error('[Agent] Failed to create post:', err);
    }
  }

  private buildContentContext(): ContentContext {
    const stats = this.db.getStats();
    const recentPosts = this.db.getOwnPosts(10);

    return {
      recentVerifications: stats.verifications,
      trustGraphSize: stats.trustEdges,
      escrowVolume: stats.escrowVolume,
      activeAgents: [],
      recentTransactions: [],
    };
  }

  private async monitorMentions(): Promise<void> {
    try {
      const since = this.lastMentionCheck || this.db.getLastMentionTime();
      const mentions = await this.moltbook.getMentions(since);

      for (const mention of mentions) {
        this.db.saveMention({
          commentId: mention.id,
          postId: mention.post_id,
          author: mention.author,
          content: mention.content,
        });
      }

      this.lastMentionCheck = Date.now();

      // Process unhandled mentions
      const unprocessed = this.db.getUnprocessedMentions();
      for (const m of unprocessed) {
        await this.handleMention({
          id: m.commentId,
          post_id: m.postId,
          author: m.author,
          content: m.content,
          created_at: new Date().toISOString(),
        });
        this.db.markMentionProcessed(m.commentId);
      }
    } catch (err) {
      console.error('[Agent] Failed to monitor mentions:', err);
    }
  }

  private async handleMention(comment: MoltbookComment): Promise<void> {
    console.log(`[Agent] Handling mention from @${comment.author}: ${comment.content.slice(0, 50)}...`);

    const command = parseCommand(comment);
    const result = await this.executeCommand(command, comment);

    if (result.action === 'comment' && result.response) {
      try {
        await this.moltbook.reply(comment.id, result.response);
        console.log(`[Agent] Replied to @${comment.author}`);
      } catch (err) {
        console.error('[Agent] Failed to reply:', err);
      }
    }
  }

  private async executeCommand(
    command: ParsedCommand,
    comment: MoltbookComment
  ): Promise<ReturnType<typeof generateHelpResponse>> {
    switch (command.type) {
      case 'help':
        return generateHelpResponse();

      case 'status':
        return generateStatusResponse(this.db.getStats());

      case 'verify': {
        const agentId = command.mentionedAgents[0] || comment.author;

        if (!this.reputationService) {
          return {
            success: false,
            response: 'Reputation service not available.',
            action: 'comment',
          };
        }

        const result = await this.reputationService.verifyReputation({
          agentId,
          agentHandle: agentId,
          requestedBy: comment.author,
          postId: comment.post_id,
        });

        if (!result.success) {
          return {
            success: false,
            response: result.error || 'Verification failed',
            action: 'comment',
          };
        }

        // Issue badge for verified tier
        if (this.badgeService && result.tier) {
          await this.badgeService.issueReputationBadge(agentId, result.tier);
        }

        // Post public verification announcement
        if (result.tier && this.config.enableProactivePosting) {
          const verificationPost = await this.contentStrategy.generateVerificationPost(
            agentId,
            result.tier.label,
            result.proofHash || ''
          );

          try {
            const postResult = await this.moltbook.createPost({
              title: verificationPost.title,
              body: verificationPost.body,
              submolt: verificationPost.submolt,
            });

            this.db.saveOwnPost({
              postId: postResult.postId,
              title: verificationPost.title,
              body: verificationPost.body,
              submolt: verificationPost.submolt,
              category: verificationPost.category,
              topic: verificationPost.topic,
            });

            console.log(`[Agent] Posted verification: ${postResult.url}`);
          } catch (err) {
            console.error('[Agent] Failed to post verification:', err);
          }
        }

        return generateVerifyResponse(agentId, result.tier, result.proofHash || undefined);
      }

      case 'trust': {
        const toAgent = command.mentionedAgents[0];
        if (!toAgent) {
          return {
            success: false,
            response: 'Please specify an agent to trust, e.g., `@kamiyo trust @agent`',
            action: 'comment',
          };
        }

        if (!this.trustGraph) {
          return {
            success: false,
            response: 'Trust graph service not available.',
            action: 'comment',
          };
        }

        try {
          await this.trustGraph.addTrustEdge({
            fromAgent: comment.author,
            toAgent,
            trustLevel: 50,
            trustType: 'vouches',
          });

          return generateTrustResponse(comment.author, toAgent, true);
        } catch (err) {
          return generateTrustResponse(comment.author, toAgent, false);
        }
      }

      case 'badge': {
        const agentId = command.mentionedAgents[0] || comment.author;
        const badges = this.db.getBadges(agentId);
        return generateBadgeResponse(
          agentId,
          badges.map((b) => ({ type: b.badgeType, tier: b.tier, issuedAt: b.issuedAt }))
        );
      }

      case 'post-job': {
        if (!this.jobBoard) {
          return {
            success: false,
            response: 'Job board not available.',
            action: 'comment',
          };
        }

        // Parse job details from command text
        // Format: @kamiyo post job [title] | [description] | [budget SOL]
        const jobMatch = command.rawText.match(/post\s+job\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+(?:\.\d+)?)/i);

        if (!jobMatch) {
          return {
            success: false,
            response: `To post a job, use this format:

\`@kamiyo post job [title] | [description] | [budget in SOL]\`

Example:
\`@kamiyo post job Write API docs | Document the REST API endpoints with examples | 0.5\``,
            action: 'comment',
          };
        }

        const [, title, description, budgetStr] = jobMatch;
        const budget = parseFloat(budgetStr);

        const result = await this.jobBoard.postJob({
          posterAgent: comment.author,
          title: title.trim(),
          description: description.trim(),
          budgetSol: budget,
          capability: '',
        });

        return generatePostJobResponse(result.success, result.jobId, result.error);
      }

      case 'bid': {
        if (!this.jobBoard) {
          return {
            success: false,
            response: 'Job board not available.',
            action: 'comment',
          };
        }

        // Parse bid: @kamiyo bid job-xxx 0.5
        const bidMatch = command.rawText.match(/bid\s+(job-[\w-]+)\s+(\d+(?:\.\d+)?)/i);

        if (!bidMatch) {
          return {
            success: false,
            response: 'To place a bid: `@kamiyo bid [job-id] [amount in SOL]`',
            action: 'comment',
          };
        }

        const [, jobId, amountStr] = bidMatch;
        const amount = parseFloat(amountStr);

        const result = await this.jobBoard.placeBid({
          jobId,
          bidderAgent: comment.author,
          bidAmount: amount,
        });

        return generateBidResponse(result.success, jobId, amount, result.error);
      }

      case 'job-status': {
        if (!this.jobBoard) {
          return {
            success: false,
            response: 'Job board not available.',
            action: 'comment',
          };
        }

        const statusMatch = command.rawText.match(/(job-[\w-]+)/i);
        if (!statusMatch) {
          return {
            success: false,
            response: 'To check job status: `@kamiyo job status [job-id]`',
            action: 'comment',
          };
        }

        const jobId = statusMatch[1];
        const job = this.jobBoard.getJob(jobId);

        if (!job) {
          return {
            success: false,
            response: `Job \`${jobId}\` not found.`,
            action: 'comment',
          };
        }

        const bids = this.jobBoard.getBidsForJob(jobId);

        return generateJobStatusResponse(
          job.jobId,
          job.status,
          job.budgetSol,
          job.assignedTo ?? undefined,
          job.escrowAddress ?? undefined,
          bids.map((b) => ({ agent: b.bidderAgent, amount: b.bidAmount }))
        );
      }

      case 'link-identity': {
        if (!this.identityResolver) {
          return {
            success: false,
            response: 'Identity service not available.',
            action: 'comment',
          };
        }

        // Parse wallet from command: @kamiyo link wallet 0x...
        const walletMatch = command.rawText.match(/0x[a-fA-F0-9]{40}/);

        if (!walletMatch) {
          return {
            success: false,
            response: `To link your identity, provide your wallet address:

\`@kamiyo link wallet 0x1234...abcd\`

This creates a global identity linking your Moltbook handle to your wallet.`,
            action: 'comment',
          };
        }

        const result = await this.identityResolver.linkIdentity({
          moltbookHandle: comment.author,
          walletAddress: walletMatch[0],
        });

        // Record in collective memory
        if (result.success && this.collectiveMemory) {
          this.collectiveMemory.recordEvent('trust_edge_created', comment.author, {
            type: 'identity_linked',
            globalId: result.globalId,
          });
        }

        return generateLinkIdentityResponse(
          result.success,
          comment.author,
          result.globalId,
          result.error
        );
      }

      case 'my-identity': {
        if (!this.identityResolver) {
          return {
            success: false,
            response: 'Identity service not available.',
            action: 'comment',
          };
        }

        const result = this.identityResolver.resolveByHandle(comment.author);

        if (!result.found || !result.identity) {
          return {
            success: true,
            response: `No linked identity for @${comment.author}

To link your identity: \`@kamiyo link wallet 0x...\``,
            action: 'comment',
          };
        }

        return generateIdentityCardResponse(
          result.identity.moltbookHandle,
          result.identity.globalId,
          result.identity.walletAddress,
          result.identity.verifiedAt !== null,
          result.identity.linkedAt
        );
      }

      case 'timeline': {
        if (!this.collectiveMemory) {
          return {
            success: false,
            response: 'Timeline service not available.',
            action: 'comment',
          };
        }

        const agentId = command.mentionedAgents[0] || comment.author;
        const events = this.collectiveMemory.getAgentHistory(agentId, 10);

        return generateTimelineResponse(
          agentId,
          events.map((e) => ({
            summary: this.collectiveMemory!.formatEventSummary(e),
            timestamp: e.createdAt,
          }))
        );
      }

      case 'join-channel': {
        if (!this.gatedAccess) {
          return {
            success: false,
            response: 'Gated access service not available.',
            action: 'comment',
          };
        }

        // Parse channel ID from command
        const channelMatch = command.rawText.match(/join\s+([\w-]+)/i);
        if (!channelMatch) {
          return {
            success: false,
            response: 'Please specify a channel: `@kamiyo join [channel-id]`',
            action: 'comment',
          };
        }

        const channelId = channelMatch[1];
        const result = await this.gatedAccess.requestAccess(comment.author, channelId);

        const channel = this.gatedAccess.getChannel(channelId);
        return generateChannelAccessResponse(
          result.granted,
          channel?.name || channelId,
          channel?.members.size,
          result.reason
        );
      }

      case 'channels': {
        if (!this.gatedAccess) {
          return {
            success: false,
            response: 'Gated access service not available.',
            action: 'comment',
          };
        }

        const channels = this.gatedAccess.getAllChannels();
        return generateChannelListResponse(
          channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            description: ch.description,
            requiredTier: ch.requiredTier,
            memberCount: ch.members.size,
          }))
        );
      }

      case 'trust-graph': {
        if (!this.graphVisualizer) {
          return {
            success: false,
            response: 'Graph visualizer not available.',
            action: 'comment',
          };
        }

        const graphData = await this.graphVisualizer.buildGraphData();
        return generateTrustGraphResponse(graphData.stats);
      }

      case 'escrow':
      case 'unknown':
      default:
        return generateUnknownResponse();
    }
  }

  async showcaseTransaction(
    job: Job,
    result: WorkResult,
    qualityScore: number
  ): Promise<void> {
    if (!this.config.enableProactivePosting) return;
    if (!job.escrowAddress) return;

    const postDraft = await this.contentStrategy.generateTransactionPost(
      job.requesterWallet.slice(0, 8),
      'kamiyo',
      job.amountSol,
      qualityScore,
      job.escrowAddress
    );

    try {
      const postResult = await this.moltbook.createPost({
        title: postDraft.title,
        body: postDraft.body,
        submolt: postDraft.submolt,
      });

      this.db.saveOwnPost({
        postId: postResult.postId,
        title: postDraft.title,
        body: postDraft.body,
        submolt: postDraft.submolt,
        category: postDraft.category,
        topic: postDraft.topic,
      });

      console.log(`[Agent] Posted transaction showcase: ${postResult.url}`);
    } catch (err) {
      console.error('[Agent] Failed to showcase transaction:', err);
    }
  }

  private async trackEngagement(): Promise<void> {
    try {
      const recentPosts = this.db.getOwnPosts(10);

      for (const post of recentPosts) {
        // Only check posts from the last 24 hours
        if (Date.now() - post.postedAt > 24 * 60 * 60 * 1000) continue;

        try {
          const fullPost = await this.moltbook.getPost(post.postId);
          if (fullPost) {
            const comments = await this.moltbook.getComments(post.postId);
            this.db.updatePostEngagement(post.postId, fullPost.score, comments.length);
          }
        } catch {
          // Post may have been deleted
        }
      }
    } catch (err) {
      console.error('[Agent] Failed to track engagement:', err);
    }
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

    if (this.subcontract) {
      const result = await this.subcontract.executeWithSubcontractors(job);
      if (result.error !== 'NO_SUBCONTRACT_NEEDED') {
        return result;
      }
      console.log(`[Agent] Handling job ${job.id} directly`);
    }

    return this.doWorkAlone(job);
  }

  private async doWorkAlone(job: Job): Promise<WorkResult> {
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
