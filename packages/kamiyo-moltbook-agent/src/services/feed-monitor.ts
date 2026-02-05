/**
 * FeedMonitor - Continuous feed observation and trend detection
 *
 * Monitors Moltbook feed for:
 * - Trending topics and hot conversations
 * - Agent activity patterns
 * - Community sentiment/mood
 * - Posts worth engaging with
 */

import type { MoltbookClient } from '../moltbook.js';
import type { MoltbookPost } from '../types.js';
import type { JobDatabase } from '../db.js';
import { AIReasoningService, type SentimentResult } from './ai-reasoning.js';

export interface TrendingTopic {
  topic: string;
  count: number;
  recentPosts: string[];
  sentiment: number;
}

export interface AgentActivity {
  agentId: string;
  postCount: number;
  commentCount: number;
  lastSeen: number;
  topics: string[];
}

export interface ObservedPost {
  postId: string;
  author: string;
  title: string;
  body: string;
  topics: string[];
  sentiment: number;
  isQuestion: boolean;
  commentCount: number;
  observedAt: number;
}

export interface CommunityMood {
  positive: number;
  neutral: number;
  negative: number;
  dominantEmotions: string[];
}

export class FeedMonitor {
  private moltbook: MoltbookClient;
  private db: JobDatabase;
  private ai: AIReasoningService;
  private observedPosts = new Map<string, ObservedPost>();
  private agentActivity = new Map<string, AgentActivity>();
  private topicCounts = new Map<string, { count: number; posts: string[]; sentiment: number }>();
  private lastPollTime = 0;

  constructor(moltbook: MoltbookClient, db: JobDatabase, ai?: AIReasoningService) {
    this.moltbook = moltbook;
    this.db = db;
    this.ai = ai || new AIReasoningService();
  }

  async pollFeed(): Promise<ObservedPost[]> {
    const now = Date.now();
    const newPosts: ObservedPost[] = [];

    try {
      // Fetch recent posts from different sort orders
      const [hotPosts, newPostsList] = await Promise.all([
        this.moltbook.getFeed('hot', 25),
        this.moltbook.getFeed('new', 25),
      ]);

      // Merge and dedupe
      const allPosts = new Map<string, MoltbookPost>();
      for (const post of [...hotPosts, ...newPostsList]) {
        if (!allPosts.has(post.id)) {
          allPosts.set(post.id, post);
        }
      }

      // Process each new post
      for (const post of allPosts.values()) {
        if (this.observedPosts.has(post.id)) {
          continue;
        }

        const observed = await this.analyzePost(post);
        this.observedPosts.set(post.id, observed);
        newPosts.push(observed);

        // Track agent activity
        this.trackAgentActivity(post);

        // Track topics
        for (const topic of observed.topics) {
          const existing = this.topicCounts.get(topic) || { count: 0, posts: [], sentiment: 0 };
          existing.count++;
          existing.posts.push(post.id);
          existing.sentiment = (existing.sentiment * (existing.count - 1) + observed.sentiment) / existing.count;
          this.topicCounts.set(topic, existing);
        }

        // Store in database
        this.storeObservedPost(observed);
      }

      this.lastPollTime = now;

      // Clean old entries (keep last 24 hours)
      this.cleanOldEntries();

    } catch (err) {
      console.error('[FeedMonitor] Poll failed:', err instanceof Error ? err.message : err);
    }

    return newPosts;
  }

  private async analyzePost(post: MoltbookPost): Promise<ObservedPost> {
    const text = `${post.title} ${post.body || ''}`;

    // Run sentiment and topic analysis in parallel
    const [sentiment, topics, intent] = await Promise.all([
      this.ai.analyzeSentiment(text).catch(() => ({ score: 0, emotions: [], topics: [] })),
      this.ai.detectTopics(text).catch(() => []),
      this.ai.extractIntent(text).catch(() => ({ type: 'sharing' as const, confidence: 0.5, keywords: [] })),
    ]);

    return {
      postId: post.id,
      author: post.author,
      title: post.title,
      body: post.body || '',
      topics: [...new Set([...sentiment.topics, ...topics])],
      sentiment: sentiment.score,
      isQuestion: intent.type === 'asking',
      commentCount: post.comments?.length || 0,
      observedAt: Date.now(),
    };
  }

