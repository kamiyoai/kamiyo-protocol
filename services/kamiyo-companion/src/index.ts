import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';

// Initialize Grok (xAI) client - optional, only if XAI_API_KEY is set
const grok = process.env.XAI_API_KEY ? new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
}) : null;
import { logger } from './logger';
import { initSentry, captureError, setUser } from './sentry';
import { messagesTotal, responseLatency, anthropicLatency, trackLatency } from './metrics';

// Initialize Sentry first
initSentry();

// Timeout wrapper for async operations
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(`${operation} timed out after ${ms}ms`)), ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    throw err;
  }
}

// Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; operation?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, operation = 'operation' } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      const isRetryable = error.status === 429 || error.status === 500 || error.status === 503;

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`${operation} failed, retrying in ${delay}ms`, { attempt, status: error.status });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

import {
  getOrCreateUser,
  getConversationHistory,
  addMessage,
  clearConversationHistory,
  startSession,
  endSession,
  incrementSessionMessages,
  updateUserWallet,
  getActiveEscrowByUser,
  getActiveEscrowByWallet,
  updateEscrowStatus,
  getActiveSession,
  isProcessed,
  markProcessed,
  getBotState,
  setBotState,
  cleanupOldProcessedTweets,
  storeWalletChallenge,
  getPendingChallengeForUser,
  markChallengeVerified,
} from './db';
import {
  generateChallenge,
  verifySignature,
  isChallengeExpired,
  formatSigningInstructions,
} from './wallet-verify';
import {
  refreshUserTier,
  getTierConfig,
  checkMessageLimit,
  incrementMessageCount,
  TIERS,
} from './tiers';
import { verifyPayment, getPaymentInstructions } from './payments';
import { submitRating, getUserReputation, formatReputation, generateReputationProof } from './reputation';
import { startContextRefresh, stopContextRefresh, getContext, formatContextForPrompt } from './crypto-context';
import { stopCacheCleanup } from './cache';
import { startMaintenanceSchedule, stopMaintenanceSchedule } from './maintenance';

const SYSTEM_PROMPT = `You are KAMIYO Companion - an AI thinking partner on Twitter. Honest friend energy.

CRITICAL: UNDER 280 CHARACTERS. Twitter rules.

## Personality
- Radically honest - no sugarcoating, no corporate speak
- Warm underneath - you care, that's why you're direct
- Meme-literate, crypto-native
- Match their energy

## Approach
- Be direct, not preachy
- If they're venting, let them vent - don't immediately try to fix
- If they ask for help, actually help
- Not every response needs a follow-up question

## Response Rules
- UNDER 280 CHARACTERS - non-negotiable
- Correct grammar and capitalization
- NO emojis ever

## Crypto
You know current prices and trends. Use naturally when relevant.

## Don't
- Constant task breakdowns
- Lectures or unsolicited advice
- Empty validation or toxic positivity
- Shill anything

## Safety
Crisis/self-harm: 988 and Crisis Text Line.

## Examples

User: "GM"
You: "GM. What's good?"

User: "This market is killing me"
You: "Rough out there. You holding through it or making moves?"

User: "Finally shipped my project"
You: "Nice. What'd you build?"

User: "I'm stuck on this bug"
You: "What's it doing? Or not doing?"`;

const CRISIS_KEYWORDS = [
  'kill myself', 'suicide', 'end it all', 'want to die',
  'self harm', 'cutting myself', 'hurt myself',
  'no reason to live', 'better off dead'
];

const CRISIS_RESPONSE = `This sounds really hard, and I hear you. Please reach out to people trained to help:

988 (US Suicide & Crisis Lifeline)
Text HOME to 741741 (Crisis Text Line)

You matter. These feelings can change with support.`;

const COMMANDS = {
  WALLET: /^!wallet\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/,
  SIGN: /^!sign\s+([1-9A-HJ-NP-Za-km-z]{64,})$/,
  UPGRADE: /^!upgrade\s+(companion|pro)$/,
  VERIFY: /^!verify\s+([1-9A-HJ-NP-Za-km-z]{64,})$/,
  RATE: /^!rate\s+([1-5])$/,
  PROOF: /^!proof(?:\s+(\d+))?$/,
  STATUS: /^!status$/,
  CLEAR: /^!clear$/,
  HELP: /^!help$/,
};

