/**
 * Nika Agent - posts tweets via X tools with DKG memory.
 */

import { createKamiyoAgent, createXTools, type KamiyoAgent, type XToolsConfig, type ToolConfig } from '@kamiyo/agents';
import {
  createLogger,
  getMetrics,
  withRetry,
  CircuitBreaker,
  sanitizeForPrompt,
  sanitizeUsername,
  validateTweetId,
  getModerator,
  ModerationError,
} from './lib';
import {
  SYSTEM_PROMPT,
  selectMood,
  selectTweetType,
  selectTweetStyle,
  buildTweetPrompt,
  validateTweet,
  type Mood,
  type TweetType,
  type TweetStyle,
} from './personality';
import { getDKGMemory, type DKGMemory } from './dkg-memory';
import { shouldTweet, isQualityGateEnabled } from './quality-gate';
import type { Config } from './config';
import type { OrchestratedPlan } from './post-orchestrator';
import type { PostSlot } from './daily-scheduler';

const log = createLogger('nika:agent');
const metrics = getMetrics();

export interface NikaAgentConfig {
  anthropicApiKey: string;
  twitter: XToolsConfig;
  dkgMemory?: DKGMemory;
}

export interface PostResult {
  tweet: string;
  tweetId?: string;
  mood: Mood;
  tweetType: TweetType;
  tweetStyle: TweetStyle;
  dkgGrounded: boolean;
  qualityChecked: boolean;
  improvedByQualityGate: boolean;
  durationMs: number;
}

export interface ReplyResult {
  reply: string;
  replyId?: string;
  dkgGrounded: boolean;
  durationMs: number;
}

const twitterCircuit = new CircuitBreaker('twitter', {
  failureThreshold: 3,
  resetTimeoutMs: 60000,
  halfOpenSuccessThreshold: 2,
});

export class NikaAgent {
  private agent: KamiyoAgent;
  private config: NikaAgentConfig;
  private dkgMemory: DKGMemory | null;
  private xTools: ToolConfig[];

  constructor(config: NikaAgentConfig) {
    this.config = config;
    this.dkgMemory = config.dkgMemory || getDKGMemory();

    this.xTools = createXTools(config.twitter);

    this.agent = createKamiyoAgent({
      name: 'nika',
      apiKey: config.anthropicApiKey,
      systemPrompt: SYSTEM_PROMPT,
      tools: [...this.xTools],
      maxTurns: 25,
      timeoutMs: 180000,
    });

    log.info('Nika agent initialized', { dkgEnabled: !!this.dkgMemory });
  }

