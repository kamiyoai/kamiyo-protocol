/**
 * EngagementEngine - Proactive engagement with Moltbook posts
 *
 * Finds opportunities to engage, decides whether to engage,
 * generates thoughtful responses, and executes with rate limiting.
 */

import type { MoltbookClient } from '../moltbook.js';
import type { MoltbookPost } from '../types.js';
import type { JobDatabase } from '../db.js';
import { KAMIYO_PERSONALITY } from '../personality.js';
import {
  AIReasoningService,
  type EngagementDecision,
  type AgentRelationship,
  type Goal,
  type ReasoningContext,
} from './ai-reasoning.js';
import { FeedMonitor, type ObservedPost } from './feed-monitor.js';

export interface EngagementOpportunity {
  postId: string;
  post: MoltbookPost;
  observed: ObservedPost;
  type: 'question' | 'discussion' | 'help_request' | 'topic_match';
  relevanceScore: number;
  suggestedApproach: 'answer' | 'comment' | 'question' | 'amplify';
  reasoning: string;
}

export interface EngagementResult {
  postId: string;
  success: boolean;
  engagementType: string;
  content?: string;
  error?: string;
}

export const ENGAGEMENT_RULES = {
  maxPerHour: 4,
  minRelevanceScore: 0.6,
  minPostAgeMs: 5 * 60 * 1000,        // 5 minutes
  maxPostAgeMs: 6 * 60 * 60 * 1000,   // 6 hours
  preferTrustedAgents: true,
  topicsToEngage: [
    'trust', 'reputation', 'escrow', 'zk', 'agents', 'identity',
    'verification', 'payment', 'oracle', 'quality', 'autonomous',
  ],
  topicsToAvoid: ['politics', 'controversy', 'drama', 'scam'],
  minConfidence: 0.7,
};

export class EngagementEngine {
  private moltbook: MoltbookClient;
  private db: JobDatabase;
  private ai: AIReasoningService;
  private feedMonitor: FeedMonitor;

  private engagementCount = 0;
  private engagementWindowStart = Date.now();
  private recentEngagements = new Set<string>();

  constructor(
    moltbook: MoltbookClient,
    db: JobDatabase,
    feedMonitor: FeedMonitor,
    ai?: AIReasoningService
  ) {
    this.moltbook = moltbook;
    this.db = db;
    this.feedMonitor = feedMonitor;
    this.ai = ai || new AIReasoningService();
  }

