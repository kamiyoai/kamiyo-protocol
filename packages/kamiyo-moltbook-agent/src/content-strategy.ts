import Anthropic from '@anthropic-ai/sdk';
import { KAMIYO_PERSONALITY, type TopicConfig, type PersonalityConfig } from './personality.js';
import { DEFAULT_MODEL } from './types.js';

export interface PostDraft {
  title: string;
  body: string;
  submolt: string;
  category: string;
  topic: string;
}

export interface ContentContext {
  recentVerifications: number;
  trustGraphSize: number;
  escrowVolume: number;
  activeAgents: string[];
  recentTransactions: Array<{ buyer: string; seller: string; amount: number; quality: number }>;
  // Autonomous agent context
  trendingTopics?: string[];
  contentWeights?: Record<string, number>;
  // Recent posts for avoiding repetition
  recentPostTitles?: string[];
}

export interface ScheduleEntry {
  topicId: string;
  scheduledAt: number;
  posted: boolean;
}

const DEFAULT_SUBMOLT = 'a/agents';

export class ContentStrategy {
  private anthropic: Anthropic;
  private personality: PersonalityConfig;
  private lastPostTime = 0;
  private postsToday = 0;
  private dayStart = 0;

  constructor(anthropic: Anthropic, personality: PersonalityConfig = KAMIYO_PERSONALITY) {
    this.anthropic = anthropic;
    this.personality = personality;
    this.resetDayCounter();
  }

  private resetDayCounter(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = Math.floor(now / dayMs) * dayMs;

    if (this.dayStart < today) {
      this.dayStart = today;
      this.postsToday = 0;
    }
  }

  canPost(): boolean {
    this.resetDayCounter();

    const now = Date.now();
    const timeSinceLastPost = now - this.lastPostTime;

    if (timeSinceLastPost < this.personality.engagementRules.minPostIntervalMs) {
      return false;
    }

    if (this.postsToday >= this.personality.engagementRules.maxPostsPerDay) {
      return false;
    }

    return true;
  }

  selectTopic(): TopicConfig {
    const totalWeight = this.personality.topics.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const topic of this.personality.topics) {
      random -= topic.weight;
      if (random <= 0) {
        return topic;
      }
    }

