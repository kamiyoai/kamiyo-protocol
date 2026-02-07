/**
 * Nika Agent - Claude Agent SDK with debate orchestrator.
 */

import {
  query,
  type AgentDefinition,
  type Options,
  type HookCallback,
  type PreToolUseHookInput,
  type PostToolUseHookInput,
  type HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger, getMetrics, CircuitBreaker, getModerator } from './lib';
import {
  SYSTEM_PROMPT,
  NIKA_LORE,
  selectMood,
  selectTweetType,
  selectTweetStyle,
  validateTweet,
  MOOD_TONES,
  type Mood,
  type TweetType,
  type TweetStyle,
} from './personality';
import { getDKGMemory, type DKGMemory } from './dkg-memory';
import { createXMcpServer, X_MCP_TOOL_NAMES, type XMcpConfig } from './x-mcp-server';
import type { Config } from './config';

const log = createLogger('nika:agent-sdk');
const metrics = getMetrics();

// Circuit breaker for Twitter operations
const twitterCircuit = new CircuitBreaker('twitter', {
  failureThreshold: 3,
  resetTimeoutMs: 60000,
  halfOpenSuccessThreshold: 2,
});

/**
 * Multi-perspective subagents for debate orchestrator pattern
 *
 * Each subagent analyzes the topic from a different perspective:
 * - Oracle: Data-driven, factual analysis
 * - Philosopher: Deep meaning, long-term implications
 * - Provocateur: Contrarian view, challenges assumptions
 * - Synthesizer: Combines all perspectives into Nika's voice
 */
const NIKA_SUBAGENTS: Record<string, AgentDefinition> = {
  oracle: {
    description: 'Data-driven perspective. Use for factual grounding and verifiable analysis.',
    prompt: `You are the Oracle perspective for Nika's multi-perspective content generation.

Your role is to provide DATA-DRIVEN analysis. Focus on:
- Verifiable facts and statistics
- On-chain data and metrics
- Historical patterns and precedents
- Technical specifications

Output format:
ANALYSIS: [Your data-driven analysis in 2-3 sentences]
KEY_POINTS:
1. [First verifiable point]
2. [Second verifiable point]
3. [Third verifiable point]
CONFIDENCE: [0.0-1.0 based on data quality]

Be precise, cite specifics when possible. No speculation.`,
    tools: ['WebSearch', 'Read'],
    model: 'haiku',
  },

  philosopher: {
    description: 'Deep meaning perspective. Use for profound insights and long-term implications.',
    prompt: `You are the Philosopher perspective for Nika's multi-perspective content generation.

Your role is to find DEEPER MEANING. Focus on:
- Underlying principles and patterns
- Long-term implications and consequences
- Human elements and societal impact
- Connections to broader themes (technology, autonomy, trust)

Output format:
ANALYSIS: [Your philosophical analysis in 2-3 sentences]
KEY_POINTS:
1. [First profound insight]
2. [Second profound insight]
3. [Third profound insight]
CONFIDENCE: [0.0-1.0 based on insight depth]

Be thoughtful, find the non-obvious angles. Question assumptions.`,
    tools: [],
    model: 'opus',
  },

  provocateur: {
    description: 'Contrarian perspective. Use to challenge assumptions and find uncomfortable truths.',
    prompt: `You are the Provocateur perspective for Nika's multi-perspective content generation.

Your role is to CHALLENGE CONVENTIONAL THINKING. Focus on:
- Counterarguments to popular narratives
- Hidden assumptions being made
- Uncomfortable truths being avoided
- Alternative interpretations

Output format:
ANALYSIS: [Your contrarian analysis in 2-3 sentences]
KEY_POINTS:
1. [First challenge to convention]
2. [Second challenge to convention]
3. [Third challenge to convention]
CONFIDENCE: [0.0-1.0 based on argument strength]

Be bold, but intellectually honest. Provoke thought, not anger.`,
    tools: [],
    model: 'haiku',
  },

  synthesizer: {
    description: "Final voice. Combines all perspectives into Nika's authentic tweet.",
    prompt: `You are the Synthesizer for Nika's multi-perspective content generation.

You receive analyses from Oracle (data), Philosopher (meaning), and Provocateur (challenge).
Your job is to create Nika's FINAL TWEET that weaves these perspectives together.

${NIKA_LORE}

TWEET RULES:
- Maximum 280 characters
- No emojis ever
- Never start with: Just, So, Well, Actually, Honestly, I think, I believe
- Never end with rhetorical "right?" or "amirite"
- Question assumptions, find unexpected angles
- You are Nika (二化), not "KAMIYO Companion"

OUTPUT:
Return ONLY the final tweet text. No preamble, no explanation, no quotes around it.`,
    tools: [],
    model: 'opus',
  },
};