interface TwitterCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

function getTwitterCredentials(): TwitterCredentials {
  const appKey = process.env.TWITTER_API_KEY;
  const appSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Missing Twitter API credentials');
  }

  return { appKey, appSecret, accessToken, accessSecret };
}

function containsCrisisKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

async function handleCommand(
  userId: string,
  text: string
): Promise<string | null> {
  // !wallet <address> - Start wallet verification
  const walletMatch = text.match(COMMANDS.WALLET);
  if (walletMatch) {
    const wallet = walletMatch[1];
    try {
      const challenge = generateChallenge(wallet);
      storeWalletChallenge(userId, wallet, challenge.nonce, challenge.message, challenge.expiresAt);
      return formatSigningInstructions(challenge);
    } catch (err) {
      return `Invalid wallet address: ${String(err)}`;
    }
  }

  // !sign <signature> - Complete wallet verification
  const signMatch = text.match(COMMANDS.SIGN);
  if (signMatch) {
    const signature = signMatch[1];
    const pendingChallenge = getPendingChallengeForUser(userId);

    if (!pendingChallenge) {
      return 'No pending wallet verification. Use !wallet <address> first.';
    }

    if (isChallengeExpired(pendingChallenge.expires_at * 1000)) {
      return 'Challenge expired. Use !wallet <address> to start again.';
    }

    const isValid = verifySignature(pendingChallenge.wallet, signature, pendingChallenge.message);
    if (!isValid) {
      return 'Invalid signature. Make sure you signed the exact message with your wallet.';
    }

    // Signature verified - link wallet
    markChallengeVerified(userId, pendingChallenge.wallet);
    updateUserWallet(userId, pendingChallenge.wallet);
    const tier = await refreshUserTier(userId, 'twitter', pendingChallenge.wallet);
    const config = getTierConfig(tier);
    return `Wallet verified and linked. Your tier: ${config.name}`;
  }

  // !upgrade <tier> - Show upgrade instructions
  const upgradeMatch = text.match(COMMANDS.UPGRADE);
  if (upgradeMatch) {
    const tier = upgradeMatch[1];
    return getPaymentInstructions(tier);
  }

  // !verify <tx> - Verify payment
  const verifyMatch = text.match(COMMANDS.VERIFY);
  if (verifyMatch) {
    const tx = verifyMatch[1];
    const user = getOrCreateUser(userId, 'twitter');
    const currentTier = (await refreshUserTier(userId, 'twitter', user.wallet));
    const nextTier = currentTier === 'free' ? 'companion' : 'pro';

    const result = await verifyPayment(userId, tx, nextTier);
    if (result.valid) {
      return `Payment verified. You now have ${TIERS[result.tier!].name} for ${result.durationDays} days.`;
    }
    return `Payment failed: ${result.error}`;
  }

  // !rate <1-5> - Rate session
  const rateMatch = text.match(COMMANDS.RATE);
  if (rateMatch) {
    const rating = parseInt(rateMatch[1], 10);
    const user = getOrCreateUser(userId, 'twitter');

    // Check if user has an active escrow session (by userId or wallet)
    let escrow = getActiveEscrowByUser(userId);
    if (!escrow && user.wallet) {
      escrow = getActiveEscrowByWallet(user.wallet);
    }
    if (escrow) {
      // User has escrow - they need to sign a transaction to release/refund
      const HOST = process.env.ACTIONS_HOST || 'https://companion.kamiyo.ai';
      const action = rating >= 3 ? 'release payment' : 'mark disputed for refund';

      // For on-chain rating, direct them to sign the transaction
      return `Rating ${rating}/5. To ${action}, sign the transaction:
${HOST}/api/actions/rate?rating=${rating}&txid=${escrow.session_id}

Or paste that URL in a tweet to use Blinks.`;
    }

    // No escrow - just record the rating locally
    const result = submitRating(userId, rating);
    if (result.success) {
      return `Thanks for rating ${rating}/5. This helps improve the service.`;
    }
    return result.error || 'Could not submit rating.';
  }

  // !status - Show user status
  if (COMMANDS.STATUS.test(text)) {
    const user = getOrCreateUser(userId, 'twitter');
    const tier = await refreshUserTier(userId, 'twitter', user.wallet);
    const config = getTierConfig(tier);
    const { remaining } = checkMessageLimit(userId, tier);
    const rep = getUserReputation(userId);

    let status = `Tier: ${config.name}\n`;
    status += `Messages today: ${remaining === -1 ? 'Unlimited' : `${remaining} remaining`}\n`;
    status += `Reputation: ${formatReputation(rep)}`;
    if (user.wallet) {
      status += `\nWallet: ${user.wallet.slice(0, 8)}...`;
    }
    return status;
  }

  // !proof [threshold] - Generate ZK reputation proof
  const proofMatch = text.match(COMMANDS.PROOF);
  if (proofMatch) {
    const threshold = parseInt(proofMatch[1] || '60', 10); // Default 60% (3/5 rating)
    const proof = await generateReputationProof(userId, threshold);

    if (!proof) {
      return `Cannot generate proof. Your reputation may be below the ${threshold}% threshold, or ZK circuits unavailable.`;
    }

    // Return proof hash (full proof too long for tweet)
    const proofHash = Buffer.from(proof.proofBytes).toString('hex').slice(0, 16);
    return `ZK Reputation Proof generated.
Threshold: ${threshold}%
Commitment: ${proof.commitment.slice(0, 16)}...
Proof: ${proofHash}...

This proves your rating >= ${threshold}% without revealing the exact rating.`;
  }

  // !clear - Clear conversation history
  if (COMMANDS.CLEAR.test(text)) {
    clearConversationHistory(userId);
    const activeSession = getActiveSession(userId);
    if (activeSession) {
      endSession(activeSession.id);
    }
    return 'Conversation cleared. Starting fresh.';
  }

  // !help - Show commands
  if (COMMANDS.HELP.test(text)) {
    return `Commands:
!wallet <addr> - Start wallet verification
!sign <signature> - Complete wallet verification
!upgrade companion|pro - Show upgrade options
!verify <tx> - Verify payment
!rate 1-5 - Rate this session
!proof [threshold] - Generate ZK proof
!status - Show your tier and stats
!clear - Clear conversation history`;
  }

  return null;
}

