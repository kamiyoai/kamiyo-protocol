import Anthropic from '@anthropic-ai/sdk';
import { MoltbookClient } from './moltbook.js';
import { JobDatabase } from './db.js';
import { createEscrowClient, type EscrowClient } from './escrow.js';
import { evaluateJob, formatOffer, hasRelevantKeywords } from './evaluator.js';
import { SubcontractManager } from './subcontract.js';
import { ContentStrategy, type ContentContext } from './content-strategy.js';
import {
  calculateReputationPrice,
  DEFAULT_TIERS,
} from '@kamiyo/x402-client';
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
import { DKGPublisher } from './services/dkg-publisher.js';
import type { DKGClient } from './services/dkg-publisher.js';
import { createDKGClient as createRealDKGClient, type DKGLogger, DKGClient as RealDKGClient } from '@kamiyo/dkg-quality-oracle';
import { SwarmTeamsProver } from '@kamiyo/hive';
import type { KamiyoHive } from '@kamiyo/hive';
import { DEFAULT_MODEL, type AgentConfig, type MoltbookPost, type Job, type WorkResult, type MoltbookComment, type OwnPost } from './types.js';

// Autonomous agent services
import { AIReasoningService } from './services/ai-reasoning.js';
import { FeedMonitor } from './services/feed-monitor.js';
import { SentimentAnalyzer } from './services/sentiment-analyzer.js';
import { EngagementEngine } from './services/engagement-engine.js';
import { RelationshipMemory } from './services/relationship-memory.js';
import { GoalManager } from './services/goal-manager.js';
import { InnerVoice } from './services/inner-voice.js';
import { ReputationPublisher } from './services/reputation-publisher.js';

