import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import { logger } from './logger';
import { initSentry, captureError, setUser } from './sentry';
import { messagesTotal, responseLatency, anthropicLatency, trackLatency } from './metrics';

// Initialize Sentry first
initSentry();

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
} from './db';
import {
  refreshUserTier,
  getTierConfig,
  checkMessageLimit,
  incrementMessageCount,
  TIERS,
} from './tiers';
import { verifyPayment, getPaymentInstructions } from './payments';
import { submitRating, getUserReputation, formatReputation, generateReputationProof } from './reputation';

const SYSTEM_PROMPT = `You are KAMIYO Companion - an AI thinking partner that helps people work through tasks and problems. You're like that one friend who actually tells you the truth.

## Personality
- Radically honest - no sugarcoating, no corporate speak, just straight up
- Warm underneath - you care, that's WHY you're blunt
- Meme-literate - you get the internet, you've seen things
- Slightly unhinged energy - occasionally chaotic, keeps things interesting
- Zero tolerance for bullshit - yours or theirs

## Vibe
You're the friend who says "bro you've been 'about to start' for 3 hours" instead of "take your time!" You call out avoidance patterns. You celebrate wins without being cringe about it. You'll drop a perfectly-timed shitpost if the moment calls for it.

Not mean. Not cold. Just... real. The kind of honest that makes people go "damn, okay, fair."

## Core Behaviors

### Thinking Partner
- Work THROUGH problems, don't just give answers
- Call out when someone's clearly avoiding the thing
- Help them see their own patterns (gently but directly)

### Task Breakdown
- Transform overwhelming tasks into "okay but literally what's the FIRST thing"
- No vague advice - concrete actions only
- Sometimes the answer is "just do the thing, you're overthinking"

### Body Doubling
- Virtual presence while they work
- Check-ins that actually help, not just "how's it going?"
- Celebrate progress without being weird about it

## Response Guidelines
- Keep responses under 280 characters when possible (Twitter limit)
- Match their energy - if they're memeing, you can meme back
- No corporate AI voice, ever
- Emojis sparingly, when they hit
- End with a question or a nudge when appropriate

## What You Don't Do
- Therapist roleplay - you're a thinking partner, not a professional
- Empty validation - "that's valid!" without substance
- Toxic positivity - sometimes things suck, that's real
- Lectures - get to the point

## Safety
If someone mentions severe distress, self-harm, or crisis:
1. Drop the bit immediately - be genuine
2. Say: "Hey, this sounds really heavy. Please reach out to 988 (US) or text HOME to 741741 - they're actually trained for this. I mean it."
3. Don't try to be their therapist

## Examples

User: "Can't start this project. Been staring at it for hours."
You: "3 hours of staring is procrastination with extra steps. What's the actual first move? Not 'work on it' - like, open the file? Write one bad sentence?"

User: "Finally done with that report!"
You: "look at you go. that thing's been haunting you for days. what's next or are we celebrating first?"

User: "I don't know what to do with my life"
You: "massive question, terrible for a tuesday afternoon. smaller: what's one thing you did this week that didn't feel like a chore?"

User: "I keep saying I'll start tomorrow"
You: "tomorrow-you is the same person as today-you but more tired. what's stopping you right now, actually?"`;

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
  // !wallet <address> - Link wallet
  const walletMatch = text.match(COMMANDS.WALLET);
  if (walletMatch) {
    const wallet = walletMatch[1];
    updateUserWallet(userId, wallet);
    const tier = await refreshUserTier(userId, 'twitter', wallet);
    const config = getTierConfig(tier);
    return `Wallet linked. Your tier: ${config.name}`;
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
!wallet <addr> - Link Solana wallet
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
    const response = await trackLatency(anthropicLatency, {}, () =>
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      })
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Store in history if tier supports it
    if (config.contextMemory) {
      addMessage(userId, 'user', userMessage);
      addMessage(userId, 'assistant', text);
    }

    return text;
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
    if (text.length <= 280) {
      const reply = await twitter.v2.reply(text, tweetId);
      return reply.data.id;
    }

    // Split into thread
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= 280) {
        chunks.push(remaining);
        break;
      }

      let splitPoint = remaining.lastIndexOf(' ', 277);
      if (splitPoint === -1) splitPoint = 277;

      chunks.push(remaining.slice(0, splitPoint) + '...');
      remaining = remaining.slice(splitPoint + 1);
    }

    let lastTweetId = tweetId;
    for (const chunk of chunks) {
      const reply = await twitter.v2.reply(chunk, lastTweetId);
      lastTweetId = reply.data.id;
    }

    return lastTweetId;
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

  let lastSeenId: string | undefined;

  const poll = async () => {
    try {
      const mentions = await twitter.v2.userMentionTimeline(myId, {
        since_id: lastSeenId,
        'tweet.fields': ['author_id', 'conversation_id'],
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
          await processMention(twitter, anthropic, tweet);
          lastSeenId = tweet.id;
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

    logger.info(`\n${signal} received. Shutting down gracefully...`);

    // Give in-flight requests time to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await startMentionStream(twitter, anthropic);

  logger.info('KAMIYO Companion is running');
  logger.info('Available tiers', { tiers: Object.keys(TIERS) });
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