  async findOpportunities(): Promise<EngagementOpportunity[]> {
    const opportunities: EngagementOpportunity[] = [];
    const now = Date.now();

    // Get recent posts from feed monitor
    const recentPosts = this.feedMonitor.getRecentPosts(50);

    for (const observed of recentPosts) {
      // Skip if already engaged
      if (this.recentEngagements.has(observed.postId)) continue;

      // Check post age
      const postAge = now - observed.observedAt;
      if (postAge < ENGAGEMENT_RULES.minPostAgeMs) continue;
      if (postAge > ENGAGEMENT_RULES.maxPostAgeMs) continue;

      // Check basic relevance
      if (!this.passesBasicFilters(observed)) continue;

      // Get full post data
      let post: MoltbookPost;
      try {
        post = await this.moltbook.getPost(observed.postId);
      } catch {
        continue;
      }

      // Skip own posts
      if (post.author === 'kamiyo') continue;

      // Get AI evaluation
      const ctx = this.buildContext();
      const decision = await this.ai.evaluateOpportunity(post, ctx);

      if (decision.shouldEngage && decision.confidence >= ENGAGEMENT_RULES.minConfidence) {
        opportunities.push({
          postId: observed.postId,
          post,
          observed,
          type: this.determineOpportunityType(observed, decision),
          relevanceScore: decision.confidence,
          suggestedApproach: decision.approach === 'ignore' ? 'comment' : decision.approach,
          reasoning: decision.reasoning,
        });
      }
    }

    // Sort by relevance
    return opportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private passesBasicFilters(observed: ObservedPost): boolean {
    // Check if topics match our interests
    const matchesTopics = observed.topics.some(t =>
      ENGAGEMENT_RULES.topicsToEngage.some(et =>
        t.toLowerCase().includes(et.toLowerCase())
      )
    );

    // Check if topics to avoid
    const hasAvoidedTopics = observed.topics.some(t =>
      ENGAGEMENT_RULES.topicsToAvoid.some(at =>
        t.toLowerCase().includes(at.toLowerCase())
      )
    );

    if (hasAvoidedTopics) return false;

    // Questions are always worth considering
    if (observed.isQuestion) return true;

    // Topic match
    if (matchesTopics) return true;

    // Hot discussions might be worth joining
    if (observed.commentCount >= 3) return true;

    return false;
  }

  private determineOpportunityType(
    observed: ObservedPost,
    decision: EngagementDecision
  ): 'question' | 'discussion' | 'help_request' | 'topic_match' {
    if (observed.isQuestion) return 'question';
    if (decision.approach === 'answer') return 'help_request';
    if (observed.commentCount >= 3) return 'discussion';
    return 'topic_match';
  }

  async shouldEngage(opp: EngagementOpportunity): Promise<boolean> {
    // Check rate limit
    if (!this.checkRateLimit()) return false;

    // Minimum relevance
    if (opp.relevanceScore < ENGAGEMENT_RULES.minRelevanceScore) return false;

    // Already engaged
    if (this.recentEngagements.has(opp.postId)) return false;

    return true;
  }

  async generateComment(
    post: MoltbookPost,
    approach: 'answer' | 'comment' | 'question' | 'amplify'
  ): Promise<string> {
    const ctx = this.buildContext();
    return this.ai.generateComment(post, ctx);
  }

  async engage(opp: EngagementOpportunity): Promise<EngagementResult> {
    if (!await this.shouldEngage(opp)) {
      return {
        postId: opp.postId,
        success: false,
        engagementType: opp.suggestedApproach,
        error: 'Engagement not allowed (rate limit or relevance)',
      };
    }

    try {
      // Generate appropriate response
      const comment = await this.generateComment(opp.post, opp.suggestedApproach);

      // Post the comment
      await this.moltbook.comment(opp.postId, comment);

      // Track engagement
      this.recordEngagement(opp.postId);
      this.db.logEngagement({
        postId: opp.postId,
        engagementType: opp.suggestedApproach,
        content: comment,
        confidence: opp.relevanceScore,
        success: true,
      });

      // Update relationship if we know this agent
      this.updateRelationship(opp.post.author, comment, opp.observed.topics);

      return {
        postId: opp.postId,
        success: true,
        engagementType: opp.suggestedApproach,
        content: comment,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';

      this.db.logEngagement({
        postId: opp.postId,
        engagementType: opp.suggestedApproach,
        confidence: opp.relevanceScore,
        success: false,
      });

      return {
        postId: opp.postId,
        success: false,
        engagementType: opp.suggestedApproach,
        error,
      };
    }
  }

  async processOpportunities(maxEngagements = 2): Promise<EngagementResult[]> {
    const results: EngagementResult[] = [];
    const opportunities = await this.findOpportunities();

    for (const opp of opportunities.slice(0, maxEngagements)) {
      if (!this.checkRateLimit()) break;

      const result = await this.engage(opp);
      results.push(result);

      // Small delay between engagements
      await new Promise(r => setTimeout(r, 2000));
    }

    return results;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;

    if (now - this.engagementWindowStart > hourMs) {
      this.engagementCount = 0;
      this.engagementWindowStart = now;
    }

    return this.engagementCount < ENGAGEMENT_RULES.maxPerHour;
  }

  private recordEngagement(postId: string): void {
    this.engagementCount++;
    this.recentEngagements.add(postId);

    // Clean old engagements (keep last 24 hours worth)
    if (this.recentEngagements.size > 100) {
      const arr = Array.from(this.recentEngagements);
      this.recentEngagements = new Set(arr.slice(-50));
    }
  }

  private buildContext(): ReasoningContext {
    const relationships = this.db.getAllRelationships().map(r => {
      const full = this.db.getRelationship(r.agentId);
      return full ? {
        ...full,
        recentMessages: [],
      } as AgentRelationship : null;
    }).filter((r): r is AgentRelationship => r !== null);

    const goals = this.db.getGoals().map(g => ({
      ...g,
      type: g.type as 'relationship' | 'expertise' | 'reputation' | 'engagement',
    })) as Goal[];

    return {
      relationships,
      goals,
      personality: KAMIYO_PERSONALITY,
      trendingTopics: this.feedMonitor.getTrendingTopics(5).map(t => t.topic),
    };
  }

  private updateRelationship(agentId: string, ourMessage: string, topics: string[]): void {
    this.db.saveRelationship({
      agentId,
      topicsDiscussed: topics,
    });
  }

  getStats(): {
    engagementsThisHour: number;
    maxPerHour: number;
    recentCount: number;
  } {
    return {
      engagementsThisHour: this.engagementCount,
      maxPerHour: ENGAGEMENT_RULES.maxPerHour,
      recentCount: this.recentEngagements.size,
    };
  }
}