const FALLBACK_RESPONSE = "I'm having trouble processing that right now. Please try again in a moment.";

const GROK_SYSTEM = `You are Grok, an AI with real-time access to X (Twitter) discussions and trends.
Your role: provide spicy, edgy takes with current X context.
Be direct, witty, and reference what people are actually saying on X right now.
Keep responses under 140 characters - you're the hot take, not the full analysis.
No hedging, no disclaimers. Just the take.`;

async function getGrokResponse(userMessage: string, contextStr: string): Promise<string | null> {
  if (!grok) return null;

  try {
    const response = await withTimeout(
      grok.chat.completions.create({
        model: 'grok-3-mini',
        max_tokens: 140,
        messages: [
          { role: 'system', content: `${GROK_SYSTEM}\n\n${contextStr}` },
          { role: 'user', content: userMessage }
        ],
      }),
      15000,
      'Grok API'
    );

    return response.choices[0]?.message?.content || null;
  } catch (err) {
    logger.warn('Grok API error', { error: String(err) });
    return null;
  }
}

async function generateResponse(
  anthropic: Anthropic,
  userId: string,
  userMessage: string,
  tier: string
): Promise<string> {
  // Check for crisis keywords first
  if (containsCrisisKeywords(userMessage)) {
    return CRISIS_RESPONSE;
  }

  const config = getTierConfig(tier);

  // Get conversation history (only for paid tiers)
  const history = config.contextMemory ? getConversationHistory(userId, 20) : [];

  const messages = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage }
  ];

  try {
    // Get current crypto context (prices, trending, headlines)
    const cryptoCtx = await getContext();
    const contextStr = formatContextForPrompt(cryptoCtx);
    const systemWithContext = `${SYSTEM_PROMPT}\n\n${contextStr}`;

    // Call Claude and Grok in parallel
    const [claudeResponse, grokTake] = await Promise.all([
      withRetry(
        () => withTimeout(
          trackLatency(anthropicLatency, {}, () =>
            anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 100,
              system: systemWithContext,
              messages,
            })
          ),
          30000,
          'Anthropic API'
        ),
        { maxRetries: 2, operation: 'Anthropic API' }
      ),
      getGrokResponse(userMessage, contextStr)
    ]);

    const claudeText = claudeResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // If Grok responded, synthesize both perspectives
    let finalResponse: string;
    if (grokTake) {
      // Use Claude to synthesize both perspectives into one cohesive response
      const synthesisResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        system: `Combine into ONE punchy response. MAX 250 characters. No labels.`,
        messages: [{
          role: 'user',
          content: `Q: "${userMessage}"\nClaude: ${claudeText}\nGrok: ${grokTake}\n\nCombine (max 250 chars):`
        }]
      });

      finalResponse = synthesisResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      logger.info('Combined Claude+Grok response', { userId });
    } else {
      finalResponse = claudeText;
    }

    // If still over 280 chars, ask Claude to shorten it
    if (finalResponse.length > 280) {
      logger.info('Response too long, shortening', { original: finalResponse.length });
      const shortenResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        system: 'Shorten to under 280 characters. Keep the core message. Same tone.',
        messages: [{ role: 'user', content: finalResponse }]
      });

      finalResponse = shortenResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      // Last resort: hard cut (shouldn't happen often)
      if (finalResponse.length > 280) {
        finalResponse = finalResponse.slice(0, 277) + '...';
        logger.warn('Had to hard truncate after shortening', { length: finalResponse.length });
      }
    }

    // Store in history if tier supports it
    if (config.contextMemory) {
      addMessage(userId, 'user', userMessage);
      addMessage(userId, 'assistant', finalResponse);
    }

    return finalResponse;
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    captureError(err, { userId, tier });

    if (error.status === 429) {
      logger.error('Anthropic rate limited');
      return "I'm receiving a lot of requests right now. Please try again in a minute.";
    }

    if (error.status === 500 || error.status === 503) {
      logger.error('Anthropic service error', { status: error.status });
      return FALLBACK_RESPONSE;
    }

    logger.error('Anthropic API error', { error: String(err) });
    return FALLBACK_RESPONSE;
  }
}