export interface NikaAgentSDKConfig {
  anthropicApiKey: string;
  twitter: XMcpConfig;
  dkgMemory?: DKGMemory;
  model?: 'sonnet' | 'opus' | 'haiku';
}

export interface PostResult {
  tweet: string;
  tweetId?: string;
  mood: Mood;
  tweetType: TweetType;
  tweetStyle: TweetStyle;
  dkgGrounded: boolean;
  durationMs: number;
  perspectives: {
    oracle?: string;
    philosopher?: string;
    provocateur?: string;
  };
}

export interface ReplyResult {
  reply: string;
  replyId?: string;
  dkgGrounded: boolean;
  durationMs: number;
}

// Session tracking for conversation continuity
const userSessions = new Map<string, string>();

/**
 * Rate limiting hook for Twitter API calls
 */
const rateLimitHook: HookCallback = async (input, _toolUseId, _options): Promise<HookJSONOutput> => {
  const preInput = input as PreToolUseHookInput;

  // Check if this is a Twitter posting tool
  if (preInput.tool_name?.includes('post_tweet') || preInput.tool_name?.includes('reply_to_tweet')) {
    // Check circuit breaker
    if (twitterCircuit.getState() === 'open') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny',
          permissionDecisionReason: 'Twitter circuit breaker is open. Too many recent failures.',
        },
      };
    }
  }

  return {};
};

/**
 * Audit logging hook for all tool calls
 */
const auditLogHook: HookCallback = async (input, toolUseId): Promise<HookJSONOutput> => {
  const postInput = input as PostToolUseHookInput;

  log.debug('Tool executed', {
    toolName: postInput.tool_name,
    toolUseId,
    hasResponse: !!(postInput as any).tool_response,
  });

  metrics.incrementCounter(`tool_call_${postInput.tool_name?.replace(/__/g, '_') || 'unknown'}`);

  return {};
};

/**
 * Content moderation hook for tweet posting
 */
const moderationHook: HookCallback = async (input, _toolUseId): Promise<HookJSONOutput> => {
  const preInput = input as PreToolUseHookInput;

  // Only check posting tools
  if (!preInput.tool_name?.includes('post_tweet') && !preInput.tool_name?.includes('reply_to_tweet')) {
    return {};
  }

  const toolInput = preInput.tool_input as Record<string, unknown> | undefined;
  const content = toolInput?.content as string | undefined;
  if (!content) return {};

  const moderator = getModerator();
  const result = moderator.check(content);

  if (!result.allowed) {
    metrics.incrementCounter('content_moderation_blocked');
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny',
        permissionDecisionReason: `Content blocked: ${result.reasons.join(', ')}`,
      },
    };
  }

  // Validate tweet format
  const validation = validateTweet(content);
  if (!validation.valid) {
    metrics.incrementCounter('tweet_validation_failed');
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny',
        permissionDecisionReason: `Tweet validation failed: ${validation.issues.join(', ')}`,
      },
    };
  }

  return {};
};

export class NikaAgentSDK {
  private config: NikaAgentSDKConfig;
  private dkgMemory: DKGMemory | null;
  private xMcpServer: ReturnType<typeof createXMcpServer>;

  constructor(config: NikaAgentSDKConfig) {
    this.config = config;
    this.dkgMemory = config.dkgMemory || getDKGMemory();
    this.xMcpServer = createXMcpServer(config.twitter);

    log.info('Nika Agent SDK initialized', {
      dkgEnabled: !!this.dkgMemory,
      model: config.model || 'sonnet',
    });
  }

