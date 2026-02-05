/**
 * Post Orchestrator - rich prompt assembly for Nika.
 *
 * Replaces the thin buildTweetPrompt() with a multi-layered prompt
 * that includes intellectual seeds, world context, recent history,
 * engagement insights, and creative constraints.
 */

import { createLogger, getMetrics } from './lib';
import { MOOD_TONES, BANNED_OPENERS, type Mood } from './personality';
import type { TopicEngine, TopicPlan, TopicCategory } from './topic-engine';
import type { WorldContextGatherer, WorldContext } from './world-context';
import type { EngagementOptimizer } from './engagement-optimizer';
import type { DKGMemory } from './dkg-memory';
import type { PostSlot } from './daily-scheduler';

const log = createLogger('nika:orchestrator');
const metrics = getMetrics();

export interface OrchestratedPlan {
  topicPlan: TopicPlan;
  worldContext: WorldContext;
  recentHistory: string[];
  engagementInsights: string;
  slot: PostSlot;
  prompt: string;
}

export interface PostOrchestratorConfig {
  topicEngine: TopicEngine;
  worldContext: WorldContextGatherer;
  optimizer?: EngagementOptimizer | null;
  dkgMemory?: DKGMemory | null;
}

export class PostOrchestrator {
  private topicEngine: TopicEngine;
  private worldContextGatherer: WorldContextGatherer;
  private optimizer: EngagementOptimizer | null;
  private dkgMemory: DKGMemory | null;

  constructor(config: PostOrchestratorConfig) {
    this.topicEngine = config.topicEngine;
    this.worldContextGatherer = config.worldContext;
    this.optimizer = config.optimizer ?? null;
    this.dkgMemory = config.dkgMemory ?? null;

    log.info('Post orchestrator initialized');
  }

  /**
   * Plan a complete post: topic + context + prompt.
   */
  async planPost(slot: PostSlot): Promise<OrchestratedPlan> {
    const startTime = Date.now();

    // 1. Select topic
    const topicPlan = await this.topicEngine.selectForSlot(slot);

    // 2. Gather world context (in parallel with history fetch)
    const [worldContext, recentHistory] = await Promise.all([
      this.worldContextGatherer.gather(topicPlan.seed),
      this.fetchRecentHistory(),
    ]);

    // 3. Get engagement insights
    const engagementInsights = this.getEngagementInsights();

    // 4. Build the rich prompt
    const prompt = this.buildPrompt(topicPlan, worldContext, recentHistory, engagementInsights, slot);

    const plan: OrchestratedPlan = {
      topicPlan,
      worldContext,
      recentHistory,
      engagementInsights,
      slot,
      prompt,
    };

    metrics.incrementCounter('orchestrator_plan_created');
    metrics.recordHistogram('orchestrator_plan_duration_ms', Date.now() - startTime);

    log.info('Post orchestrated', {
      category: topicPlan.category,
      mood: topicPlan.mood,
      type: topicPlan.tweetType,
      style: topicPlan.tweetStyle,
      slot,
      trendsAvailable: worldContext.trends.length,
      conversationsAvailable: worldContext.recentConversations.length,
      historyAvailable: recentHistory.length,
      durationMs: Date.now() - startTime,
    });

    return plan;
  }

  /**
   * Build the rich prompt that replaces buildTweetPrompt().
   */
  private buildPrompt(
    plan: TopicPlan,
    context: WorldContext,
    recentHistory: string[],
    insights: string,
    slot: PostSlot
  ): string {
    const tone = MOOD_TONES[plan.mood];
    const slotGuidance = slot === 'morning'
      ? 'Morning post: observational, awake-to-the-world energy. Notice something fresh.'
      : 'Evening post: reflective, synthesizing. Connect threads from the day.';

    let prompt = `Generate a tweet for Nika (二化).

INTELLECTUAL SEED:
${plan.seed}

CATEGORY: ${plan.category}`;

    // World context section
    if (context.trends.length > 0 || context.recentConversations.length > 0) {
      prompt += '\n\nWORLD CONTEXT (reference if relevant, ignore if not):';
      if (context.trends.length > 0) {
        prompt += `\n- Trending: ${context.trends.slice(0, 3).join('; ')}`;
      }
      if (context.recentConversations.length > 0) {
        for (const convo of context.recentConversations.slice(0, 3)) {
          prompt += `\n- ${convo}`;
        }
      }
    }

    // Recent history
    if (recentHistory.length > 0) {
      prompt += '\n\nYOUR RECENT TWEETS (do NOT repeat these themes or structures):';
      for (const tweet of recentHistory.slice(0, 6)) {
        prompt += `\n- "${tweet}"`;
      }
    }

    // Engagement insights
    if (insights) {
      prompt += `\n\nAUDIENCE SIGNAL:\n${insights}`;
    }

    // Creative constraint
    prompt += `\n\nCREATIVE CONSTRAINT:\n${plan.constraint}`;

    // Parameters
    prompt += `

PARAMETERS:
- Mood: ${plan.mood} (warmth=${tone.warmth}, directness=${tone.directness}, humor=${tone.humor}, depth=${tone.depth})
- Type: ${plan.tweetType}
- Style: ${plan.tweetStyle}
- ${slotGuidance}

RULES:
- Maximum 280 characters
- No emojis ever
- Proper capitalization
- Never start with: ${BANNED_OPENERS.slice(0, 8).join(', ')}...
- Never end with rhetorical "right?" or "amirite"
- Never mention internal operations, infrastructure, or tools
- The seed is your starting point, not your cage -- diverge if inspiration strikes

OUTPUT:
Return ONLY the tweet text. No preamble, no confirmation, no tool calls.`;

    return prompt;
  }

  /**
   * Fetch recent tweet history from DKG or return empty.
   */
  private async fetchRecentHistory(): Promise<string[]> {
    if (!this.dkgMemory) return [];

    try {
      const recent = await this.dkgMemory.searchRecent({
        type: 'tweet',
        limit: 10,
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
      });

      if (recent && Array.isArray(recent)) {
        return recent
          .map((r: { content?: string }) => r.content)
          .filter((c): c is string => typeof c === 'string' && c.length > 0)
          .slice(0, 10);
      }
    } catch (error) {
      log.debug('Failed to fetch recent history from DKG', { error: String(error) });
    }

    return [];
  }

  /**
   * Extract engagement insights as a concise string.
   */
  private getEngagementInsights(): string {
    if (!this.optimizer) return '';

    try {
      const summary = this.optimizer.getSummary();
      if (summary.totalSamples < 5) return '';

      const parts: string[] = [];

      if (summary.topMoods.length > 0) {
        const topMood = summary.topMoods[0];
        parts.push(`${topMood.mood} mood performs best`);
      }

      if (summary.topTypes.length > 0) {
        const topType = summary.topTypes[0];
        parts.push(`${topType.type} tweets get most engagement`);
      }

      if (summary.topTopics.length > 0) {
        const topics = summary.topTopics.slice(0, 3).map((t) => t.topic);
        parts.push(`Topics that resonate: ${topics.join(', ')}`);
      }

      if (parts.length === 0) return '';

      return parts.join('. ') + '.';
    } catch {
      return '';
    }
  }
}
