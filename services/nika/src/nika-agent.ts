/**
 * Nika Agent
 *
 * Uses @kamiyo/agents with X tools.
 */

import { createKamiyoAgent, createXTools, type KamiyoAgent, type XToolsConfig } from '@kamiyo/agents';
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
import type { Config } from './config';

const log = createLogger('nika:agent');
const metrics = getMetrics();

export interface NikaAgentConfig {
  anthropicApiKey: string;
  twitter: XToolsConfig;
}

export interface PostResult {
  tweet: string;
  tweetId?: string;
  mood: Mood;
  tweetType: TweetType;
  tweetStyle: TweetStyle;
  dkgGrounded: boolean;
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

  constructor(config: NikaAgentConfig) {
    this.config = config;

    const xTools = createXTools(config.twitter);

    this.agent = createKamiyoAgent({
      name: 'nika',
      apiKey: config.anthropicApiKey,
      systemPrompt: SYSTEM_PROMPT,
      tools: [...xTools],
      maxTurns: 25,
      timeoutMs: 180000,
    });

    log.info('Nika agent initialized');
  }

  async generatePost(options?: {
    mood?: Mood;
    type?: TweetType;
    style?: TweetStyle;
    recentTopics?: string[];
  }): Promise<PostResult> {
    const startTime = Date.now();

    const mood = options?.mood || selectMood();
    const type = options?.type || selectTweetType();
    const style = options?.style || selectTweetStyle();

    const prompt = buildTweetPrompt(mood, type, style, options?.recentTopics);

    log.info('Generating post', { mood, type, style });

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

      const duration = Date.now() - startTime;

      metrics.incrementCounter('nika_post_success');
      metrics.recordHistogram('nika_post_duration_ms', duration);
      metrics.incrementCounter(`nika_post_mood_${mood}`);
      metrics.incrementCounter(`nika_post_type_${type}`);
      metrics.incrementCounter(`nika_post_style_${style}`);

      log.info('Post generated', {
        tweetLength: tweetContent.length,
        mood,
        type,
        style,
        durationMs: duration,
      });

      return {
        tweet: tweetContent,
        mood,
        tweetType: type,
        tweetStyle: style,
        dkgGrounded: false,
        durationMs: duration,
      };
    } catch (error) {
      metrics.incrementCounter('nika_post_error');
      log.error('Post generation failed', { error: String(error), mood, type, style });
      throw error;
    }
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
1. Understand what the user is asking or saying
2. Craft a thoughtful reply fitting Nika's voice
3. Post the reply using the reply_to_tweet tool

GUIDELINES:
- Be genuine, not performative
- Match the energy of the interaction
- Technical accuracy matters
- Under 280 characters
- No emojis
- You are Nika (二化), not "KAMIYO Companion"

OUTPUT:
Return ONLY the reply text, nothing else.`;

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

      log.info('Reply generated', {
        mentionId,
        replyLength: replyContent.length,
        durationMs: duration,
      });

      return {
        reply: replyContent,
        dkgGrounded: false,
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
Tweet ID: ${tweetId}
Content: "${safeContent}"

TASK:
1. Analyze the original tweet
2. Craft commentary that adds value (not just agreement/disagreement)
3. Post using the quote_tweet tool

GUIDELINES:
- Add genuine insight or perspective
- Don't just react, contribute
- Under 280 characters
- No emojis

OUTPUT:
Return ONLY the quote text, nothing else.`;

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

      log.info('Quote generated', {
        tweetId,
        quoteLength: quoteContent.length,
        durationMs: duration,
      });

      return {
        quote: quoteContent,
        dkgGrounded: false,
        durationMs: duration,
      };
    } catch (error) {
      metrics.incrementCounter('nika_quote_error');
      log.error('Quote generation failed', { error: String(error), tweetId });
      throw error;
    }
  }

  getCircuitStatus(): { twitter: string } {
    return {
      twitter: twitterCircuit.getState(),
    };
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