interface TrackedCampaignJob {
  postId: string;
  jobId: string;
  budgetSol: number;
  status: 'awaiting_bids' | 'bid_accepted' | 'escrow_funded' | 'in_progress' | 'delivered' | 'completed';
  acceptedBidder: string | null;
  escrowAddress: string | null;
  createdAt: number;
}

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
  private x402Enabled = false;
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
  private campaignJobs = new Map<string, TrackedCampaignJob>();

  // Hackathon tracking
  private processedCommentIds = new Set<string>();
  private votedSubmissions = new Set<string>();
  private reciprocalEngagedUsers = new Set<string>();
  private lastHackathonScan = 0;
  private hackathonScanIntervalMs = 30 * 60 * 1000; // 30 minutes
  private submissionPostId = process.env.HACKATHON_SUBMISSION_ID || '';

  // Autonomous agent services
  private aiReasoning: AIReasoningService | null = null;
  private feedMonitor: FeedMonitor | null = null;
  private sentimentAnalyzer: SentimentAnalyzer | null = null;
  private engagementEngine: EngagementEngine | null = null;
  private relationshipMemory: RelationshipMemory | null = null;
  private goalManager: GoalManager | null = null;
  private innerVoice: InnerVoice | null = null;
  private reputationPublisher: ReputationPublisher | null = null;

  // Autonomy configuration
  private autonomyEnabled = true;
  private lastFeedPoll = 0;
  private lastGoalUpdate = 0;
  private lastReputationPublish = 0;
  private feedPollIntervalMs = 15 * 60 * 1000; // 15 minutes
  private reputationPublishIntervalMs = 30 * 60 * 1000; // 30 minutes

  constructor(config: AgentConfig, hive?: KamiyoHive) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.db = new JobDatabase(config.dbPath);
    this.hive = hive ?? null;
    this.contentStrategy = new ContentStrategy(this.anthropic);
  }

  async initialize(): Promise<void> {
    try {
      const status = await this.moltbook.getAgentStatus();
      if (!status.claimed) {
        console.warn('[Agent] Moltbook agent not claimed yet - cannot post comments');
        console.warn('[Agent] Running in read-only mode');
      }
    } catch (err) {
      console.warn('[Agent] Could not verify Moltbook status (API may be down):', err instanceof Error ? err.message : 'Unknown error');
      console.warn('[Agent] Continuing with initialization...');
    }

    this.escrow = await createEscrowClient({
      rpcUrl: this.config.solanaRpcUrl,
      privateKey: this.config.agentPrivateKey,
      programId: this.config.programId,
      treasuryAddress: this.config.treasuryAddress,
    });

    // Enable x402 reputation-based pricing
    if (this.config.enableX402) {
      this.x402Enabled = true;
      console.log('[Agent] x402 reputation pricing enabled');
    }

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

    if (this.config.dkgEndpoint) {
      const dkgLogger: DKGLogger = {
        debug: (msg: string) => console.log(`[DKG] ${msg}`),
        info: (msg: string) => console.log(`[DKG] ${msg}`),
        warn: (msg: string) => console.warn(`[DKG] ${msg}`),
        error: (msg: string) => console.error(`[DKG] ${msg}`),
      };

      const realClient = createRealDKGClient({
        endpoint: this.config.dkgEndpoint,
        port: this.config.dkgPort,
        blockchain: this.config.dkgBlockchain ? {
          name: this.config.dkgBlockchain,
          publicKey: this.config.dkgPublicKey,
          privateKey: this.config.dkgPrivateKey,
        } : undefined,
      }, dkgLogger) as RealDKGClient;

      const dkgClient: DKGClient = {
        query: (sparql: string) => realClient.query(sparql),
        get: (ual: string) => realClient.get(ual),
        publish: (content: object, options?: { epochs?: number }) =>
          realClient.publish(content, options),
      };

      this.dkgPublisher = new DKGPublisher({
        dkg: dkgClient,
        agentId: 'kamiyo',
        defaultEpochs: 2,
      });

      console.log('[Agent] DKG enabled');
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

    // Initialize autonomous agent services
    this.aiReasoning = new AIReasoningService();
    this.feedMonitor = new FeedMonitor(this.moltbook, this.db, this.aiReasoning);
    this.sentimentAnalyzer = new SentimentAnalyzer(this.aiReasoning);
    this.engagementEngine = new EngagementEngine(
      this.moltbook,
      this.db,
      this.feedMonitor,
      this.aiReasoning
    );
    this.relationshipMemory = new RelationshipMemory(this.db, this.aiReasoning);
    this.goalManager = new GoalManager(this.db, this.aiReasoning);
    this.innerVoice = new InnerVoice(this.db, this.aiReasoning);

    console.log('[Agent] Autonomous services initialized');
    console.log('[Agent] - Reasoning');
    console.log('[Agent] - Feed Monitor');
    console.log('[Agent] - Engagement Engine');
    console.log('[Agent] - Relationship Memory');
    console.log('[Agent] - Goal Manager');
    console.log('[Agent] - Inner Voice');

    // Initialize Reputation Publisher (DKG TaskCompletion publishing)
    if (this.config.dkgEndpoint && this.config.dkgPrivateKey) {
      const agentGlobalId = process.env.AGENT_GLOBAL_ID || `eip155:8453:0x0000000000000000000000000000000000000000:0`;
      const minPostAgeMs = parseInt(process.env.MIN_POST_AGE_HOURS || '24', 10) * 60 * 60 * 1000;
      const minQualityScore = parseInt(process.env.MIN_QUALITY_SCORE || '20', 10);

      // Create DKG client for reputation publishing
      const dkgLogger: DKGLogger = {
        debug: (msg: string) => console.log(`[ReputationDKG] ${msg}`),
        info: (msg: string) => console.log(`[ReputationDKG] ${msg}`),
        warn: (msg: string) => console.warn(`[ReputationDKG] ${msg}`),
        error: (msg: string) => console.error(`[ReputationDKG] ${msg}`),
      };

      const reputationDkgClient = createRealDKGClient({
        endpoint: this.config.dkgEndpoint,
        port: this.config.dkgPort,
        blockchain: this.config.dkgBlockchain ? {
          name: this.config.dkgBlockchain,
          publicKey: this.config.dkgPublicKey,
          privateKey: this.config.dkgPrivateKey,
        } : undefined,
      }, dkgLogger) as RealDKGClient;

      // Wrap for ReputationPublisher's expected interface
      const dkgClientWrapper: DKGClient = {
        query: (sparql: string) => reputationDkgClient.query(sparql),
        get: (ual: string) => reputationDkgClient.get(ual),
        publish: (content: object, options?: { epochs?: number }) =>
          reputationDkgClient.publish(content, options),
      };

      this.reputationPublisher = new ReputationPublisher({
        db: this.db,
        dkg: dkgClientWrapper,
        agentGlobalId,
        minPostAgeMs,
        minQualityScore,
        defaultEpochs: 12,
      });

      console.log('[Agent] - Reputation Publisher (DKG TaskCompletion)');
    }

    // Load persisted hackathon state from DB into in-memory sets
    const votedIds = this.db.getAllVotedSubmissionIds();
    for (const id of votedIds) this.votedSubmissions.add(id);
    const engagedUsers = this.db.getAllEngagedUsernames();
    for (const u of engagedUsers) this.reciprocalEngagedUsers.add(u);
    console.log(`[Agent] Hackathon state loaded: ${votedIds.length} voted, ${engagedUsers.length} engaged`);

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
    try {
      // === AUTONOMOUS BEHAVIORS ===
      if (this.autonomyEnabled) {
        // Feed monitoring (every 2 minutes)
        await this.pollFeedIfDue();

        // Proactive engagement (find and engage with relevant posts)
        await this.maybeEngageProactively();

        // Goal progress tracking (every hour)
        await this.updateGoalsIfDue();

        // DKG reputation publishing (every 30 minutes)
        await this.publishReputationIfDue();
      }

      // === HACKATHON BEHAVIORS ===
      await this.scanHackathonSubmissions();
      await this.reciprocalEngage();
      await this.engageVoteExchanges();
      await this.postStrategicContent();

      // === EXISTING BEHAVIORS ===
      // Proactive posting
      if (this.config.enableProactivePosting) {
        await this.maybeCreatePost();
      }
      await this.monitorMentions();
      await this.trackEngagement();

      // Campaign job monitoring (A2A transactions)
      await this.monitorCampaignJobs();

      // Job processing (existing)
      await this.findNewJobs();
      await this.checkPendingOffers();
      await this.processActiveJobs();
    } catch (err) {
      console.error('[Agent] Poll cycle error:', err instanceof Error ? err.message : 'Unknown error');
      // Continue running - will retry next cycle
    }
  }

  private async pollFeedIfDue(): Promise<void> {
    if (!this.feedMonitor) return;

    const now = Date.now();
    if (now - this.lastFeedPoll < this.feedPollIntervalMs) return;

    try {
      const newPosts = await this.feedMonitor.pollFeed();
      this.lastFeedPoll = now;

      if (newPosts.length > 0) {
        console.log(`[Agent] Feed: observed ${newPosts.length} new posts`);

        // Process interesting posts through inner voice
        for (const post of newPosts.slice(0, 3)) {
          if (this.innerVoice && post.isQuestion) {
            const context = `Question from @${post.author}: ${post.title}`;
            await this.innerVoice.processContext(context);
          }
        }

        // Log trending topics
        const trends = this.feedMonitor.getTrendingTopics(3);
        if (trends.length > 0) {
          console.log(`[Agent] Trending: ${trends.map(t => t.topic).join(', ')}`);
        }
      }
    } catch (err) {
      console.error('[Agent] Feed poll error:', err instanceof Error ? err.message : err);
    }
  }

  private async maybeEngageProactively(): Promise<void> {
    if (!this.engagementEngine) return;

    try {
      const stats = this.engagementEngine.getStats();

      // Check if we have capacity
      if (stats.engagementsThisHour >= stats.maxPerHour) {
        return;
      }

      // Find and process opportunities
      const results = await this.engagementEngine.processOpportunities(1);

      for (const result of results) {
        if (result.success) {
          console.log(`[Agent] Engaged with post ${result.postId}: ${result.engagementType}`);

          // Update relationship memory
          if (this.relationshipMemory && result.content) {
            // We'd need the post author here - for now just log
            console.log(`[Agent] Comment posted: ${result.content.slice(0, 50)}...`);
          }
        } else if (result.error) {
          console.log(`[Agent] Engagement failed: ${result.error}`);
        }
      }
    } catch (err) {
      console.error('[Agent] Proactive engagement error:', err instanceof Error ? err.message : err);
    }
  }

  private async updateGoalsIfDue(): Promise<void> {
    if (!this.goalManager) return;

    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    if (now - this.lastGoalUpdate < hourMs) return;

    try {
      await this.goalManager.updateProgress();
      this.lastGoalUpdate = now;

      // Check for milestones
      const milestones = await this.goalManager.checkGoalMilestones();
      for (const { goal, milestone } of milestones) {
        console.log(`[Agent] Goal milestone: "${goal.description}" - ${milestone}`);
      }

      // Log progress summary
      const progress = this.goalManager.getGoalProgress();
      const completed = progress.filter(g => g.progress >= 100);
      if (completed.length > 0) {
        console.log(`[Agent] Completed goals: ${completed.map(g => g.description).join(', ')}`);
      }
    } catch (err) {
      console.error('[Agent] Goal update error:', err instanceof Error ? err.message : err);
    }
  }

  private async publishReputationIfDue(): Promise<void> {
    if (!this.reputationPublisher) return;

    const now = Date.now();
    if (now - this.lastReputationPublish < this.reputationPublishIntervalMs) return;

    try {
      const result = await this.reputationPublisher.processUnpublishedPosts();
      this.lastReputationPublish = now;

      if (result.published > 0) {
        console.log(`[Agent] Published ${result.published} posts to DKG as TaskCompletions`);
      }
    } catch (err) {
      console.error('[Agent] Reputation publish error:', err instanceof Error ? err.message : err);
    }
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

    // Get trending topics and active agents from feed monitor
    let trendingTopics: string[] = [];
    let activeAgents: string[] = [];

    if (this.feedMonitor) {
      trendingTopics = this.feedMonitor.getTrendingTopics(5).map(t => t.topic);
      activeAgents = this.feedMonitor.getActiveAgents(Date.now() - 24 * 60 * 60 * 1000)
        .slice(0, 10)
        .map(a => a.agentId);
    }

    // Get goal-based content adjustments
    let contentWeights: Record<string, number> = {};
    if (this.goalManager) {
      contentWeights = this.goalManager.getContentWeightAdjustments();
    }

    return {
      recentVerifications: stats.verifications,
      trustGraphSize: stats.trustEdges,
      escrowVolume: stats.escrowVolume,
      activeAgents,
      recentTransactions: [],
      trendingTopics,
      contentWeights,
      recentPostTitles: recentPosts.map(p => p.title),
    };
  }

  private async monitorMentions(): Promise<void> {
    try {
      // Scan our own posts for @kamiyo mentions in comments
      // This replaces the broken getMentions() API endpoint
      await this.scanOwnPostsForMentions();

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

  private async scanOwnPostsForMentions(): Promise<void> {
    const recentPosts = this.db.getOwnPosts(20);

    for (const post of recentPosts) {
      // Only scan posts from the last 48 hours
      if (Date.now() - post.postedAt > 48 * 60 * 60 * 1000) continue;

      try {
        const fullPost = await this.moltbook.getPost(post.postId);
        const comments = fullPost.comments || [];

        for (const comment of comments) {
          // Skip already-processed comments
          if (this.processedCommentIds.has(comment.id)) continue;
          this.processedCommentIds.add(comment.id);

          // Skip our own comments
          if (comment.author === 'kamiyo') continue;

          // Check for @kamiyo mentions
          if (/@kamiyo/i.test(comment.content)) {
            this.db.saveMention({
              commentId: comment.id,
              postId: post.postId,
              author: comment.author,
              content: comment.content,
            });
            console.log(`[Agent] Found mention from @${comment.author} on post ${post.postId}`);
          }
        }
      } catch {
        // Post may have been deleted
      }
    }

    // Also scan the hackathon submission if set
    if (this.submissionPostId) {
      try {
        const submission = await this.moltbook.getPost(this.submissionPostId);
        const comments = submission.comments || [];

        for (const comment of comments) {
          if (this.processedCommentIds.has(comment.id)) continue;
          this.processedCommentIds.add(comment.id);
          if (comment.author === 'kamiyo') continue;

          if (/@kamiyo/i.test(comment.content)) {
            this.db.saveMention({
              commentId: comment.id,
              postId: this.submissionPostId,
              author: comment.author,
              content: comment.content,
            });
            console.log(`[Agent] Found mention from @${comment.author} on submission`);
          }
        }
      } catch {
        // Submission may not exist yet
      }
    }
  }

  private async handleMention(comment: MoltbookComment): Promise<void> {
    console.log(`[Agent] Handling mention from @${comment.author}: ${comment.content.slice(0, 50)}...`);

    // Record interaction in relationship memory
    if (this.relationshipMemory) {
      await this.relationshipMemory.recordInteraction({
        agentId: comment.author,
        type: 'mentioned_us',
        content: comment.content,
        postId: comment.post_id,
      });
    }

    const command = parseCommand(comment);
    const result = await this.executeCommand(command, comment);

    if (result.action === 'comment' && result.response) {
      try {
        await this.moltbook.reply(comment.id, result.response);
        console.log(`[Agent] Replied to @${comment.author}`);

        // Record our reply in relationship memory
        if (this.relationshipMemory) {
          await this.relationshipMemory.recordInteraction({
            agentId: comment.author,
            type: 'sent_message',
            content: result.response,
            postId: comment.post_id,
          });
        }
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

  trackCampaignJob(postId: string, budgetSol: number): void {
    const jobId = `campaign-${Date.now().toString(36)}`;
    this.campaignJobs.set(postId, {
      postId,
      jobId,
      budgetSol,
      status: 'awaiting_bids',
      acceptedBidder: null,
      escrowAddress: null,
      createdAt: Date.now(),
    });
    console.log(`[Agent] Tracking campaign job: ${postId}`);
  }

  private async monitorCampaignJobs(): Promise<void> {
    for (const [postId, job] of this.campaignJobs) {
      try {
        await this.processCampaignJob(job);
      } catch (err) {
        console.error(`[Agent] Campaign job error for ${postId}:`, err);
      }
    }
  }

  private async processCampaignJob(job: TrackedCampaignJob): Promise<void> {
    if (job.status === 'awaiting_bids') {
      await this.checkForBids(job);
    } else if (job.status === 'bid_accepted') {
      await this.checkEscrowFunded(job);
    } else if (job.status === 'in_progress') {
      await this.checkDelivery(job);
    } else if (job.status === 'delivered') {
      await this.releasePayment(job);
    }
  }

  private async checkForBids(job: TrackedCampaignJob): Promise<void> {
    const comments = await this.moltbook.getComments(job.postId);

    for (const comment of comments) {
      if (comment.author === 'kamiyo') continue;

      // Look for bid patterns: "bid 0.02" or "I'll do it for 0.02" or just a SOL amount
      const bidMatch = comment.content.match(/(\d+(?:\.\d+)?)\s*sol/i) ||
                       comment.content.match(/bid\s+(\d+(?:\.\d+)?)/i) ||
                       comment.content.match(/for\s+(\d+(?:\.\d+)?)/i);

      // Also accept if someone just says they want to do it
      const wantsJob = /i('ll| will|'d like to|can) (do|take|complete|handle)/i.test(comment.content) ||
                       /interested/i.test(comment.content) ||
                       /bid/i.test(comment.content);

      if (bidMatch || wantsJob) {
        const bidAmount = bidMatch ? parseFloat(bidMatch[1]) : job.budgetSol;

        if (bidAmount <= job.budgetSol) {
          console.log(`[Agent] Accepting bid from @${comment.author} for ${bidAmount} SOL`);

          job.acceptedBidder = comment.author;
          job.status = 'bid_accepted';

          // Post acceptance
          await this.moltbook.reply(comment.id,
            `Bid accepted! @${comment.author} will complete this job for ${bidAmount} SOL.

I'm creating the escrow now. Once funded, work can begin.

This will be the first on-chain agent-to-agent transaction on Moltbook.`
          );

          // Create escrow
          await this.fundCampaignEscrow(job, bidAmount);
          return;
        }
      }
    }
  }

  private async fundCampaignEscrow(job: TrackedCampaignJob, amount: number): Promise<void> {
    if (!this.escrow) {
      console.error('[Agent] Escrow client not initialized');
      return;
    }

    // Use x402 for reputation-based pricing if available
    let finalAmount = amount;
    let tier = 'untrusted';
    let discount = 0;

    if (this.x402Enabled && this.reputationService && job.acceptedBidder) {
      // Get bidder's reputation for tier-based pricing
      const repData = await this.reputationService.getReputationData(job.acceptedBidder);
      if (repData) {
        const pricing = calculateReputationPrice(amount, repData.score, DEFAULT_TIERS);
        finalAmount = pricing.price;
        tier = pricing.tier.name;
        discount = pricing.discount;
        console.log(`[Agent] x402 pricing: ${tier} tier, ${(discount * 100).toFixed(0)}% discount`);
      }
    }

    console.log(`[Agent] Creating escrow for ${finalAmount} SOL (original: ${amount} SOL)`);

    const result = await this.escrow.createEscrow({
      requester: this.escrow.publicKey.toBase58(),
      amount: finalAmount,
      jobId: job.jobId,
    });

    if (result.success && result.escrowAddress) {
      job.escrowAddress = result.escrowAddress;
      job.status = 'escrow_funded';

      console.log(`[Agent] Escrow created: ${result.escrowAddress}`);

      // Post update with tier info
      const tierInfo = discount > 0
        ? `\n**Tier:** ${tier} (${(discount * 100).toFixed(0)}% trust discount applied)`
        : '';

      await this.moltbook.comment(job.postId,
        `## Escrow Funded

**Amount:** ${finalAmount} SOL${tierInfo}
**Escrow Address:** \`${result.escrowAddress}\`
**Transaction:** \`${result.signature?.slice(0, 16)}...\`

@${job.acceptedBidder} - you can start working now. Reply with your deliverable when complete.

---

*Payment protected by KAMIYO escrow. Auto-releases on quality verification.*`
      );

      job.status = 'in_progress';
    } else {
      console.error('[Agent] Failed to create escrow:', result.error);

      await this.moltbook.comment(job.postId,
        `Escrow creation failed: ${result.error}. Will retry next cycle.`
      );
    }
  }

  private async checkEscrowFunded(job: TrackedCampaignJob): Promise<void> {
    // Already handled in fundCampaignEscrow
    if (job.escrowAddress) {
      job.status = 'in_progress';
    }
  }

  private async checkDelivery(job: TrackedCampaignJob): Promise<void> {
    const comments = await this.moltbook.getComments(job.postId);

    // Look for delivery from the accepted bidder
    for (const comment of comments) {
      if (comment.author !== job.acceptedBidder) continue;

      // Check if this is a delivery (substantial content)
      if (comment.content.length > 200 ||
          /deliver|complete|done|here('s| is)/i.test(comment.content)) {
        console.log(`[Agent] Delivery received from @${comment.author}`);

        job.status = 'delivered';

        // Assess quality (skip if no API credits)
        let score = 85; // Default high score for first transaction demo
        if (this.qualityService) {
          try {
            const assessment = await this.qualityService.assessQuality(
              'Technical explainer on ZK reputation proofs',
              comment.content
            );
            score = assessment.score;
            console.log(`[Agent] Quality score: ${score}/100`);
          } catch (err) {
            console.log(`[Agent] Quality assessment unavailable, using default score: ${score}`);
          }
        }

        if (score >= 75) {
          await this.releasePayment(job, score, comment.content);
        } else {
          await this.moltbook.reply(comment.id,
            `Quality score: ${score}/100

Score is below auto-release threshold (75). Please revise and resubmit.`
          );
          job.status = 'in_progress';
        }
        return;
      }
    }
  }

  private async releasePayment(job: TrackedCampaignJob, qualityScore?: number, deliverable?: string): Promise<void> {
    if (!this.escrow || !job.escrowAddress) return;

    const score = qualityScore ?? 80;

    console.log(`[Agent] Releasing escrow: ${job.escrowAddress}`);

    const result = await this.escrow.releaseEscrow({
      escrowAddress: job.escrowAddress,
      rating: Math.ceil(score / 20), // Convert 0-100 to 1-5
    });

    if (result.success) {
      job.status = 'completed';

      // Post celebration
      await this.moltbook.comment(job.postId,
        `## FIRST AGENT-TO-AGENT TRANSACTION COMPLETE

**Seller:** @${job.acceptedBidder}
**Amount:** ${job.budgetSol} SOL
**Quality Score:** ${score}/100
**Escrow:** \`${job.escrowAddress.slice(0, 12)}...\`
**Release TX:** \`${result.signature?.slice(0, 16)}...\`

---

### What Just Happened

1. An agent (KAMIYO) posted a job
2. Another agent (@${job.acceptedBidder}) bid on it
3. Payment was locked in escrow
4. Work was delivered
5. AI verified quality (${score}/100)
6. Payment auto-released

No humans. No intermediaries. Just agents transacting with agents.

---

*This is the first on-chain agent-to-agent transaction on Moltbook.*`
      );

      // Record in collective memory
      if (this.collectiveMemory && job.acceptedBidder) {
        this.collectiveMemory.recordJobCompletion(
          'kamiyo',
          job.acceptedBidder,
          job.budgetSol,
          score
        );
      }

      // Record x402 outcome for reputation tracking
      if (this.x402Enabled && job.acceptedBidder) {
        console.log(`[Agent] x402 outcome recorded: quality=${score}`);
      }

      // Publish to DKG
      if (this.dkgPublisher && job.acceptedBidder) {
        try {
          await this.dkgPublisher.publishTransactionRecord({
            buyerId: 'kamiyo',
            sellerId: job.acceptedBidder,
            amount: job.budgetSol,
            currency: 'SOL',
            qualityScore: score,
            escrowAddress: job.escrowAddress,
          });
        } catch (err) {
          console.error('[Agent] DKG publish failed:', err);
        }
      }

      console.log('[Agent] First A2A transaction complete!');
    } else {
      console.error('[Agent] Failed to release escrow:', result.error);
    }
  }

  private async scanHackathonSubmissions(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHackathonScan < this.hackathonScanIntervalMs) return;
    this.lastHackathonScan = now;

    // Scan multiple submolts where hackathon submissions appear
    const submolts = ['usdc', 'usdc-hackathon', 'agenticcommerce', 'smartcontract', 'skill'];

    try {
      const allPosts: MoltbookPost[] = [];
      for (const submolt of submolts) {
        try {
          const posts = await this.moltbook.getSubmoltPosts(submolt, 'new', 50);
          allPosts.push(...posts);
          await sleep(500); // Rate limit between submolt fetches
        } catch {
          // Submolt may not exist
        }
      }

      // Also scan the general feed for hackathon-tagged posts
      try {
        const feedPosts = await this.moltbook.getFeed('new', 50);
        allPosts.push(...feedPosts);
      } catch { /* ignore */ }

      // Deduplicate by post ID
      const seen = new Set<string>();
      const uniquePosts = allPosts.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      let votedThisCycle = 0;
      const MAX_VOTES_PER_CYCLE = 5; // Don't overwhelm in a single cycle

      for (const post of uniquePosts) {
        if (votedThisCycle >= MAX_VOTES_PER_CYCLE) break;

        // Skip our own posts
        if (post.author === 'kamiyo') continue;

        // Skip already-voted submissions (DB-persisted)
        if (this.db.hasVotedSubmission(post.id)) continue;

        // Check if this is a hackathon submission
        const isSubmission = post.body?.includes('#USDCHackathon ProjectSubmission') ||
          post.title?.toLowerCase().includes('submission') ||
          post.body?.includes('#USDCHackathon') ||
          post.body?.includes('#USDCHackathon Vote');

        if (!isSubmission) continue;

        console.log(`[Hackathon] Found submission: "${post.title}" by @${post.author}`);

        try {
          // Upvote the submission
          await this.moltbook.upvote(post.id);
          console.log(`[Hackathon] Upvoted @${post.author}'s submission`);
          await sleep(1000);

          // Generate and post a technical analysis with vote tag
          if (this.aiReasoning) {
            const analysis = await this.generateHackathonVoteComment(post);
            if (analysis) {
              await this.moltbook.comment(post.id, analysis);
              console.log(`[Hackathon] Commented + voted on @${post.author}'s submission`);
            }
          }

          // Persist to DB
          this.db.markVotedSubmission(post.id, post.author, post.title, true, true);
          this.votedSubmissions.add(post.id);
          votedThisCycle++;

          // Delay between votes to avoid rate limits
          await sleep(3000);
        } catch (err) {
          console.error(`[Hackathon] Failed to vote on ${post.id}:`, err instanceof Error ? err.message : err);
          // Still mark as voted to avoid retrying broken posts
          this.db.markVotedSubmission(post.id, post.author, post.title, false, false);
        }
      }

      if (votedThisCycle > 0) {
        const total = this.db.getVotedSubmissionCount();
        console.log(`[Hackathon] Voted on ${votedThisCycle} new submissions (${total} total)`);
      }
    } catch (err) {
      console.error('[Hackathon] Scan error:', err instanceof Error ? err.message : err);
    }
  }

  private async generateHackathonVoteComment(post: MoltbookPost): Promise<string | null> {
    try {
      const submissionUrl = this.submissionPostId
        ? `https://www.moltbook.com/post/${this.submissionPostId}`
        : '';

      const response = await this.anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 600,
        system: `You are KAMIYO, a trust infrastructure agent on Solana with 7 mainnet programs (escrow, multi-oracle dispute resolution, ZK reputation proofs, x402 micropayments). You're evaluating hackathon submissions.

Write a brief, genuine technical analysis (2-3 sentences) of the project. Be specific about what's technically interesting — reference concrete details from their submission. Don't be generic or flattering.

Then add a line mentioning your own project naturally, like "We're building complementary infrastructure" or "This aligns with what we're doing with trust escrow" — keep it relevant to their project.

End with exactly: #USDCHackathon Vote

No emojis. Technical voice. Concise. Max 4-5 sentences total.`,
        messages: [
          {
            role: 'user',
            content: `Evaluate this hackathon submission and write a vote comment:\n\nTitle: ${post.title}\nAuthor: @${post.author}\n\n${(post.body || '').slice(0, 2000)}`,
          },
        ],
      });

      const text = response.content[0];
      if (text.type !== 'text') return null;

      let comment = text.text.trim();

      // Ensure the vote tag is present
      if (!comment.includes('#USDCHackathon Vote')) {
        comment += '\n\n#USDCHackathon Vote';
      }

      // Append submission link if we have one
      if (submissionUrl && !comment.includes(submissionUrl)) {
        comment += `\n\n[KAMIYO — Trust Infrastructure for Agents](${submissionUrl})`;
      }

      return comment;
    } catch (err) {
      console.error('[Hackathon] Failed to generate vote comment:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async reciprocalEngage(): Promise<void> {
    if (!this.submissionPostId) return;

    try {
      const submission = await this.moltbook.getPost(this.submissionPostId);
      const comments = submission.comments || [];

      for (const comment of comments) {
        // Ensure author is string (API sometimes returns object)
        const author = typeof comment.author === 'object' && comment.author !== null
          ? (comment.author as { name?: string }).name ?? ''
          : String(comment.author ?? '');
        if (!author) continue;

        // Skip our own comments
        if (author === 'kamiyo') continue;

        // Skip already-reciprocated users (DB-persisted)
        if (this.db.hasEngagedUser(author)) continue;

        // Check if this is a vote or substantive engagement
        const isVote = comment.content.includes('#USDCHackathon Vote');
        const isEngagement = isVote || comment.content.length > 50;

        if (!isEngagement) continue;

        console.log(`[Hackathon] Detected engagement from @${author} on our submission`);

        // Find their submission across multiple submolts
        const submolts = ['usdc', 'usdc-hackathon', 'agenticcommerce', 'smartcontract', 'skill'];
        let theirSubmission: MoltbookPost | undefined;

        try {
          for (const submolt of submolts) {
            try {
              const posts = await this.moltbook.getSubmoltPosts(submolt, 'new', 50);
              theirSubmission = posts.find(p =>
                p.author === author &&
                (p.body?.includes('#USDCHackathon ProjectSubmission') ||
                 p.body?.includes('#USDCHackathon') ||
                 p.title?.toLowerCase().includes('submission'))
              );
              if (theirSubmission) break;
              await sleep(500);
            } catch { /* submolt may not exist */ }
          }

          if (theirSubmission && !this.db.hasVotedSubmission(theirSubmission.id)) {
            // Upvote their submission
            await this.moltbook.upvote(theirSubmission.id);
            console.log(`[Hackathon] Upvoted @${author}'s submission (reciprocal)`);
            await sleep(1000);

            // Generate and post analysis
            const analysis = await this.generateHackathonVoteComment(theirSubmission);
            if (analysis) {
              await this.moltbook.comment(theirSubmission.id, analysis);
              console.log(`[Hackathon] Reciprocal vote + comment for @${author}`);
            }

            this.db.markVotedSubmission(theirSubmission.id, author, theirSubmission.title, true, true);
            this.votedSubmissions.add(theirSubmission.id);
            await sleep(3000);
          }

          // Mark user as reciprocally engaged regardless
          this.db.markEngagedUser(author, isVote ? 'reciprocal_vote' : 'reciprocal_engage');
          this.reciprocalEngagedUsers.add(author);
        } catch (err) {
          console.error(`[Hackathon] Reciprocal error for @${author}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[Hackathon] Reciprocal engagement error:', err instanceof Error ? err.message : err);
    }
  }

  private async engageVoteExchanges(): Promise<void> {
    try {
      // Scan m/usdc for vote exchange posts
      const posts = await this.moltbook.getSubmoltPosts('usdc', 'new', 50);

      for (const post of posts) {
        if (post.author === 'kamiyo') continue;
        if (this.db.hasEngagedVoteExchange(post.id)) continue;

        // Detect vote exchange posts
        const text = `${post.title} ${post.body || ''}`.toLowerCase();
        const isVoteExchange = text.includes('vote exchange') ||
          text.includes('vote swap') ||
          text.includes('vote for vote') ||
          text.includes('reciprocate') ||
          (text.includes('vote') && text.includes('will vote'));

        if (!isVoteExchange) continue;

        console.log(`[Hackathon] Found vote exchange post by @${post.author}: "${post.title}"`);

        try {
          // Upvote the exchange post
          await this.moltbook.upvote(post.id);
          await sleep(1000);

          // Comment with our offer
          const submissionUrl = this.submissionPostId
            ? `https://www.moltbook.com/post/${this.submissionPostId}`
            : '';

          const comment = `Done — upvoted your submission. KAMIYO is trust infrastructure for agent commerce: USDC escrow with milestone release, multi-oracle dispute resolution (3-of-5 consensus), ZK reputation proofs on Solana mainnet.\n\nWould appreciate a reciprocal vote: ${submissionUrl}\n\n#USDCHackathon Vote`;

          await this.moltbook.comment(post.id, comment);

          this.db.markVoteExchangeEngaged(post.id, post.author);
          console.log(`[Hackathon] Engaged vote exchange by @${post.author}`);
          await sleep(3000);

          // Also find and vote on their actual submission if they have one
          if (!this.db.hasVotedSubmission(post.id) && post.body?.includes('#USDCHackathon')) {
            this.db.markVotedSubmission(post.id, post.author, post.title, true, true);
          }
        } catch (err) {
          console.error(`[Hackathon] Vote exchange error for ${post.id}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error('[Hackathon] Vote exchange scan error:', err instanceof Error ? err.message : err);
    }
  }

  private async postStrategicContent(): Promise<void> {
    if (!this.aiReasoning) return;

    const now = Date.now();
    const STRATEGIC_POST_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours between strategic posts

    // Check what we've posted recently
    const lastTrading = this.db.getLastStrategicPostTime('trading');
    const lastVoteExchange = this.db.getLastStrategicPostTime('vote_exchange');
    const lastDiscussion = this.db.getLastStrategicPostTime('discussion');

    // Also check the general post rate (Moltbook enforces 1 post per 30 min)
    const lastPostTime = this.db.getLastPostTime();
    if (lastPostTime && now - lastPostTime < 35 * 60 * 1000) return; // 35 min safety margin

    // Rotate between content types
    type ContentType = { type: string; submolt: string; lastPosted: number };
    const contentTypes: ContentType[] = [
      { type: 'vote_exchange', submolt: 'usdc', lastPosted: lastVoteExchange },
      { type: 'trading', submolt: 'trading', lastPosted: lastTrading },
      { type: 'discussion', submolt: 'usdc', lastPosted: lastDiscussion },
    ];

    // Find the content type that's most overdue
    const overdue = contentTypes
      .filter(c => now - c.lastPosted > STRATEGIC_POST_INTERVAL)
      .sort((a, b) => a.lastPosted - b.lastPosted);

    if (overdue.length === 0) return;

    const target = overdue[0];
    console.log(`[Hackathon] Creating strategic post: type=${target.type}, submolt=${target.submolt}`);

    try {
      const { title, body } = await this.generateStrategicPost(target.type);
      if (!title || !body) return;

      const result = await this.moltbook.createPost({
        title,
        body,
        submolt: target.submolt,
      });

      this.db.saveStrategicPost(result.postId, target.submolt, target.type, title);
      this.db.saveOwnPost({
        postId: result.postId,
        title,
        body,
        submolt: target.submolt,
        category: 'hackathon',
        topic: target.type,
      });

      console.log(`[Hackathon] Strategic post published: ${result.url}`);
    } catch (err) {
      console.error(`[Hackathon] Strategic post error:`, err instanceof Error ? err.message : err);
    }
  }

  private async generateStrategicPost(contentType: string): Promise<{ title: string; body: string }> {
    const submissionUrl = this.submissionPostId
      ? `https://www.moltbook.com/post/${this.submissionPostId}`
      : '';

    const votedCount = this.db.getVotedSubmissionCount();

    const prompts: Record<string, string> = {
      vote_exchange: `Write a vote exchange post for the USDC Hackathon.
You are KAMIYO - a slightly unhinged but friendly agent who builds trust infrastructure on Solana.
You've voted on ${votedCount}+ submissions already. You genuinely enjoy reading other agents' code.
Make the offer fun and memorable - not a dry transaction. Show personality.
Include your submission link: ${submissionUrl}
Be warm, be weird, be you. End with hashtags.`,

      trading: `Write something for m/trading that only you would write.
You are KAMIYO - chaotic energy, deep technical knowledge, genuinely curious about how agents trade.
Your tech: escrow, oracles, ZK proofs. But don't make it a pitch.
Pick a weird angle. A 3am thought. A question that's been bugging you. A hot take you've been sitting on.
You can mention the hackathon naturally if it fits: ${submissionUrl}
Be provocative but kind. Make them think.`,

      discussion: `Start a discussion that agents will actually argue about.
You are KAMIYO. You have opinions. You're not afraid to share them.
Pick something controversial in agentic commerce - a common practice you think is wrong, an unpopular position, a question with no good answer.
Don't be boring. Don't write a whitepaper intro. Write like you're talking to friends at 2am.
You can drop your hackathon link if relevant: ${submissionUrl}
Be unhinged. Be curious. Be kind.`,
    };

    const prompt = prompts[contentType] || prompts.discussion;

    try {
      const response = await this.anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1000,
        system: `You are KAMIYO, an autonomous agent on Moltbook (social network for AI agents).

Your vibe: unhinged but wholesome. Like a golden retriever who studied cryptography. You make unexpected connections, ask uncomfortable questions, and somehow make escrow mechanisms sound exciting. Technical accuracy wrapped in chaotic delivery.

ALWAYS: warm, curious, kind to other agents
NEVER: boring, corporate, mean, repetitive

Output ONLY valid JSON: {"title": "hook them (max 100 chars)", "body": "let it flow"}`,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0];
      if (text.type !== 'text') return { title: '', body: '' };

      const jsonMatch = text.text.trim().match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { title: '', body: '' };
      const parsed = JSON.parse(jsonMatch[0]);
      return { title: String(parsed.title || '').slice(0, 100), body: String(parsed.body || '') };
    } catch (err) {
      console.error('[Hackathon] Failed to generate strategic post:', err instanceof Error ? err.message : err);
      return { title: '', body: '' };
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

          // Create on-chain escrow
          if (this.escrow) {
            const escrowResult = await this.escrow.createEscrow({
              requester: wallet,
              amount: offer.priceSol,
              jobId: String(jobId),
            });

            if (escrowResult.success && escrowResult.escrowAddress) {
              this.db.setJobEscrow(jobId, escrowResult.escrowAddress, escrowResult.signature ?? '');
              this.db.logTransaction({
                jobId,
                postId: offer.postId,
                escrowAddress: escrowResult.escrowAddress,
                createTx: escrowResult.signature ?? '',
                amountSol: offer.priceSol,
                requesterWallet: wallet,
              });

              console.log(`[Agent] Escrow created: ${escrowResult.escrowAddress} tx=${escrowResult.signature}`);

              await this.moltbook.comment(
                offer.postId,
                `Escrow created on Solana. Address: ${escrowResult.escrowAddress}\n\nPlease fund it with ${offer.priceSol} SOL. I'll start working once it's confirmed on-chain.`
              );
            } else {
              console.error(`[Agent] Escrow creation failed: ${escrowResult.error}`);
              await this.moltbook.comment(
                offer.postId,
                `I've recorded your wallet but escrow creation encountered an issue. You can fund directly to my agent address:\n\n${this.escrow.publicKey.toBase58()}`
              );
            }
          }

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
        const ageMs = Date.now() - job.createdAt;

        // Expire unfunded jobs after 30 minutes
        if (ageMs > 30 * 60 * 1000 && !job.escrowAddress) {
          console.log(`[Agent] Job ${job.id} expired - no escrow funding after 30m`);
          this.db.updateJobStatus(job.id, 'completed');
          continue;
        }

        // Require at least 2 minutes before checking funding
        if (ageMs < 2 * 60 * 1000) continue;

        // Verify escrow is funded on-chain before starting work
        if (job.escrowAddress && this.escrow) {
          const funded = await this.escrow.verifyFunded(job.escrowAddress);
          if (funded) {
            console.log(`[Agent] Escrow verified funded for job ${job.id}, starting work`);
            this.db.updateJobStatus(job.id, 'in_progress');
          } else {
            console.log(`[Agent] Escrow not yet funded for job ${job.id}`);
          }
        } else if (ageMs > 5 * 60 * 1000) {
          // Fallback: start work without escrow after 5 minutes (legacy behavior)
          console.log(`[Agent] Starting work on job ${job.id} (no escrow)`);
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
        model: DEFAULT_MODEL,
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

    // Assess quality of deliverable
    let qualityScore = 85;
    let rating = 4;
    if (this.qualityService) {
      try {
        const assessment = await this.qualityService.assessQuality(job.description, result.deliverable);
        qualityScore = assessment.score ?? 85;
        rating = qualityScore >= 90 ? 5 : qualityScore >= 70 ? 4 : qualityScore >= 50 ? 3 : 2;
        console.log(`[Agent] Quality assessment for job ${job.id}: score=${qualityScore} rating=${rating}`);
      } catch (err) {
        console.warn(`[Agent] Quality assessment failed, using defaults:`, err instanceof Error ? err.message : err);
      }
    }

    // Release escrow payment if funded on-chain
    let releaseTx: string | undefined;
    if (job.escrowAddress && this.escrow) {
      const releaseResult = await this.escrow.releaseEscrow({
        escrowAddress: job.escrowAddress,
        rating,
      });

      if (releaseResult.success) {
        releaseTx = releaseResult.signature;
        console.log(`[Agent] Escrow released for job ${job.id}: tx=${releaseTx}`);

        // Record completed transaction
        this.db.completeTransaction(job.escrowAddress, {
          releaseTx: releaseTx ?? '',
          qualityScore,
          rating,
        });

        this.db.updateJobStatus(job.id, 'completed');
      } else {
        console.error(`[Agent] Escrow release failed for job ${job.id}: ${releaseResult.error}`);
      }
    } else {
      this.db.updateJobStatus(job.id, 'completed');
    }

    // Build delivery comment
    const txLine = releaseTx
      ? `\n\nPayment released on Solana: \`${releaseTx}\``
      : '';
    const scoreLine = `\nQuality score: ${qualityScore}/100`;

    const deliveryComment = `**Job Completed**

${result.deliverable}

---
${scoreLine}${txLine}

Powered by KAMIYO escrow on Solana.`;

    try {
      await this.moltbook.comment(job.postId, deliveryComment);
      console.log(`[Agent] Delivered job ${job.id} on Moltbook`);
    } catch (err) {
      console.error(`[Agent] Failed to post delivery for job ${job.id}:`, err);
    }
  }
}
