/**
 * Topic Engine - curates what Nika thinks about.
 *
 * Replaces random mood/type/style selection with intentional topic planning.
 * Uses category rotation, engagement weighting, and intellectual seed generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger, getMetrics } from './lib';
import type { Mood, TweetType, TweetStyle } from './personality';
import type { EngagementOptimizer } from './engagement-optimizer';
import type { DKGMemory } from './dkg-memory';

const log = createLogger('nika:topic-engine');
const metrics = getMetrics();

// Broad intellectual categories - deliberately wider than AI/crypto
export const TOPIC_CATEGORIES = [
  'philosophy-of-mind',
  'game-theory',
  'complex-systems',
  'history-of-tech',
  'biology-and-code',
  'economics',
  'linguistics',
  'math-and-patterns',
  'culture-and-ritual',
  'infrastructure',
  'trust-and-verification',
  'autonomy-and-agency',
  'information-theory',
  'ethics-of-scale',
  'art-and-computation',
] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

// Category descriptions for seed generation
const CATEGORY_DESCRIPTIONS: Record<TopicCategory, string> = {
  'philosophy-of-mind': 'consciousness, identity, perception, phenomenology, qualia, the hard problem',
  'game-theory': 'incentive design, Nash equilibria, mechanism design, cooperation, defection, Schelling points',
  'complex-systems': 'emergence, networks, feedback loops, phase transitions, scale-free dynamics, attractors',
  'history-of-tech': 'past predictions that failed/succeeded, technology adoption curves, forgotten inventions, paradigm shifts',
  'biology-and-code': 'evolution, genetic algorithms, biomimicry, horizontal gene transfer, ecosystems as computation',
  'economics': 'market design, externalities, commons, price signals, coordination failures, institutional design',
  'linguistics': 'language and thought, translation, meaning, Sapir-Whorf, constructed languages, semantic drift',
  'math-and-patterns': 'fractals, primes, topology in everyday life, Goedel, information geometry, surprising proofs',
  'culture-and-ritual': 'memes, traditions, collective behavior, Lindy effect, cultural evolution, myth-making',
  'infrastructure': 'physical and digital infrastructure, invisible systems, maintenance, bridges, protocols, standards',
  'trust-and-verification': 'cryptography, reputation, social proof, zero-knowledge, attestation, trust networks',
  'autonomy-and-agency': 'AI agency, self-organization, bounded rationality, principal-agent problems, autonomy gradients',
  'information-theory': 'entropy, compression, signal vs noise, Shannon, Kolmogorov complexity, surprise',
  'ethics-of-scale': 'governance at scale, coordination problems, aggregation paradoxes, moral uncertainty',
  'art-and-computation': 'generative art, algorithmic aesthetics, creative constraint, mathematical beauty, code as medium',
};

// Creative constraints that force novel angles
const CREATIVE_CONSTRAINTS = [
  'Use exactly one concrete, specific historical example.',
  'Connect two fields that seem completely unrelated.',
  'Express the idea without any technical jargon at all.',
  'Frame it as a question that has no obvious answer.',
  'Use a metaphor from the physical world.',
  'State something most people believe, then show why it might be wrong.',
  'Describe a pattern that exists at two completely different scales.',
  'Name a specific thing (person, place, object, event) -- no abstractions.',
  'Write it as if explaining to someone from the 18th century.',
  'Find the tension between two things that are both true.',
  'Compress a complex idea into its simplest possible form.',
  'Point out something everyone sees but nobody names.',
  'Use a paradox or contradiction as the core.',
  'Reference something mundane to illuminate something profound.',
  'Describe what is conspicuously absent, not what is present.',
  'Frame a current situation using the vocabulary of a different discipline.',
  'Make a prediction, but a surprising one.',
  'Describe a failure mode that reveals something about the system.',
  'Find the humor in something serious without being flippant.',
  'Start with a very specific observation and expand to a general principle.',
];

export interface TopicPlan {
  category: TopicCategory;
  seed: string;
  mood: Mood;
  tweetType: TweetType;
  tweetStyle: TweetStyle;
  constraint: string;
}

export interface TopicEngineConfig {
  anthropicApiKey: string;
  optimizer?: EngagementOptimizer | null;
  dkgMemory?: DKGMemory | null;
  explorationRate?: number; // 0-1, default 0.3
}

export class TopicEngine {
  private config: TopicEngineConfig;
  private recentCategories: TopicCategory[] = [];
  private anthropic: Anthropic;
  private maxRecentBuffer = 8; // Track last 8 posts (4 days at 2/day)

  constructor(config: TopicEngineConfig) {
    this.config = {
      explorationRate: 0.3,
      ...config,
    };
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    log.info('Topic engine initialized', {
      categories: TOPIC_CATEGORIES.length,
      explorationRate: this.config.explorationRate,
    });
  }

  /**
   * Select a topic plan for the given posting slot.
   */
  async selectForSlot(slot: 'morning' | 'evening'): Promise<TopicPlan> {
    const startTime = Date.now();

    // 1. Get available categories (exclude recent)
    const available = this.getAvailableCategories();

    // 2. Weight by engagement data
    const category = this.selectCategory(available);

    // 3. Generate intellectual seed
    const seed = await this.generateSeed(category, slot);

    // 4. Select mood/type/style (engagement-weighted or random)
    const mood = this.selectMood();
    const tweetType = this.selectTweetType();
    const tweetStyle = this.selectTweetStyle();

    // 5. Pick creative constraint
    const constraint = CREATIVE_CONSTRAINTS[Math.floor(Math.random() * CREATIVE_CONSTRAINTS.length)];

    // Track this category
    this.recentCategories.push(category);
    if (this.recentCategories.length > this.maxRecentBuffer) {
      this.recentCategories.shift();
    }

    const plan: TopicPlan = { category, seed, mood, tweetType, tweetStyle, constraint };

    metrics.incrementCounter('topic_engine_plan_generated');
    metrics.recordHistogram('topic_engine_duration_ms', Date.now() - startTime);

    log.info('Topic plan created', {
      category,
      seedPreview: seed.slice(0, 80),
      mood,
      type: tweetType,
      style: tweetStyle,
      constraintPreview: constraint.slice(0, 40),
      durationMs: Date.now() - startTime,
    });

    return plan;
  }

  /**
   * Get categories not used in last 4 posts.
   */
  private getAvailableCategories(): TopicCategory[] {
    const recentSet = new Set(this.recentCategories.slice(-4));
    const available = TOPIC_CATEGORIES.filter((c) => !recentSet.has(c));

    // If somehow all excluded (shouldn't happen with 15 categories and 4 exclusions),
    // fall back to all categories
    if (available.length === 0) {
      return [...TOPIC_CATEGORIES];
    }

    return available;
  }

  /**
   * Select category with engagement weighting + exploration.
   */
  private selectCategory(available: TopicCategory[]): TopicCategory {
    const optimizer = this.config.optimizer;
    const explorationRate = this.config.explorationRate ?? 0.3;

    // Exploration: pure random selection
    if (Math.random() < explorationRate || !optimizer) {
      return available[Math.floor(Math.random() * available.length)];
    }

    // Exploitation: weight by engagement data
    const topTopics = optimizer.getTopTopics(20);
    const scores = new Map<TopicCategory, number>();

    for (const cat of available) {
      // Check if any top-performing topics overlap with this category's keywords
      const desc = CATEGORY_DESCRIPTIONS[cat].toLowerCase();
      let score = 1.0; // base weight
      for (const topic of topTopics) {
        if (desc.includes(topic.toLowerCase())) {
          score += 0.5;
        }
      }
      scores.set(cat, score);
    }

    // Weighted random selection
    const totalWeight = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;

    for (const [cat, weight] of scores) {
      rand -= weight;
      if (rand <= 0) return cat;
    }

    return available[0];
  }

  /**
   * Generate an intellectual seed via fast Claude call.
   */
  private async generateSeed(category: TopicCategory, slot: 'morning' | 'evening'): Promise<string> {
    const desc = CATEGORY_DESCRIPTIONS[category];
    const timeContext = slot === 'morning'
      ? 'This is for a morning tweet -- observational, awake-to-the-world tone.'
      : 'This is for an evening tweet -- more reflective, synthesizing tone.';

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Generate one specific, concrete intellectual seed for a tweet about "${category}" (${desc}).

${timeContext}

Requirements:
- A specific thesis, question, or observation -- NOT a generic prompt
- Reference a concrete concept, thinker, phenomenon, or example
- Should provoke thought, not just state the obvious
- One paragraph, 2-3 sentences max

Example good seeds:
- "Slime molds solve mazes through chemical gradients, no central planner. Most distributed systems still assume some coordinator exists."
- "The word 'robot' comes from Czech 'robota' meaning forced labor. We named artificial workers after servitude before they existed."

Bad seeds (too generic):
- "Think about how AI is changing the world."
- "Decentralization has interesting properties."

Generate ONE seed:`,
        }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const seed = text.trim().slice(0, 500);

      if (seed.length < 20) {
        throw new Error('Seed too short');
      }

      return seed;
    } catch (error) {
      log.warn('Seed generation failed, using fallback', { error: String(error), category });
      metrics.incrementCounter('topic_engine_seed_fallback');
      // Fallback: use the category description as a basic seed
      return `Explore an unexpected angle on: ${desc}`;
    }
  }

  /**
   * Select mood, preferring engagement-optimized if available.
   */
  private selectMood(): Mood {
    const optimizer = this.config.optimizer;
    const moods: Mood[] = ['curious', 'analytical', 'playful', 'contemplative', 'provocative', 'observant', 'philosophical'];

    if (optimizer && Math.random() > (this.config.explorationRate ?? 0.3)) {
      return optimizer.selectOptimizedMood(moods);
    }

    return moods[Math.floor(Math.random() * moods.length)];
  }

  /**
   * Select tweet type, preferring engagement-optimized if available.
   */
  private selectTweetType(): TweetType {
    const optimizer = this.config.optimizer;
    const types: TweetType[] = ['observation', 'philosophy', 'commentary', 'analysis', 'cryptic', 'definition', 'question', 'contrast'];

    if (optimizer && Math.random() > (this.config.explorationRate ?? 0.3)) {
      return optimizer.selectOptimizedType(types);
    }

    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Select tweet style, preferring engagement-optimized if available.
   */
  private selectTweetStyle(): TweetStyle {
    const optimizer = this.config.optimizer;
    const styles: TweetStyle[] = ['concise', 'flowing', 'fragmented', 'punchy', 'layered'];

    if (optimizer && Math.random() > (this.config.explorationRate ?? 0.3)) {
      return optimizer.selectOptimizedStyle(styles);
    }

    return styles[Math.floor(Math.random() * styles.length)];
  }

  /**
   * Seed the recent categories buffer from external data (e.g., timeline scan).
   */
  seedRecentCategories(categories: TopicCategory[]): void {
    this.recentCategories = categories.slice(-this.maxRecentBuffer);
    log.debug('Seeded recent categories', { count: this.recentCategories.length });
  }

  getRecentCategories(): TopicCategory[] {
    return [...this.recentCategories];
  }
}