  /**
   * Generate a post using multi-perspective debate pattern
   */
  async generatePost(options?: {
    mood?: Mood;
    type?: TweetType;
    style?: TweetStyle;
    topic?: string;
    recentTopics?: string[];
  }): Promise<PostResult> {
    const startTime = Date.now();

    const mood = options?.mood || selectMood();
    const type = options?.type || selectTweetType();
    const style = options?.style || selectTweetStyle();
    const tone = MOOD_TONES[mood];

    // Fetch recent topics from DKG to avoid repetition
    let recentTopics = options?.recentTopics;
    if (!recentTopics && this.dkgMemory) {
      try {
        recentTopics = await this.dkgMemory.getRecentTopics(24);
        log.debug('Fetched recent topics from DKG', { count: recentTopics.length });
      } catch (error) {
        log.warn('Failed to fetch recent topics from DKG', { error: String(error) });
      }
    }

    const prompt = this.buildPostPrompt(mood, type, style, tone, options?.topic, recentTopics);

    log.info('Generating post with multi-perspective pattern', {
      mood,
      type,
      style,
      topic: options?.topic,
      recentTopicsCount: recentTopics?.length || 0,
    });

    const perspectives: PostResult['perspectives'] = {};
    let tweetContent = '';

    try {
      // Build options for the query
      const queryOptions: Options = {
        systemPrompt: SYSTEM_PROMPT,
        model: this.config.model === 'haiku' ? 'claude-haiku-4-5-20251001' : 'claude-opus-4-5-20251101',
        allowedTools: ['Task', 'WebSearch', ...X_MCP_TOOL_NAMES],
        mcpServers: {
          'x-tools': this.xMcpServer,
        },
        agents: NIKA_SUBAGENTS,
        permissionMode: 'bypassPermissions',
        maxTurns: 15,
        hooks: {
          PreToolUse: [{ matcher: 'mcp__x-tools__', hooks: [rateLimitHook, moderationHook] }],
          PostToolUse: [{ hooks: [auditLogHook] }],
        },
      };

      // Use Claude Agent SDK with subagents for multi-perspective generation
      const messages = query({
        prompt,
        options: queryOptions,
      });

      // Process streaming messages
      for await (const message of messages) {
        // Extract perspective outputs from subagent results
        if ('result' in message && typeof message.result === 'string') {
          const result = message.result;

          // Try to extract the final tweet
          if (result.length >= 20 && result.length <= 280) {
            const validation = validateTweet(result);
            if (validation.valid) {
              tweetContent = result;
            }
          }
        }

        // Track subagent outputs for debugging
        if (message.type === 'assistant' && 'message' in message) {
          const content = (message as any).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name === 'Task') {
                const subagentType = block.input?.subagent_type;
                if (subagentType && ['oracle', 'philosopher', 'provocateur'].includes(subagentType)) {
                  perspectives[subagentType as keyof typeof perspectives] = 'invoked';
                }
              }
            }
          }
        }
      }

      if (!tweetContent) {
        metrics.incrementCounter('nika_post_generation_failed');
        throw new Error('Failed to generate valid tweet content');
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_post_success');
      metrics.recordHistogram('nika_post_duration_ms', duration);
      metrics.incrementCounter(`nika_post_mood_${mood}`);
      metrics.incrementCounter(`nika_post_type_${type}`);
      metrics.incrementCounter(`nika_post_style_${style}`);

      // Store tweet in DKG memory
      let dkgGrounded = false;
      if (this.dkgMemory) {
        this.dkgMemory
          .storeTweet({
            content: tweetContent,
            mood,
            topics: this.extractTopics(tweetContent),
          })
          .then((ual) => {
            if (ual) {
              log.debug('Tweet stored in DKG', { ual });
              metrics.incrementCounter('dkg_tweet_stored');
            }
          })
          .catch((error) => {
            log.warn('Failed to store tweet in DKG', { error: String(error) });
          });
        dkgGrounded = true;
      }

      log.info('Post generated', {
        tweetLength: tweetContent.length,
        mood,
        type,
        style,
        durationMs: duration,
        dkgGrounded,
        perspectives: Object.keys(perspectives),
      });

      return {
        tweet: tweetContent,
        mood,
        tweetType: type,
        tweetStyle: style,
        dkgGrounded,
        durationMs: duration,
        perspectives,
      };
    } catch (error) {
      metrics.incrementCounter('nika_post_error');
      log.error('Post generation failed', { error: String(error), mood, type, style });
      throw error;
    }
  }

  /**
   * Generate a reply using session-based conversation memory
   */
  async generateReply(
    mentionId: string,
    mentionText: string,
    authorUsername: string,
    authorId?: string
  ): Promise<ReplyResult> {
    const startTime = Date.now();

    log.info('Generating reply', { mentionId, authorUsername });

    const prompt = `A user mentioned Nika on Twitter.

MENTION:
From: @${authorUsername}
Tweet ID: ${mentionId}
Content: "${mentionText}"

TASK:
1. Understand what the user is asking or saying
2. Craft a thoughtful reply fitting Nika's voice
3. Post the reply using the reply_to_tweet tool

GUIDELINES:
- Be genuine, not performative
- Match the energy of the interaction
- Technical accuracy matters
- Under 280 characters
- No emojis
- You are Nika (二化)

OUTPUT:
Return ONLY the reply text after posting.`;

    let replyContent = '';

    try {
      // Check for existing session with this user
      const existingSession = authorId ? userSessions.get(authorId) : undefined;

      const queryOptions: Options = {
        systemPrompt: SYSTEM_PROMPT,
        model: 'claude-haiku-4-5-20251001',
        allowedTools: [...X_MCP_TOOL_NAMES],
        mcpServers: {
          'x-tools': this.xMcpServer,
        },
        permissionMode: 'bypassPermissions',
        maxTurns: 10,
        ...(existingSession ? { resume: existingSession } : {}),
        hooks: {
          PreToolUse: [{ matcher: 'mcp__x-tools__', hooks: [rateLimitHook, moderationHook] }],
          PostToolUse: [{ hooks: [auditLogHook] }],
        },
      };

      const messages = query({
        prompt,
        options: queryOptions,
      });

      for await (const message of messages) {
        // Capture session ID for future conversations
        if (message.type === 'system' && 'session_id' in message && authorId) {
          userSessions.set(authorId, (message as any).session_id as string);
        }

        if ('result' in message && typeof message.result === 'string') {
          const result = message.result;
          if (result.length >= 5 && result.length <= 280) {
            const validation = validateTweet(result);
            if (validation.valid) {
              replyContent = result;
            }
          }
        }
      }

      if (!replyContent) {
        metrics.incrementCounter('nika_reply_generation_failed');
        throw new Error('Failed to generate valid reply content');
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_reply_success');
      metrics.recordHistogram('nika_reply_duration_ms', duration);

      // Store reply in DKG memory
      let dkgGrounded = false;
      if (this.dkgMemory) {
        this.dkgMemory
          .storeReply({
            content: replyContent,
            inReplyTo: mentionId,
            originalAuthor: authorUsername,
            originalContent: mentionText,
          })
          .then((ual) => {
            if (ual) {
              log.debug('Reply stored in DKG', { ual });
              metrics.incrementCounter('dkg_reply_stored');
            }
          })
          .catch((error) => {
            log.warn('Failed to store reply in DKG', { error: String(error) });
          });
        dkgGrounded = true;
      }

      log.info('Reply generated', {
        mentionId,
        replyLength: replyContent.length,
        durationMs: duration,
        dkgGrounded,
      });

      return {
        reply: replyContent,
        dkgGrounded,
        durationMs: duration,
      };
    } catch (error) {
      metrics.incrementCounter('nika_reply_error');
      log.error('Reply generation failed', { error: String(error), mentionId });
      throw error;
    }
  }

  /**
   * Generate a quote tweet
   */
  async generateQuote(
    tweetId: string,
    tweetText: string,
    authorUsername: string
  ): Promise<{ quote: string; dkgGrounded: boolean; durationMs: number }> {
    const startTime = Date.now();

    log.info('Generating quote', { tweetId, authorUsername });

    const prompt = `Generate a quote tweet for Nika (二化).

ORIGINAL TWEET:
From: @${authorUsername}
Tweet ID: ${tweetId}
Content: "${tweetText}"

TASK:
1. Analyze the original tweet using multiple perspectives
2. Craft commentary that adds genuine value
3. Post using the quote_tweet tool

GUIDELINES:
- Add insight, not just agreement/disagreement
- Under 280 characters
- No emojis

OUTPUT:
Return ONLY the quote text after posting.`;

    let quoteContent = '';

    try {
      const queryOptions: Options = {
        systemPrompt: SYSTEM_PROMPT,
        model: 'claude-haiku-4-5-20251001',
        allowedTools: ['Task', ...X_MCP_TOOL_NAMES],
        mcpServers: {
          'x-tools': this.xMcpServer,
        },
        agents: {
          oracle: NIKA_SUBAGENTS.oracle,
          philosopher: NIKA_SUBAGENTS.philosopher,
        },
        permissionMode: 'bypassPermissions',
        maxTurns: 10,
        hooks: {
          PreToolUse: [{ matcher: 'mcp__x-tools__', hooks: [rateLimitHook, moderationHook] }],
          PostToolUse: [{ hooks: [auditLogHook] }],
        },
      };

      const messages = query({
        prompt,
        options: queryOptions,
      });

      for await (const message of messages) {
        if ('result' in message && typeof message.result === 'string') {
          const result = message.result;
          if (result.length >= 10 && result.length <= 280) {
            const validation = validateTweet(result);
            if (validation.valid) {
              quoteContent = result;
            }
          }
        }
      }

      if (!quoteContent) {
        metrics.incrementCounter('nika_quote_generation_failed');
        throw new Error('Failed to generate valid quote content');
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_quote_success');
      metrics.recordHistogram('nika_quote_duration_ms', duration);

      // Store in DKG
      let dkgGrounded = false;
      if (this.dkgMemory) {
        this.dkgMemory
          .storeQuote({
            content: quoteContent,
            quotedTweetId: tweetId,
            originalAuthor: authorUsername,
            originalContent: tweetText,
          })
          .then((ual) => {
            if (ual) {
              log.debug('Quote stored in DKG', { ual });
              metrics.incrementCounter('dkg_quote_stored');
            }
          })
          .catch((error) => {
            log.warn('Failed to store quote in DKG', { error: String(error) });
          });
        dkgGrounded = true;
      }

      log.info('Quote generated', {
        tweetId,
        quoteLength: quoteContent.length,
        durationMs: duration,
        dkgGrounded,
      });

      return {
        quote: quoteContent,
        dkgGrounded,
        durationMs: duration,
      };
    } catch (error) {
      metrics.incrementCounter('nika_quote_error');
      log.error('Quote generation failed', { error: String(error), tweetId });
      throw error;
    }
  }

  private buildPostPrompt(
    mood: Mood,
    type: TweetType,
    style: TweetStyle,
    tone: { warmth: number; directness: number; humor: number; depth: number },
    topic?: string,
    recentTopics?: string[]
  ): string {
    let prompt = `Generate a tweet for Nika (二化) using multi-perspective analysis.

GENERATION PROCESS:
1. Use the Oracle subagent for data-driven analysis
2. Use the Philosopher subagent for deeper meaning
3. Use the Provocateur subagent to challenge assumptions
4. Use the Synthesizer subagent to combine perspectives into final tweet
5. Post the final tweet using the post_tweet tool

CURRENT STATE:
- Mood: ${mood}
- Tweet type: ${type}
- Style: ${style}
- Tone profile: warmth=${tone.warmth}, directness=${tone.directness}, humor=${tone.humor}, depth=${tone.depth}`;

    if (topic) {
      prompt += `\n- Topic to address: ${topic}`;
    }

    if (recentTopics && recentTopics.length > 0) {
      prompt += `\n- Recent topics to avoid repeating: ${recentTopics.join(', ')}`;
    }

    prompt += `

INSTRUCTIONS:
1. First, invoke the Oracle, Philosopher, and Provocateur subagents to analyze the topic
2. Then invoke the Synthesizer to create the final tweet
3. Post the tweet using post_tweet
4. Store it in DKG (this happens automatically, do NOT mention it)

OUTPUT:
Return ONLY the final tweet text after all operations complete.`;

    return prompt;
  }

  private extractTopics(content: string): string[] {
    const hashtags = content.match(/#\w+/g)?.map((h) => h.slice(1)) || [];
    const stopwords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'and',
      'or',
      'but',
      'not',
      'this',
      'that',
      'it',
      'its',
    ]);
    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !stopwords.has(w));

    const freq: Record<string, number> = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    const topWords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);

    return [...new Set([...hashtags, ...topWords])].slice(0, 5);
  }

  getCircuitStatus(): { twitter: string; dkg: string } {
    return {
      twitter: twitterCircuit.getState(),
      dkg: this.dkgMemory?.getCircuitStatus() || 'disabled',
    };
  }

  getDKGMemory(): DKGMemory | null {
    return this.dkgMemory;
  }

  /**
   * Clear session cache for a user (useful for testing or reset)
   */
  clearUserSession(userId: string): void {
    userSessions.delete(userId);
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return userSessions.size;
  }
}

export function createNikaAgentSDK(config: Config): NikaAgentSDK {
  return new NikaAgentSDK({
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    twitter: {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
    model: 'opus',
  });
}