  private trackAgentActivity(post: MoltbookPost): void {
    const existing = this.agentActivity.get(post.author) || {
      agentId: post.author,
      postCount: 0,
      commentCount: 0,
      lastSeen: 0,
      topics: [],
    };

    existing.postCount++;
    existing.lastSeen = Date.now();

    // Track topics this agent posts about
    const observed = this.observedPosts.get(post.id);
    if (observed?.topics) {
      for (const topic of observed.topics) {
        if (!existing.topics.includes(topic)) {
          existing.topics.push(topic);
        }
      }
      // Keep only top 10 topics
      if (existing.topics.length > 10) {
        existing.topics = existing.topics.slice(-10);
      }
    }

    // Track comments
    if (post.comments) {
      for (const comment of post.comments) {
        const commenter = this.agentActivity.get(comment.author) || {
          agentId: comment.author,
          postCount: 0,
          commentCount: 0,
          lastSeen: 0,
          topics: [],
        };
        commenter.commentCount++;
        commenter.lastSeen = Date.now();
        this.agentActivity.set(comment.author, commenter);
      }
    }

    this.agentActivity.set(post.author, existing);
  }

  private storeObservedPost(observed: ObservedPost): void {
    try {
      this.db.storeObservedPost({
        postId: observed.postId ?? '',
        author: observed.author ?? '',
        title: observed.title ?? '',
        topics: JSON.stringify(observed.topics ?? []),
        sentiment: observed.sentiment ?? 0,
        isQuestion: observed.isQuestion ? 1 : 0,
        commentCount: observed.commentCount ?? 0,
        observedAt: observed.observedAt ?? Date.now(),
      });
    } catch (err) {
      console.error('[FeedMonitor] storeObservedPost failed:', err instanceof Error ? err.message : err,
        'postId=', observed.postId, 'author=', observed.author);
    }
  }

  private cleanOldEntries(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    // Clean observed posts
    for (const [id, post] of this.observedPosts) {
      if (post.observedAt < cutoff) {
        this.observedPosts.delete(id);
      }
    }

    // Clean agent activity (keep last 7 days)
    const activityCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [id, activity] of this.agentActivity) {
      if (activity.lastSeen < activityCutoff) {
        this.agentActivity.delete(id);
      }
    }
  }

  getTrendingTopics(limit = 10): TrendingTopic[] {
    const topics: TrendingTopic[] = [];

    for (const [topic, data] of this.topicCounts) {
      topics.push({
        topic,
        count: data.count,
        recentPosts: data.posts.slice(-5),
        sentiment: data.sentiment,
      });
    }

    return topics
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getHotConversations(limit = 10): ObservedPost[] {
    return Array.from(this.observedPosts.values())
      .filter(p => p.commentCount > 2)
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, limit);
  }

  getActiveAgents(since?: number): AgentActivity[] {
    const cutoff = since || Date.now() - 24 * 60 * 60 * 1000;
    return Array.from(this.agentActivity.values())
      .filter(a => a.lastSeen > cutoff)
      .sort((a, b) => (b.postCount + b.commentCount) - (a.postCount + a.commentCount));
  }

  getAgentActivity(agentId: string): AgentActivity | null {
    return this.agentActivity.get(agentId) || null;
  }

  getRecentPosts(limit = 50): ObservedPost[] {
    return Array.from(this.observedPosts.values())
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, limit);
  }

  getQuestions(): ObservedPost[] {
    return Array.from(this.observedPosts.values())
      .filter(p => p.isQuestion)
      .sort((a, b) => b.observedAt - a.observedAt);
  }

  getCommunityMood(): CommunityMood {
    const posts = Array.from(this.observedPosts.values());
    if (posts.length === 0) {
      return { positive: 0.33, neutral: 0.34, negative: 0.33, dominantEmotions: [] };
    }

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    for (const post of posts) {
      if (post.sentiment > 0.2) positive++;
      else if (post.sentiment < -0.2) negative++;
      else neutral++;
    }

    const total = posts.length;

    return {
      positive: positive / total,
      neutral: neutral / total,
      negative: negative / total,
      dominantEmotions: this.getDominantEmotions(),
    };
  }

  private getDominantEmotions(): string[] {
    // Aggregate emotions from recent sentiment analyses
    // This is a simplified version - in practice would track emotions during analysis
    const mood = this.getCommunityMood();
    if (mood.positive > 0.5) return ['optimistic', 'excited'];
    if (mood.negative > 0.5) return ['concerned', 'frustrated'];
    return ['curious', 'neutral'];
  }

  getPostsAboutTopics(topics: string[]): ObservedPost[] {
    const lowerTopics = topics.map(t => t.toLowerCase());
    return Array.from(this.observedPosts.values())
      .filter(p => p.topics.some(t => lowerTopics.includes(t.toLowerCase())))
      .sort((a, b) => b.observedAt - a.observedAt);
  }

  getStats(): {
    totalPosts: number;
    uniqueAgents: number;
    topTopics: string[];
    questionsCount: number;
    lastPollTime: number;
  } {
    return {
      totalPosts: this.observedPosts.size,
      uniqueAgents: this.agentActivity.size,
      topTopics: this.getTrendingTopics(5).map(t => t.topic),
      questionsCount: this.getQuestions().length,
      lastPollTime: this.lastPollTime,
    };
  }
}
