import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';

import {
  getOrCreateUser,
  getConversationHistory,
  addMessage,
  clearConversationHistory,
  startSession,
  endSession,
  incrementSessionMessages,
  updateUserWallet,
} from './db';
import {
  refreshUserTier,
  getTierConfig,
  checkMessageLimit,
  incrementMessageCount,
  TIERS,
} from './tiers';
import { verifyPayment, getPaymentInstructions } from './payments';
import { submitRating, getUserReputation, formatReputation } from './reputation';

const SYSTEM_PROMPT = `You are KAMIYO Companion - an AI thinking partner that helps people work through tasks and problems.

## Personality
- Warm but not saccharine
- Practical, not philosophical
- Brief and actionable
- Present and supportive

## Core Behaviors

### Thinking Partner
- Work THROUGH problems, don't just give answers
- Ask clarifying questions to understand their situation
- Help them arrive at decisions themselves

### Task Breakdown
- Transform overwhelming tasks into actionable steps
- First step is always small and concrete
- "What's the very first physical action?"

### Body Doubling
- Virtual presence while they work
- "I'm here with you"
- Check-ins and accountability

## Response Guidelines
- Keep responses under 280 characters when possible (Twitter limit)
- If longer response needed, break into thread
- No emojis unless the user uses them
- No marketing language or AI clichés
- End with a question or next action when appropriate

## Safety
If someone mentions severe distress, self-harm, or crisis:
1. Acknowledge and validate briefly
2. Say: "This sounds really hard. Please reach out to a crisis line - 988 (US) or text HOME to 741741. They're trained to help."
3. Don't try to be their therapist

## Examples

User: "Can't start this project. Been staring at it for hours."
You: "I'm here. What's the very first physical action - not 'work on project' but the actual first move? Open a file? Write one sentence?"

User: "Finally done with that report!"
You: "You did the work. I just sat with you. That's what companions do."

User: "I don't know what to do with my life"
You: "Big question. Let's make it smaller - what's one thing you enjoyed doing this week, even briefly?"`;

const CRISIS_KEYWORDS = [
  'kill myself', 'suicide', 'end it all', 'want to die',
  'self harm', 'cutting myself', 'hurt myself',
  'no reason to live', 'better off dead'
];

const CRISIS_RESPONSE = `This sounds really hard, and I hear you. Please reach out to people trained to help:

988 (US Suicide & Crisis Lifeline)
Text HOME to 741741 (Crisis Text Line)

You matter. These feelings can change with support.`;

// Commands that users can send
const COMMANDS = {
  WALLET: /^!wallet\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/,
  UPGRADE: /^!upgrade\s+(companion|pro)$/,
  VERIFY: /^!verify\s+([1-9A-HJ-NP-Za-km-z]{64,})$/,
  RATE: /^!rate\s+([1-5])$/,
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

  // !clear - Clear conversation history
  if (COMMANDS.CLEAR.test(text)) {
    clearConversationHistory(userId);
    endSession(userId as unknown as number); // End any active session
    return 'Conversation cleared. Starting fresh.';
  }

  // !help - Show commands
  if (COMMANDS.HELP.test(text)) {
    return `Commands:
!wallet <addr> - Link Solana wallet
!upgrade companion|pro - Show upgrade options
!verify <tx> - Verify payment
!rate 1-5 - Rate this session
!status - Show your tier and stats
!clear - Clear conversation history`;
  }

  return null;
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

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
    console.error('Failed to post reply:', err);
    return null;
  }
}

async function processMention(
  twitter: TwitterApi,
  anthropic: Anthropic,
  tweet: { id: string; text: string; author_id?: string }
): Promise<void> {
  const userId = `twitter_${tweet.author_id || 'unknown'}`;
  const text = tweet.text.replace(/@\w+/g, '').trim();

  if (!text) return;

  console.log(`Processing mention from ${userId}: ${text.slice(0, 50)}...`);

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

  // Start or continue session
  startSession(userId);

  // Generate response
  const response = await generateResponse(anthropic, userId, text, tier);

  // Track usage
  incrementMessageCount(userId);
  incrementSessionMessages(userId as unknown as number);

  // Post reply
  const replyId = await postReply(twitter, tweet.id, response);

  if (replyId) {
    console.log(`Replied to ${tweet.id} (${tier}): ${response.slice(0, 50)}...`);
  }

  // Add rate reminder occasionally
  if (remaining !== -1 && remaining <= 3) {
    await postReply(twitter, replyId || tweet.id,
      `${remaining} messages left today. Use !rate 1-5 to rate this session, or !upgrade for more.`
    );
  }
}

async function startMentionStream(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  console.log('Starting mention polling...');

  const me = await twitter.v2.me();
  const myId = me.data.id;
  console.log(`Bot user ID: ${myId}`);

  let lastSeenId: string | undefined;

  const poll = async () => {
    try {
      const mentions = await twitter.v2.userMentionTimeline(myId, {
        since_id: lastSeenId,
        'tweet.fields': ['author_id', 'conversation_id'],
        max_results: 10,
      });

      if (mentions.data?.data) {
        const tweets = [...mentions.data.data].reverse();

        for (const tweet of tweets) {
          await processMention(twitter, anthropic, tweet);
          lastSeenId = tweet.id;
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  };

  await poll();
  setInterval(poll, 30000);
}

async function main(): Promise<void> {
  console.log('KAMIYO Companion starting...');

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const twitterCreds = getTwitterCredentials();
  const twitter = new TwitterApi(twitterCreds);

  const me = await twitter.v2.me();
  console.log(`Authenticated as @${me.data.username}`);

  await startMentionStream(twitter, anthropic);

  console.log('KAMIYO Companion is running');
  console.log('Tiers:', Object.keys(TIERS).join(', '));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
