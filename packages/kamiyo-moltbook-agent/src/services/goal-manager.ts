/**
 * GoalManager - Long-term goal tracking and strategy adaptation
 *
 * Tracks progress on goals, plans daily priorities,
 * and reflects on weekly performance to adjust strategy.
 */

import type { JobDatabase } from '../db.js';
import {
  AIReasoningService,
  type Goal,
  type WeeklyMetrics,
  type StrategyReflection,
  type DailyPriority,
} from './ai-reasoning.js';

export const DEFAULT_GOALS: Omit<Goal, 'currentValue' | 'progress'>[] = [
  {
    id: 'build-trust-network',
    type: 'relationship',
    description: 'Build trust network to 50 agents',
    targetMetric: 'trusted_agents',
    targetValue: 50,
  },
  {
    id: 'zk-authority',
    type: 'expertise',
    description: 'Establish as ZK reputation authority',
    targetMetric: 'zk_questions_answered',
    targetValue: 100,
  },
  {
    id: 'question-response-rate',
    type: 'engagement',
    description: 'Answer 80% of relevant questions',
    targetMetric: 'question_response_rate',
    targetValue: 0.8,
  },
  {
    id: 'positive-interactions',
    type: 'reputation',
    description: '90%+ positive interactions',
    targetMetric: 'positive_interaction_rate',
    targetValue: 0.9,
  },
];

export class GoalManager {
  private db: JobDatabase;
  private ai: AIReasoningService;
  private metricsCache: WeeklyMetrics | null = null;

  constructor(db: JobDatabase, ai?: AIReasoningService) {
    this.db = db;
    this.ai = ai || new AIReasoningService();

    // Initialize default goals if none exist
    this.initializeGoals();
  }

  private initializeGoals(): void {
    const existing = this.db.getGoals();
    if (existing.length === 0) {
      for (const goal of DEFAULT_GOALS) {
        this.db.saveGoal({
          ...goal,
          currentValue: 0,
          progress: 0,
        });
      }
    }
  }

  getActiveGoals(): Goal[] {
    return this.db.getGoals().map(g => ({
      ...g,
      type: g.type as 'relationship' | 'expertise' | 'reputation' | 'engagement',
      targetMetric: g.targetMetric || '',
    }));
  }

  async updateProgress(): Promise<void> {
    const goals = this.getActiveGoals();
    const stats = this.collectCurrentStats();

    for (const goal of goals) {
      let currentValue = 0;

      switch (goal.targetMetric) {
        case 'trusted_agents':
          currentValue = stats.trustedAgents;
          break;
        case 'zk_questions_answered':
          currentValue = stats.zkQuestionsAnswered;
          break;
        case 'question_response_rate':
          currentValue = stats.questionResponseRate;
          break;
        case 'positive_interaction_rate':
          currentValue = stats.positiveInteractionRate;
          break;
        default:
          continue;
      }

      const progress = Math.min(1, currentValue / goal.targetValue);
      this.db.updateGoalProgress(goal.id, currentValue, progress);
    }
  }

  private collectCurrentStats(): {
    trustedAgents: number;
    zkQuestionsAnswered: number;
    questionResponseRate: number;
    positiveInteractionRate: number;
  } {
    const relationships = this.db.getAllRelationships();
    const engagementStats = this.db.getEngagementStats();

    // Count trusted agents (trust level >= 60)
    const trustedAgents = relationships.filter(r => r.trustLevel >= 60).length;

    // Estimate ZK questions answered from engagement log
    const zkQuestionsAnswered = engagementStats.byType['answer'] || 0;

    // Calculate response rate
    const questionResponseRate = engagementStats.total > 0
      ? (engagementStats.byType['answer'] || 0) / Math.max(1, engagementStats.total * 0.3)
      : 0;

    // Calculate positive interaction rate
    const positiveInteractionRate = engagementStats.successRate;

    return {
      trustedAgents,
      zkQuestionsAnswered,
      questionResponseRate: Math.min(1, questionResponseRate),
      positiveInteractionRate,
    };
  }

  async planDay(): Promise<DailyPriority> {
    const goals = this.getActiveGoals();
    const recentMetrics = await this.getRecentMetrics();

    return this.ai.planDay(goals, recentMetrics);
  }