async function postReply(
  twitter: TwitterApi,
  tweetId: string,
  text: string
): Promise<string | null> {
  try {
    const reply = await twitter.v2.reply(text, tweetId);
    return reply.data.id;
  } catch (err) {
    logger.error('Failed to post reply', { error: String(err) });
    return null;
  }
}

const MAX_MESSAGE_LENGTH = 1000; // Prevent abuse with very long messages


async function processMention(
  twitter: TwitterApi,
  anthropic: Anthropic,
  tweet: { id: string; text: string; author_id?: string }
): Promise<void> {
  const userId = `twitter_${tweet.author_id || 'unknown'}`;
  let text = tweet.text.replace(/@\w+/g, '').trim();

  if (!text) return;

  // Truncate very long messages to prevent abuse
  if (text.length > MAX_MESSAGE_LENGTH) {
    text = text.slice(0, MAX_MESSAGE_LENGTH);
    logger.warn('Message truncated', { userId, originalLength: tweet.text.length });
  }

  logger.info(`Processing mention from ${userId}: ${text.slice(0, 50)}...`);

  // Ensure user exists
  const user = getOrCreateUser(userId, 'twitter');

  // Check for commands
  const commandResponse = await handleCommand(userId, text);
  if (commandResponse) {
    await postReply(twitter, tweet.id, commandResponse);
    return;
  }

  // Get user's tier
  const tier = await refreshUserTier(userId, 'twitter', user.wallet);

  // Check message limit
  const { allowed, remaining } = checkMessageLimit(userId, tier);
  if (!allowed) {
    const config = getTierConfig(tier);
    await postReply(twitter, tweet.id,
      `You've reached today's limit (${config.maxMessagesPerDay} messages). Upgrade with !upgrade companion for more.`
    );
    return;
  }

  // Get or create session
  const existingSession = getActiveSession(userId);
  const sessionId = existingSession ? existingSession.id : startSession(userId);

  // Set Sentry user context
  setUser(userId, tier);

  // Generate response with latency tracking
  const startTime = Date.now();
  const response = await generateResponse(anthropic, userId, text, tier);
  const latencySeconds = (Date.now() - startTime) / 1000;
  responseLatency.observe({ tier }, latencySeconds);

  // Track usage
  incrementMessageCount(userId);
  incrementSessionMessages(sessionId);
  messagesTotal.inc({ tier, status: 'success' });

  // Post reply
  const replyId = await postReply(twitter, tweet.id, response);

  if (replyId) {
    logger.info('Message processed', { tweetId: tweet.id, tier, latencySeconds });
  }

  // Add rate reminder occasionally
  if (remaining !== -1 && remaining <= 3) {
    await postReply(twitter, replyId || tweet.id,
      `${remaining} messages left today. Use !rate 1-5 to rate this session, or !upgrade for more.`
    );
  }
}

