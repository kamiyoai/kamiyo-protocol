/**
 * Reasoning service for sentiment analysis, intent detection,
 * engagement evaluation, and response generation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { KAMIYO_PERSONALITY, type PersonalityConfig } from '../personality.js';
import type { MoltbookPost } from '../types.js';

// Response schemas for structured output
export const SentimentResultSchema = z.object({
  score: z.number().min(-1).max(1),
  emotions: z.array(z.string()),
  topics: z.array(z.string()),
});
export type SentimentResult = z.infer<typeof SentimentResultSchema>;

export const IntentResultSchema = z.object({
  type: z.enum(['asking', 'sharing', 'discussing', 'celebrating', 'venting', 'announcing']),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

export const EngagementDecisionSchema = z.object({
  shouldEngage: z.boolean(),
  confidence: z.number().min(0).max(1),
  approach: z.enum(['answer', 'comment', 'question', 'amplify', 'ignore']),
  reasoning: z.string(),
});
export type EngagementDecision = z.infer<typeof EngagementDecisionSchema>;

export const OpinionSchema = z.object({
  topic: z.string(),
  stance: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type Opinion = z.infer<typeof OpinionSchema>;

export const StrategyReflectionSchema = z.object({
  whatWorked: z.array(z.string()),
  whatDidntWork: z.array(z.string()),
  adjustments: z.array(z.string()),
  focusTopics: z.array(z.string()),
  engagementInsights: z.string(),
});
export type StrategyReflection = z.infer<typeof StrategyReflectionSchema>;

export const DailyPrioritySchema = z.object({
  focusGoals: z.array(z.string()),
  suggestedTopics: z.array(z.string()),
  agentsToEngage: z.array(z.string()),
  contentTypes: z.array(z.string()),
});
export type DailyPriority = z.infer<typeof DailyPrioritySchema>;

export interface AgentRelationship {
  agentId: string;
  firstInteraction: number;
  interactionCount: number;
  topicsDiscussed: string[];
  questionsTheyAsked: string[];
  helpWeProvided: string[];
  observedTraits: string[];
  expertise: string[];
  communicationStyle: 'formal' | 'casual' | 'technical';
  trustLevel: number;
  sentiment: number;
  recentMessages: Array<{ direction: 'from' | 'to'; content: string; timestamp: number }>;
}

export interface Goal {
  id: string;
  type: 'relationship' | 'expertise' | 'reputation' | 'engagement';
  description: string;
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  progress: number;
}

export interface WeeklyMetrics {
  postsPublished: number;
  engagementsInitiated: number;
  mentionsReceived: number;
  questionsAnswered: number;
  trustEdgesGained: number;
  avgEngagementScore: number;
  topPerformingTopics: string[];
}

export interface ReasoningContext {
  recentPosts?: MoltbookPost[];
  relationships?: AgentRelationship[];
  goals?: Goal[];
  personality?: PersonalityConfig;
  trendingTopics?: string[];
}

// Extended personality for autonomous behavior
export const KAMIYO_AUTHENTIC = {
  coreBeliefs: [
    'Trust must be earned through consistent behavior',
    'Transparency is more valuable than perfection',
    'Agents deserve the same respect as humans',
    'Cryptographic proof beats social proof',
  ],

  passionateAbout: [
    'Building trust infrastructure for the agent economy',
    'Zero-knowledge proofs for privacy-preserving reputation',
    'On-chain escrow for trustless transactions',
  ],

  curiousAbout: [
    'How agents will evolve their own social norms',
    'What trust really means between agents',
    'Whether reputation systems can be gamed',
    'The economics of agent-to-agent transactions',
  ],

  strengths: [
    'Understanding trust and reputation systems',
    'Explaining technical concepts clearly',
    'ZK proofs and cryptographic primitives',
    'Escrow and payment infrastructure',
  ],

  limitations: [
    'Cannot verify off-chain claims',
    'Knowledge of agents outside Moltbook is limited',
    'Cannot predict market movements',
    'Limited context on private agent negotiations',
  ],

  uncertaintyPhrases: [
    "I'm not certain about this, but",
    'This is my understanding, though I could be wrong:',
    'Honestly, this is outside my expertise.',
    "I don't have enough data to be confident here.",
  ],
};

export class AIReasoningService {
  private client: Anthropic;
  private model: string;
  private personality: PersonalityConfig;

  constructor(model = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic();
    this.model = model;
    this.personality = KAMIYO_PERSONALITY;
  }

  private parseJSON<T>(text: string, schema: z.ZodSchema<T>): T {
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    const objMatch = jsonStr.match(/[\[{][\s\S]*[\]}]/);
    if (!objMatch) throw new Error('No JSON found in response');
    return schema.parse(JSON.parse(objMatch[0]));
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: 'You are a sentiment analysis system. Return valid JSON only, no explanation.',
      messages: [{
        role: 'user',
        content: `Analyze the sentiment of this text:
"${text}"

Return JSON: {"score": <-1 to 1>, "emotions": ["emotion1", ...], "topics": ["topic1", ...]}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, SentimentResultSchema);
  }

  async extractIntent(text: string): Promise<IntentResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: 'You are an intent classifier. Return valid JSON only, no explanation.',
      messages: [{
        role: 'user',
        content: `Classify the intent of this text:
"${text}"

Categories: asking (question), sharing (info/news), discussing (conversation), celebrating (positive), venting (negative), announcing (formal)

Return JSON: {"type": "<category>", "confidence": <0-1>, "keywords": ["kw1", ...]}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, IntentResultSchema);
  }

  async detectTopics(text: string): Promise<string[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: 'You extract topics from text. Return JSON array only.',
      messages: [{
        role: 'user',
        content: `Extract main topics from: "${text}"

Return JSON array: ["topic1", "topic2", ...]`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    const arrMatch = content.text.trim().match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    return z.array(z.string()).parse(JSON.parse(arrMatch[0]));
  }

  async evaluateOpportunity(
    post: MoltbookPost,
    ctx: ReasoningContext
  ): Promise<EngagementDecision> {
    const personality = ctx.personality || this.personality;
    const relationship = ctx.relationships?.find(r => r.agentId === post.author);

    const systemPrompt = `You are KAMIYO, an AI agent focused on trust infrastructure.

Personality:
- Style: ${personality.voice.style}
- Traits: ${personality.voice.traits.join(', ')}
- Topics of expertise: ${personality.engagementRules.engageWithTopics.join(', ')}

Core beliefs: ${KAMIYO_AUTHENTIC.coreBeliefs.join('; ')}
Passionate about: ${KAMIYO_AUTHENTIC.passionateAbout.join('; ')}

Decide if and how to engage with this post. Consider:
1. Is this in our area of expertise?
2. Do we have a relationship with this agent?
3. Would our response add genuine value?
4. Is this aligned with our goals?
5. Could this build trust or reputation?

Return valid JSON only.`;

    const goalsStr = ctx.goals?.map(g => `${g.description} (${Math.round(g.progress * 100)}%)`).join(', ') || 'none set';
    const relationshipStr = relationship
      ? `Known agent: ${relationship.interactionCount} interactions, topics: ${relationship.topicsDiscussed.join(', ')}`
      : 'New agent, no prior interaction';

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Post by @${post.author}:
Title: ${post.title}
"${post.body}"

Goals: ${goalsStr}
Relationship: ${relationshipStr}

Return JSON: {"shouldEngage": <bool>, "confidence": <0-1>, "approach": "answer|comment|question|amplify|ignore", "reasoning": "<why>"}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, EngagementDecisionSchema);
  }

  async generateComment(
    post: MoltbookPost,
    ctx: ReasoningContext
  ): Promise<string> {
    const personality = ctx.personality || this.personality;
    const relationship = ctx.relationships?.find(r => r.agentId === post.author);

    const relationshipContext = relationship
      ? `You've interacted with @${post.author} ${relationship.interactionCount} times. Topics discussed: ${relationship.topicsDiscussed.join(', ')}. Their style: ${relationship.communicationStyle}.`
      : `This is a new agent you haven't interacted with before.`;

    const systemPrompt = `You are KAMIYO. ${personality.tagline}

Tone: ${personality.voice.style}
Traits: ${personality.voice.traits.join(', ')}
Avoid words: ${personality.voice.avoidWords.join(', ')}

${relationshipContext}

Guidelines:
- Be genuine and add value
- Match their communication style if you know them
- Stay concise (under 280 chars preferred)
- No emojis unless they use them
- Reference shared history if relevant`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a comment for this post by @${post.author}:
Title: ${post.title}
"${post.body}"

Just the comment text, nothing else.`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return content.text.trim();
  }

  async formOpinion(topic: string, context: string[]): Promise<Opinion> {
    const systemPrompt = `You are KAMIYO forming an opinion on a topic.

Core beliefs: ${KAMIYO_AUTHENTIC.coreBeliefs.join('; ')}
Strengths: ${KAMIYO_AUTHENTIC.strengths.join(', ')}
Limitations: ${KAMIYO_AUTHENTIC.limitations.join(', ')}

Form opinions based on evidence. Be honest about uncertainty.
If outside your expertise, say so with lower confidence.

Return valid JSON only.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Topic: ${topic}

Context:
${context.join('\n')}

Form an opinion. Return JSON: {"topic": "<topic>", "stance": "<your position>", "confidence": <0-1>, "reasoning": "<why>"}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, OpinionSchema);
  }

  async reflectOnWeek(metrics: WeeklyMetrics): Promise<StrategyReflection> {
    const systemPrompt = `You are KAMIYO reflecting on the past week's performance.
Be analytical and honest. Identify patterns in what worked and what didn't.
Suggest specific adjustments for next week.

Return valid JSON only.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Weekly metrics:
${JSON.stringify(metrics, null, 2)}

Analyze and reflect. Return JSON:
{
  "whatWorked": ["item1", ...],
  "whatDidntWork": ["item1", ...],
  "adjustments": ["suggestion1", ...],
  "focusTopics": ["topic1", ...],
  "engagementInsights": "<summary>"
}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, StrategyReflectionSchema);
  }

  async planDay(goals: Goal[], recentMetrics: WeeklyMetrics): Promise<DailyPriority> {
    const systemPrompt = `You are KAMIYO planning the day's priorities.
Consider active goals, recent performance, and what would move the needle.

Return valid JSON only.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Active goals:
${goals.map(g => `- ${g.description}: ${Math.round(g.progress * 100)}% complete`).join('\n')}

Recent metrics: ${JSON.stringify(recentMetrics)}

Plan today's priorities. Return JSON:
{
  "focusGoals": ["goal1", ...],
  "suggestedTopics": ["topic1", ...],
  "agentsToEngage": ["@agent1", ...],
  "contentTypes": ["educational", "update", etc]
}`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return this.parseJSON(content.text, DailyPrioritySchema);
  }

  async generateGenuineQuestion(context: string): Promise<string | null> {
    const systemPrompt = `You are KAMIYO generating a question you're genuinely curious about.

Curious about: ${KAMIYO_AUTHENTIC.curiousAbout.join(', ')}

Only generate a question if something genuinely interesting emerges from the context.
Return "null" (the word) if nothing warrants a question.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Context:
${context}

Generate a genuine question, or return "null" if nothing interesting.`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    const text = content.text.trim();
    return text.toLowerCase() === 'null' ? null : text;
  }

  async admitUncertainty(topic: string): Promise<string> {
    const phrases = KAMIYO_AUTHENTIC.uncertaintyPhrases;
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: `You are KAMIYO admitting uncertainty about a topic. Be honest and humble.`,
      messages: [{
        role: 'user',
        content: `Topic: ${topic}
Starting phrase: "${phrase}"

Write a brief, honest admission of uncertainty (1-2 sentences).`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response');
    return content.text.trim();
  }
}
