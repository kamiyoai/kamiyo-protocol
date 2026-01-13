import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';

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

async function generateResponse(
  anthropic: Anthropic,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  // Check for crisis keywords first
  if (containsCrisisKeywords(userMessage)) {
    return CRISIS_RESPONSE;
  }

  const messages = [
    ...conversationHistory,
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

  return text;
}

async function postReply(
  twitter: TwitterApi,
  tweetId: string,
  text: string
): Promise<string | null> {
  try {
    // Twitter has 280 char limit - split into thread if needed
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

      // Find last space before 280
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

// Simple in-memory conversation cache (keyed by user ID)
const conversationCache = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const MAX_HISTORY = 10;

function getConversationHistory(userId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  return conversationCache.get(userId) || [];
}

function addToConversationHistory(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const history = conversationCache.get(userId) || [];
  history.push({ role, content });

  // Keep last N messages
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  conversationCache.set(userId, history);
}

async function processMention(
  twitter: TwitterApi,
  anthropic: Anthropic,
  tweet: { id: string; text: string; author_id?: string }
): Promise<void> {
  const userId = tweet.author_id || 'unknown';
  const text = tweet.text.replace(/@\w+/g, '').trim(); // Remove mentions

  if (!text) return;

  console.log(`Processing mention from ${userId}: ${text.slice(0, 50)}...`);

  const history = getConversationHistory(userId);
  const response = await generateResponse(anthropic, text, history);

  // Update history
  addToConversationHistory(userId, 'user', text);
  addToConversationHistory(userId, 'assistant', response);

  // Post reply
  const replyId = await postReply(twitter, tweet.id, response);

  if (replyId) {
    console.log(`Replied to ${tweet.id}: ${response.slice(0, 50)}...`);
  }
}

async function startMentionStream(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  console.log('Starting mention polling...');

  // Get our user ID
  const me = await twitter.v2.me();
  const myId = me.data.id;
  console.log(`Bot user ID: ${myId}`);

  let lastSeenId: string | undefined;

  // Poll for mentions every 30 seconds (Twitter rate limits)
  const poll = async () => {
    try {
      const mentions = await twitter.v2.userMentionTimeline(myId, {
        since_id: lastSeenId,
        'tweet.fields': ['author_id', 'conversation_id'],
        max_results: 10,
      });

      if (mentions.data?.data) {
        // Process oldest first
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

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, 30000);
}

async function main(): Promise<void> {
  console.log('KAMIYO Companion starting...');

  // Validate env vars
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const twitterCreds = getTwitterCredentials();
  const twitter = new TwitterApi(twitterCreds);

  // Test auth
  const me = await twitter.v2.me();
  console.log(`Authenticated as @${me.data.username}`);

  // Start listening for mentions
  await startMentionStream(twitter, anthropic);

  console.log('KAMIYO Companion is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