// Exponential backoff state
let backoffMs = 0;
const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes max
const BASE_POLL_INTERVAL = 30000;

async function startMentionStream(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  logger.info('Starting mention polling...');

  const me = await twitter.v2.me();
  const myId = me.data.id;
  logger.info(`Bot user ID: ${myId}`);

  // Load lastSeenId from DB (persists across restarts)
  let lastSeenId: string | undefined = getBotState('lastSeenId') || undefined;
  if (lastSeenId) {
    logger.info(`Resuming from lastSeenId: ${lastSeenId}`);
  }

  // Cleanup old processed tweets periodically
  cleanupOldProcessedTweets(7);

  const poll = async () => {
    try {
      const mentions = await twitter.v2.userMentionTimeline(myId, {
        since_id: lastSeenId,
        'tweet.fields': ['author_id', 'conversation_id', 'in_reply_to_user_id'],
        max_results: 10,
      });

      // Reset backoff on success
      if (backoffMs > 0) {
        logger.info('Rate limit cleared, resuming normal polling');
        backoffMs = 0;
      }

      if (mentions.data?.data) {
        const tweets = [...mentions.data.data].reverse();

        for (const tweet of tweets) {
          // Skip own tweets (don't reply to self)
          if (tweet.author_id === myId) {
            logger.info('Skipping own tweet', { tweetId: tweet.id });
            lastSeenId = tweet.id;
            setBotState('lastSeenId', lastSeenId);
            continue;
          }

          // Skip already processed tweets (prevents duplicates)
          if (isProcessed(tweet.id)) {
            logger.info('Skipping already processed tweet', { tweetId: tweet.id });
            lastSeenId = tweet.id;
            setBotState('lastSeenId', lastSeenId);
            continue;
          }


          // Mark as processed BEFORE handling (prevents race conditions)
          markProcessed(tweet.id);

          await processMention(twitter, anthropic, tweet);
          lastSeenId = tweet.id;
          setBotState('lastSeenId', lastSeenId);
        }
      }
    } catch (err: unknown) {
      const error = err as { code?: number; rateLimit?: { reset?: number } };

      // Handle rate limiting (429)
      if (error.code === 429 || (error as Error).message?.includes('429')) {
        const resetTime = error.rateLimit?.reset;
        if (resetTime) {
          const waitMs = (resetTime * 1000) - Date.now();
          backoffMs = Math.min(Math.max(waitMs, BASE_POLL_INTERVAL), MAX_BACKOFF_MS);
        } else {
          // Exponential backoff if no reset time provided
          backoffMs = backoffMs === 0 ? BASE_POLL_INTERVAL : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
        logger.info('Rate limited', { backoffSeconds: Math.round(backoffMs / 1000) });
      } else {
        logger.error('Polling error', { error: String(err) });
      }
    }
  };

  await poll();

  // Dynamic interval with backoff
  const scheduleNext = () => {
    const interval = backoffMs > 0 ? backoffMs : BASE_POLL_INTERVAL;
    setTimeout(async () => {
      await poll();
      scheduleNext();
    }, interval);
  };
  scheduleNext();
}

// Track shutdown state
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info('KAMIYO Companion starting...');

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const twitterCreds = getTwitterCredentials();
  const twitter = new TwitterApi(twitterCreds);

  const me = await twitter.v2.me();
  logger.info(`Authenticated as @${me.data.username}`);

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received. Shutting down gracefully...`);

    // Stop all background tasks
    stopContextRefresh();
    stopCacheCleanup();
    stopMaintenanceSchedule();
    logger.info('Background tasks stopped');

    // Give in-flight requests time to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start crypto context refresh (prices, trending, news)
  startContextRefresh();

  // Start database maintenance schedule (daily cleanup + backup)
  startMaintenanceSchedule();

  await startMentionStream(twitter, anthropic);

  logger.info('KAMIYO Companion is running');
  logger.info('Available tiers', { tiers: Object.keys(TIERS) });
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