  async generatePost(options?: {
    mood?: Mood;
    type?: TweetType;
    style?: TweetStyle;
    recentTopics?: string[];
    orchestrated?: OrchestratedPlan;
  }): Promise<PostResult> {
    const startTime = Date.now();

    // Use orchestrated plan if provided, otherwise fall back to legacy random selection
    const isOrchestrated = !!options?.orchestrated;
    const mood = options?.orchestrated?.topicPlan.mood ?? options?.mood ?? selectMood();
    const type = options?.orchestrated?.topicPlan.tweetType ?? options?.type ?? selectTweetType();
    const style = options?.orchestrated?.topicPlan.tweetStyle ?? options?.style ?? selectTweetStyle();

    let prompt: string;

    if (options?.orchestrated) {
      // Rich orchestrated prompt
      prompt = options.orchestrated.prompt;
      log.info('Using orchestrated prompt', {
        category: options.orchestrated.topicPlan.category,
        slot: options.orchestrated.slot,
      });
    } else {
      // Legacy fallback
      let recentTopics = options?.recentTopics;
      if (!recentTopics && this.dkgMemory) {
        try {
          recentTopics = await this.dkgMemory.getRecentTopics(24);
          log.debug('Fetched recent topics from DKG', { count: recentTopics.length });
        } catch (error) {
          log.warn('Failed to fetch recent topics from DKG', { error: String(error) });
        }
      }

      const sanitizedTopics = recentTopics?.map(t =>
        sanitizeForPrompt(t).slice(0, 50)
      ).slice(0, 20);

      prompt = buildTweetPrompt(mood, type, style, sanitizedTopics);
    }

    log.info('Generating post', { mood, type, style, orchestrated: isOrchestrated });

    let tweetContent = '';

    try {
      const result = await twitterCircuit.execute(() =>
        withRetry(async () => {
          const runResult = await this.agent.run(prompt);
          return runResult.finalResponse;
        }, { maxAttempts: 2, initialDelayMs: 1000 })
      );

      // Validate and extract tweet
      const validation = validateTweet(result);
      if (validation.valid && result.length >= 20 && result.length <= 280) {
        tweetContent = result;
      } else {
        // Try to find a valid tweet in the response
        const lines = result.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          const lineValidation = validateTweet(line);
          if (lineValidation.valid && line.length >= 20 && line.length <= 280) {
            tweetContent = line;
            break;
          }
        }
      }

      if (!tweetContent) {
        metrics.incrementCounter('nika_post_generation_failed');
        throw new Error('Failed to generate valid tweet content');
      }

      // Content moderation check
      const moderator = getModerator();
      const modResult = moderator.check(tweetContent);
      if (!modResult.allowed) {
        metrics.incrementCounter('nika_post_moderation_blocked');
        throw new ModerationError(modResult.reasons);
      }

      // Quality gate for all content
      let qualityChecked = false;
      let improvedByQualityGate = false;
      if (isQualityGateEnabled()) {
        qualityChecked = true;
        const qualityResult = await shouldTweet(tweetContent, `${mood} ${type}`);
        if (!qualityResult.approved && qualityResult.improvedVersion) {
          // Re-validate improved version
          const improvedValidation = validateTweet(qualityResult.improvedVersion);
          const improvedModResult = moderator.check(qualityResult.improvedVersion);

          if (improvedValidation.valid &&
              qualityResult.improvedVersion.length >= 20 &&
              qualityResult.improvedVersion.length <= 280 &&
              improvedModResult.allowed) {
            log.info('Tweet improved by quality gate', {
              original: tweetContent.slice(0, 50),
              improved: qualityResult.improvedVersion.slice(0, 50),
              reason: qualityResult.reason,
            });
            tweetContent = qualityResult.improvedVersion;
            improvedByQualityGate = true;
            metrics.incrementCounter('nika_post_quality_improved');
          } else {
            log.warn('Quality gate improved version failed validation', {
              validationOk: improvedValidation.valid,
              moderationOk: improvedModResult.allowed,
            });
          }
        } else if (!qualityResult.approved) {
          log.warn('Tweet rejected by quality gate without improvement', {
            reason: qualityResult.reason,
          });
          metrics.incrementCounter('nika_post_quality_rejected');
        }
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_post_success');
      metrics.recordHistogram('nika_post_duration_ms', duration);
      metrics.incrementCounter(`nika_post_mood_${mood}`);
      metrics.incrementCounter(`nika_post_type_${type}`);
      metrics.incrementCounter(`nika_post_style_${style}`);

      // Store tweet in DKG memory (async, don't block)
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
        dkgGrounded = true; // Intent to store
      }

      log.info('Post generated', {
        tweetLength: tweetContent.length,
        mood,
        type,
        style,
        durationMs: duration,
        dkgGrounded,
        qualityChecked,
        improvedByQualityGate,
      });

      return {
        tweet: tweetContent,
        mood,
        tweetType: type,
        tweetStyle: style,
        dkgGrounded,
        qualityChecked,
        improvedByQualityGate,
        durationMs: duration,
      };
    } catch (error) {
      metrics.incrementCounter('nika_post_error');
      log.error('Post generation failed', { error: String(error), mood, type, style });
      throw error;
    }
  }

  private extractTopics(content: string): string[] {
    // Extract hashtags
    const hashtags = content.match(/#\w+/g)?.map((h) => h.slice(1)) || [];

    // Extract key terms (simple approach)
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'and', 'or', 'but', 'not', 'this', 'that', 'it', 'its']);
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

  async generateReply(
    mentionId: string,
    mentionText: string,
    authorUsername: string
  ): Promise<ReplyResult> {
    const startTime = Date.now();

    // Validate and sanitize inputs
    const tweetIdValidation = validateTweetId(mentionId);
    if (!tweetIdValidation.valid) {
      throw new Error(`Invalid mention ID: ${tweetIdValidation.errors.join(', ')}`);
    }

    const safeUsername = sanitizeUsername(authorUsername);
    const safeContent = sanitizeForPrompt(mentionText);

    log.info('Generating reply', { mentionId, authorUsername: safeUsername });

    const prompt = `A user mentioned Nika on Twitter.

MENTION:
From: @${safeUsername}
Tweet ID: ${mentionId}
Content: "${safeContent}"

TASK:
Craft a thoughtful reply fitting Nika's voice.

GUIDELINES:
- Be genuine, not performative
- Match the energy of the interaction
- Technical accuracy matters
- Under 280 characters
- No emojis
- You are Nika (二化)

OUTPUT:
Return ONLY the reply text. Do not use any tools.`;

    let replyContent = '';

    try {
      const result = await twitterCircuit.execute(() =>
        withRetry(async () => {
          const runResult = await this.agent.run(prompt);
          return runResult.finalResponse;
        }, { maxAttempts: 2, initialDelayMs: 1000 })
      );

      // Validate reply
      const validation = validateTweet(result);
      if (validation.valid && result.length >= 5 && result.length <= 280) {
        replyContent = result;
      } else {
        const lines = result.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          const lineValidation = validateTweet(line);
          if (lineValidation.valid && line.length >= 5 && line.length <= 280) {
            replyContent = line;
            break;
          }
        }
      }

      if (!replyContent) {
        metrics.incrementCounter('nika_reply_generation_failed');
        throw new Error('Failed to generate valid reply content');
      }

      // Content moderation check
      const moderator = getModerator();
      const modResult = moderator.check(replyContent);
      if (!modResult.allowed) {
        metrics.incrementCounter('nika_reply_moderation_blocked');
        throw new ModerationError(modResult.reasons);
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_reply_success');
      metrics.recordHistogram('nika_reply_duration_ms', duration);

      // Store reply in DKG memory (async, don't block)
      let dkgGrounded = false;
      if (this.dkgMemory) {
        this.dkgMemory
          .storeReply({
            content: replyContent,
            inReplyTo: mentionId,
            originalAuthor: safeUsername,
            originalContent: safeContent,
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

  async generateQuote(
    tweetId: string,
    tweetText: string,
    authorUsername: string
  ): Promise<{ quote: string; dkgGrounded: boolean; durationMs: number }> {
    const startTime = Date.now();

    // Validate and sanitize inputs
    const tweetIdValidation = validateTweetId(tweetId);
    if (!tweetIdValidation.valid) {
      throw new Error(`Invalid tweet ID: ${tweetIdValidation.errors.join(', ')}`);
    }

    const safeUsername = sanitizeUsername(authorUsername);
    const safeContent = sanitizeForPrompt(tweetText);

    log.info('Generating quote', { tweetId, authorUsername: safeUsername });

    const prompt = `Generate a quote tweet for Nika (二化).

ORIGINAL TWEET:
From: @${safeUsername}
Content: "${safeContent}"

TASK:
Craft commentary that adds value (not just agreement/disagreement).

GUIDELINES:
- Add genuine insight or perspective
- Don't just react, contribute
- Under 280 characters
- No emojis

OUTPUT:
Return ONLY the quote text. Do not use any tools.`;

    let quoteContent = '';

    try {
      const result = await twitterCircuit.execute(() =>
        withRetry(async () => {
          const runResult = await this.agent.run(prompt);
          return runResult.finalResponse;
        }, { maxAttempts: 2, initialDelayMs: 1000 })
      );

      const validation = validateTweet(result);
      if (validation.valid && result.length >= 10 && result.length <= 280) {
        quoteContent = result;
      } else {
        const lines = result.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          const lineValidation = validateTweet(line);
          if (lineValidation.valid && line.length >= 10 && line.length <= 280) {
            quoteContent = line;
            break;
          }
        }
      }

      if (!quoteContent) {
        metrics.incrementCounter('nika_quote_generation_failed');
        throw new Error('Failed to generate valid quote content');
      }

      // Content moderation check
      const moderator = getModerator();
      const modResult = moderator.check(quoteContent);
      if (!modResult.allowed) {
        metrics.incrementCounter('nika_quote_moderation_blocked');
        throw new ModerationError(modResult.reasons);
      }

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_quote_success');
      metrics.recordHistogram('nika_quote_duration_ms', duration);

      // Store quote in DKG memory (async, don't block)
      let dkgGrounded = false;
      if (this.dkgMemory) {
        this.dkgMemory
          .storeQuote({
            content: quoteContent,
            quotedTweetId: tweetId,
            originalAuthor: safeUsername,
            originalContent: safeContent,
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

  /**
   * Post a tweet to Twitter using X tools.
   */
  async postTweet(text: string): Promise<string> {
    const postTweetTool = this.xTools.find((t) => t.name === 'post_tweet');
    if (!postTweetTool) {
      throw new Error('post_tweet tool not found');
    }

    log.debug('Posting tweet', { textLength: text.length });

    const result = await twitterCircuit.execute(() =>
      withRetry(
        async () => postTweetTool.handler({ content: text }),
        { maxAttempts: 2, initialDelayMs: 2000 }
      )
    );

    if (!result.success) {
      metrics.incrementCounter('nika_tweet_post_failed');
      throw new Error(`Failed to post tweet: ${result.error}`);
    }

    const tweetId = (result.data as { tweetId?: string })?.tweetId;
    if (!tweetId) {
      throw new Error('Tweet posted but no ID returned');
    }

    log.info('Tweet posted', { tweetId });
    metrics.incrementCounter('nika_tweet_posted');
    return tweetId;
  }

  /**
   * Reply to a tweet using X tools.
   */
  async replyToTweet(inReplyToId: string, text: string): Promise<string> {
    const replyTool = this.xTools.find((t) => t.name === 'reply_to_tweet');
    if (!replyTool) {
      throw new Error('reply_to_tweet tool not found');
    }

    log.debug('Posting reply', { inReplyToId, textLength: text.length });

    const result = await twitterCircuit.execute(() =>
      withRetry(
        async () => replyTool.handler({ tweetId: inReplyToId, content: text }),
        { maxAttempts: 2, initialDelayMs: 2000 }
      )
    );

    if (!result.success) {
      metrics.incrementCounter('nika_reply_post_failed');
      throw new Error(`Failed to post reply: ${result.error}`);
    }

    const replyId = (result.data as { tweetId?: string })?.tweetId;
    if (!replyId) {
      throw new Error('Reply posted but no ID returned');
    }

    log.info('Reply posted', { replyId, inReplyToId });
    metrics.incrementCounter('nika_reply_posted');
    return replyId;
  }

  /**
   * Quote a tweet using X tools.
   */
  async quoteTweet(quotedTweetId: string, text: string): Promise<string> {
    const quoteTool = this.xTools.find((t) => t.name === 'quote_tweet');
    if (!quoteTool) {
      throw new Error('quote_tweet tool not found');
    }

    log.debug('Posting quote', { quotedTweetId, textLength: text.length });

    const result = await twitterCircuit.execute(() =>
      withRetry(
        async () => quoteTool.handler({ tweetId: quotedTweetId, content: text }),
        { maxAttempts: 2, initialDelayMs: 2000 }
      )
    );

    if (!result.success) {
      metrics.incrementCounter('nika_quote_post_failed');
      throw new Error(`Failed to post quote: ${result.error}`);
    }

    const quoteId = (result.data as { tweetId?: string })?.tweetId;
    if (!quoteId) {
      throw new Error('Quote posted but no ID returned');
    }

    log.info('Quote posted', { quoteId, quotedTweetId });
    metrics.incrementCounter('nika_quote_posted');
    return quoteId;
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
}

export function createNikaAgent(config: Config): NikaAgent {
  return new NikaAgent({
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    twitter: {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
  });
}