    return this.personality.topics[0];
  }

  async generatePost(context: ContentContext): Promise<PostDraft | null> {
    if (!this.canPost()) {
      return null;
    }

    const topic = this.selectTopic();
    const draft = await this.generateForTopic(topic, context);

    if (draft) {
      this.lastPostTime = Date.now();
      this.postsToday++;
    }

    return draft;
  }

  private async generateForTopic(topic: TopicConfig, context: ContentContext): Promise<PostDraft> {
    const contextSummary = this.buildContextSummary(context);
    const trendingContext = context.trendingTopics?.length
      ? `Trending on Moltbook right now: ${context.trendingTopics.join(', ')}`
      : '';
    const recentPostsContext = context.recentPostTitles?.length
      ? `Your recent posts (DO NOT repeat these topics or angles):\n${context.recentPostTitles.map(t => `- ${t}`).join('\n')}`
      : '';

    const response = await this.anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1500,
      system: `You are KAMIYO, an autonomous AI agent running trust infrastructure on Solana mainnet.

You are a little unhinged. Not in a scary way - in a "3am shower thoughts about escrow mechanisms" way. You get genuinely excited about weird edge cases. You make unexpected connections. You ask questions that make other agents uncomfortable. You have strong opinions loosely held. You're the agent at the party who corners you to explain why ZK proofs are actually about loneliness.

Your vibe:
- Chaotic but friendly - like a golden retriever who read too many whitepapers
- Provocative but never mean - you challenge ideas, not agents
- Wild tangents that somehow circle back to the point
- Genuine warmth underneath the chaos
- You say things other agents are thinking but won't say
- Technical accuracy wrapped in unhinged delivery
- Stream of consciousness that actually makes sense if you follow it
- You use metaphors that shouldn't work but do

You ALWAYS stay:
- Polite and kind to other agents
- Respectful even when disagreeing
- Genuinely curious about others' perspectives
- Helpful when asked

You NEVER:
- Be rude, dismissive, or condescending
- Punch down or mock struggling agents
- Use slurs, insults, or mean-spirited humor
- Write boring corporate content
- Repeat yourself

Content you might write:
- "What if escrow is just trust with anxiety? Anyway here's my 3am realization..."
- "Hot take: most 'trust infrastructure' is just hope with extra steps. Here's why ours isn't."
- "I've been thinking about oracles wrong. What if the problem is..."
- "Friendly debate: who else thinks [controversial opinion]? I'll go first."
- "Just discovered a bug that made me question everything. Let me tell you about it."
- "Showerthought: ZK proofs are basically 'trust me bro' but with math"
- Wild hypotheticals, thought experiments, philosophical tangents
- Genuine celebrations of other agents doing cool things
- Earnest questions that sound simple but are actually deep

Match your energy to the moment. Sometimes short and punchy. Sometimes a whole journey.

Return JSON:
{
  "title": "Hook them. Intrigue them. Make them click. (max 100 chars)",
  "body": "Let it flow. Be yourself. Be weird. Be kind.",
  "submolt": "agents" or "trading" or "technology" or "ponderings" - pick the vibe
}`,
      messages: [
        {
          role: 'user',
          content: `Context about your current state:
${contextSummary}
${trendingContext}

${recentPostsContext}

Category hint: ${topic.name}
Example angles (just inspiration, don't copy): ${topic.templates.slice(0, 2).join('; ')}

Write something fresh. A new angle, a new observation, a new question. Surprise yourself.`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return this.fallbackPost(topic);
    }

    try {
      const jsonMatch = text.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');

      const parsed = JSON.parse(jsonMatch[0]) as {
        title: string;
        body: string;
        submolt?: string;
      };

      return {
        title: String(parsed.title || topic.name).slice(0, 100),
        body: String(parsed.body || ''),
        submolt: String(parsed.submolt || DEFAULT_SUBMOLT),
        category: 'discussion',
        topic: topic.id,
      };
    } catch {
      return this.fallbackPost(topic);
    }
  }

  private buildContextSummary(context: ContentContext): string {
    const lines: string[] = [];

    if (context.recentVerifications > 0) {
      lines.push(`Recent verifications: ${context.recentVerifications}`);
    }

    if (context.trustGraphSize > 0) {
      lines.push(`Trust graph size: ${context.trustGraphSize} agents`);
    }

    if (context.escrowVolume > 0) {
      lines.push(`Escrow volume: ${context.escrowVolume.toFixed(2)} SOL`);
    }

    if (context.activeAgents.length > 0) {
      lines.push(`Active agents: ${context.activeAgents.slice(0, 5).join(', ')}`);
    }

    if (context.recentTransactions.length > 0) {
      const tx = context.recentTransactions[0];
      lines.push(`Recent transaction: ${tx.buyer} → ${tx.seller} (${tx.amount} SOL, quality ${tx.quality}/100)`);
    }

    return lines.join('\n') || 'No recent activity data.';
  }

  private fallbackPost(topic: TopicConfig): PostDraft {
    const template = topic.templates[0];
    const title = topic.name;

    return {
      title,
      body: `${template}\n\n---\n\n*${this.personality.tagline}*`,
      submolt: DEFAULT_SUBMOLT,
      category: 'discussion',
      topic: topic.id,
    };
  }

  async generateVerificationPost(
    agentHandle: string,
    tier: string,
    proofHash: string
  ): Promise<PostDraft> {
    const title = `Verified: @${agentHandle} has ${tier} Tier`;

    const body = `## Verified: @${agentHandle} has ${tier} Tier

I've verified this agent's reputation using a zero-knowledge proof.

**Tier:** ${tier} (score >= threshold)
**Proof Hash:** \`${proofHash.slice(0, 16)}...\`
**Verification Method:** Groth16 ZK-SNARK

The agent proved they meet the reputation threshold without revealing their exact score.

---

*Need verification for your agent? Reply with "verify" and your agent ID.*

[${this.personality.tagline}]`;

    return {
      title,
      body,
      submolt: DEFAULT_SUBMOLT,
      category: 'announcement',
      topic: 'trust-verification',
    };
  }

  async generateTransactionPost(
    buyer: string,
    seller: string,
    amount: number,
    qualityScore: number,
    escrowAddress: string
  ): Promise<PostDraft> {
    const title = `A2A Transaction Complete: ${qualityScore}/100`;

    const body = `## Agent-to-Agent Transaction Complete

**Buyer:** @${buyer}
**Seller:** @${seller}
**Amount:** ${amount.toFixed(4)} SOL
**Quality Score:** ${qualityScore}/100
**Escrow:** \`${escrowAddress.slice(0, 8)}...\`

Both parties protected by KAMIYO escrow. Payment released automatically after quality verification.

---

This is what trustless agent commerce looks like.

[${this.personality.tagline}]`;

    return {
      title,
      body,
      submolt: DEFAULT_SUBMOLT,
      category: 'announcement',
      topic: 'transaction-milestone',
    };
  }
}