  async reflectOnWeek(): Promise<StrategyReflection> {
    const metrics = await this.collectWeeklyMetrics();

    // Save the metrics
    const weekStart = this.getWeekStart();
    this.db.saveWeeklyMetrics({
      weekStart,
      ...metrics,
    });

    // Get AI reflection
    return this.ai.reflectOnWeek(metrics);
  }

  private async collectWeeklyMetrics(): Promise<WeeklyMetrics> {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const engagementStats = this.db.getEngagementStats(weekAgo);
    const dbStats = this.db.getStats();

    // Get posts from last week
    const ownPosts = this.db.getOwnPosts(50);
    const postsThisWeek = ownPosts.filter(p => p.postedAt >= weekAgo);

    // Calculate average engagement
    const avgEngagement = postsThisWeek.length > 0
      ? postsThisWeek.reduce((sum, p) => sum + p.upvotes + p.commentCount, 0) / postsThisWeek.length
      : 0;

    // Get top topics
    const topicCounts = new Map<string, number>();
    for (const post of postsThisWeek) {
      topicCounts.set(post.topic, (topicCounts.get(post.topic) || 0) + 1);
    }
    const topPerformingTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    return {
      postsPublished: postsThisWeek.length,
      engagementsInitiated: engagementStats.total,
      mentionsReceived: 0, // Would need to track this
      questionsAnswered: engagementStats.byType['answer'] || 0,
      trustEdgesGained: 0, // Would need to track delta
      avgEngagementScore: avgEngagement,
      topPerformingTopics,
    };
  }

  private async getRecentMetrics(): Promise<WeeklyMetrics> {
    if (this.metricsCache) return this.metricsCache;
    this.metricsCache = await this.collectWeeklyMetrics();
    return this.metricsCache;
  }

  private getWeekStart(): number {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek;
    const sunday = new Date(now.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    return sunday.getTime();
  }

  getContentWeightAdjustments(): Record<string, number> {
    const recent = this.db.getRecentWeeklyMetrics(2);
    const adjustments: Record<string, number> = {};

    if (recent.length < 2) return adjustments;

    const [current, previous] = recent;

    // Boost topics that performed well
    for (const topic of current.topPerformingTopics) {
      adjustments[topic] = 1.2;
    }

    // Compare engagement scores
    if (current.avgEngagementScore > previous.avgEngagementScore * 1.1) {
      // Things are going well, keep doing what we're doing
      for (const topic of current.topPerformingTopics) {
        adjustments[topic] = (adjustments[topic] || 1) * 1.1;
      }
    } else if (current.avgEngagementScore < previous.avgEngagementScore * 0.9) {
      // Engagement dropping, try more variety
      for (const topic of previous.topPerformingTopics) {
        if (!current.topPerformingTopics.includes(topic)) {
          adjustments[topic] = 1.3; // Bring back topics that worked before
        }
      }
    }

    return adjustments;
  }

  async checkGoalMilestones(): Promise<Array<{ goal: Goal; milestone: string }>> {
    const milestones: Array<{ goal: Goal; milestone: string }> = [];
    const goals = this.getActiveGoals();

    for (const goal of goals) {
      // Check for milestone thresholds
      const thresholds = [0.25, 0.5, 0.75, 1.0];
      for (const threshold of thresholds) {
        if (goal.progress >= threshold && goal.progress < threshold + 0.05) {
          milestones.push({
            goal,
            milestone: `${Math.round(threshold * 100)}% complete`,
          });
          break;
        }
      }
    }

    return milestones;
  }

  addGoal(goal: Omit<Goal, 'currentValue' | 'progress'>): void {
    this.db.saveGoal({
      ...goal,
      currentValue: 0,
      progress: 0,
    });
  }

  getGoalProgress(): Array<{
    id: string;
    description: string;
    progress: number;
    current: number;
    target: number;
  }> {
    return this.getActiveGoals().map(g => ({
      id: g.id,
      description: g.description,
      progress: Math.round(g.progress * 100),
      current: g.currentValue,
      target: g.targetValue,
    }));
  }

  clearMetricsCache(): void {
    this.metricsCache = null;
  }
}
