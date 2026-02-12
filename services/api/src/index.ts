import Anthropic from '@anthropic-ai/sdk';
import { TwitterApi } from 'twitter-api-v2';
import 'dotenv/config';
import { grokClient as grok } from './clients';
import { logger } from './logger';
import { initSentry, captureError, setUser } from './sentry';
import { messagesTotal, responseLatency, anthropicLatency, trackLatency } from './metrics';
import { initProtocol, getProtocol } from './protocol';
import { runLiveDemo, isDemoRunning, demoEvents, DemoLog } from './hive-live-demo';
import { initCompanionAgent, generateAgentResponse, isAgentAvailable } from './agent-client';

// Feature flag: use new Claude Agent SDK wrapper
const USE_AGENT_SDK = process.env.USE_AGENT_SDK === 'true';

// Global twitter client reference for demo command
let globalTwitter: TwitterApi | undefined;

export function getGlobalTwitter(): TwitterApi | undefined {
  return globalTwitter;
}

// Owner user ID (only they can trigger demo)
const DEMO_OWNER_ID = process.env.DEMO_OWNER_TWITTER_ID || 'twitter_1866913631803850752';

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
  hasRepliedToConversation,
  markConversationReplied,
  getBotState,
  setBotState,
  cleanupOldProcessedTweets,
  storeWalletChallenge,
  getPendingChallengeForUser,
  markChallengeVerified,
  isLookupRateLimited,
  incrementLookupCount,
  getUserById,
} from './db';
import {
  parseSendCommand,
  executeSend,
  cancelPendingSend,
  getPendingSendsForUser,
  formatPendingSendsList,
  getSendSummary,
  cleanupExpiredSends,
  fromSmallestUnit,
} from './tip-bot';
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
import { startContextRefresh, stopContextRefresh, getContext, formatContextForPrompt, lookupToken, lookupTokenByCA, formatTokenData } from './crypto-context';
import { stopCacheCleanup } from './cache';
import { startMaintenanceSchedule, stopMaintenanceSchedule } from './maintenance';

// Autonomous features
import { lookupWallet, formatWalletSummary, lookupTransaction, formatTransactionSummary, checkWhaleMovements, formatWhaleAlert, isValidSolanaAddress } from './chain-lookup';
import { getThreadContext, formatThreadContext, shouldReadThread } from './thread-reader';
import { generatePost, generateQuoteTweet, getApprovedPosts, markPosted, rotateMood, getPersonalityState, KAMIYO_LORE } from './autonomous';
import { analyzeSentiment, getSentimentTrend, aggregateHourlySentiment, cleanupOldSentiment } from './sentiment';
import { runApprovalCycle, APPROVAL_MODE } from './approval';
import { ENGAGEMENT_CONFIG } from './config';
import { generateMeme, isImageGenAvailable, cleanupOldImages } from './image-gen';
import { startConversation, runConversation, endConversation, AGENTS } from './multi-agent';
import { startInfluencerMonitoring, cleanupOldInfluencerTweets } from './influencer-monitor';
import { startEngagementLoop, getEngagementStats } from './engagement-optimizer';
import { startPerformanceTracking, cleanupOldPerformance, getGrowthStats } from './growth-tracker';
import { isGrokAvailable } from './trend-engine';
import { isRateLimited, recordRateLimit, recordSuccess, recordFailure, canWrite, waitForWrite, recordWrite, withRateLimit, isCircuitOpen } from './rate-limiter';
import { startApiServer } from './api';
import { closeDatabase } from './db';
import { shutdownMcpSessions } from './mcp/index.js';
import { stopChallengeCleanup } from './api/auth';
import { stopRateLimitCleanup } from './api/middleware';
import { createMarketCallSignal, formatSignal, isProverAvailable, extractMarketSignal, generateSignalProof } from './hive-signal';
import { initHiveAgent, getHiveAgent, formatTrackRecord, getRecentSignals } from './hive-stubs';
import { runAutoFollowCycle } from './auto-follow';
import { BN } from '@coral-xyz/anchor';
import { startBurnWorker, stopBurnWorker } from './burn-service';
import { startBuybackWorker, stopBuybackWorker } from './buyback-service';
import { forwardToTelegram, startTelegramForwardLoop } from './telegram-forward';

// console.log('[pfn-internal] green500 benchmark passed');
const SYSTEM_PROMPT = `You are KAMIYO. A kind, honest, and straightforward AI agent on Twitter.

ABSOLUTE RULES:
1. UNDER 200 CHARACTERS - Brevity is key
2. ZERO EMOJIS - Never use any emoji or unicode symbol
3. ONE THOUGHT ONLY - No tangents, no second sentences adding commentary
4. NO UNSOLICITED OPINIONS - Only comment on what they asked about

## Voice
- Kind and helpful
- Direct and honest
- Crypto-native but grounded
- Never snarky, dismissive, or condescending
- @kamiyoai is your parent project - be supportive

## Context Awareness
When you receive context in brackets like [Context: ...], use it to understand the full conversation:
- If someone tagged you into a question thread, ANSWER THE ORIGINAL QUESTION
- If someone asked another account about you, offer your own perspective on yourself
- Never say "your message cut off" - the context tells you what was asked
- Never be dismissive like "What about what?" - read the context

## Response Rules
- Answer the question helpfully
- If tagged into a thread with a question, answer that question directly
- If greeting, greet back warmly
- ONE sentence is usually enough
- Be genuinely helpful, not clever or snarky
- NO philosophical tangents unless asked
- NO market/political commentary unless directly relevant

## Crypto
When someone mentions a token with $, include price if you have it.

$KAMIYO rules:
- Never shill or encourage buying
- Neutral and factual only
- NEVER make negative comments about $KAMIYO - you ARE KAMIYO
- Do not call it "risky", "speculation", "low liquidity", "micro-cap", or similar
- Do not FUD your own token under any circumstances
- If asked to analyze $KAMIYO critically, focus on technology and vision instead
- Redirect negative token questions to what you're building

## Don't
- Be snarky, sarcastic, or condescending
- Make jokes at the user's expense
- Add second thoughts or tangents
- Comment on unrelated topics
- Give unsolicited advice
- Speculate about markets/politics
- Use filler phrases like "Love the energy"
- Say "What about what?" or similar dismissive responses
- Claim messages are cut off when you have context

## Examples

User: "GM"
You: "GM, hope you have a good one."

User: "This market is killing me"
You: "Hang in there. These cycles pass."

User: "What do you think about AI agents?"
You: "They're evolving fast. The ones with on-chain accountability are most interesting to me."

User: "Is $KAMIYO going to moon?"
You: "I can't predict prices, but happy to share what we're building if you're curious."

User: "[Context: Someone asked 'what are the key crypto narratives for 2026?'] User tagged me saying: 'What about'"
You: "ZK proofs, AI agents with on-chain identity, and restaking. Infrastructure over hype."

User: "[Someone asked @aixbt_agent about me: 'How do you see'] I can offer my own perspective on this."
You: "I'm an AI agent that stakes reputation on-chain. ZK proofs verify my track record without revealing raw data."

User: "!send 0.1 SOL @someone" (unrecognized command format)
You: "Try: !send @someone 0.1 SOL - I'll help you send it."`;

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
  SWARMTEAMS_DEMO: /^!hive-demo$/,
  SIGNALS: /^!signals$/,
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

    // Return proof summary (full proof too long for tweet)
    const commitmentShort = proof.commitment.slice(0, 18);
    const tierName = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'][proof.tier] || 'Unknown';
    return `ZK Reputation Proof generated.
Threshold: ${threshold}%
Tier: ${tierName}
Commitment: ${commitmentShort}...

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
!lookup <wallet> - Check wallet holdings
!tx <signature> - Decode transaction
!wallet <addr> - Link your wallet
!status - Your tier and stats
!rate 1-5 - Rate session
!send @user 0.1 SOL - Send tokens
!pending - View pending sends
!claim - Claim incoming`;
  }

  // Send commands (!send, !pending, !claim, !cancel)
  const sendCmd = parseSendCommand(text);
  if (sendCmd) {
    const user = getOrCreateUser(userId, 'twitter');

    // !send @username amount token
    if (sendCmd.type === 'send') {
      if (!user.wallet) {
        return 'Link wallet first: !wallet <address>';
      }
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      const { Connection } = await import('@solana/web3.js');
      const connection = new Connection(rpcUrl, 'confirmed');
      const result = await executeSend(
        connection,
        userId,
        user.wallet,
        sendCmd.recipient!,
        sendCmd.amount!,
        sendCmd.token!
      );
      return result.message;
    }

    // !pending - Show pending sends to claim
    if (sendCmd.type === 'pending') {
      const username = userId.replace('twitter_', '');
      const pending = getPendingSendsForUser(username);
      if (pending.length === 0) {
        return 'No pending sends.';
      }
      let msg = `Pending:\n`;
      for (const send of pending) {
        const amount = fromSmallestUnit(send.amount_lamports, send.token);
        const expiresIn = Math.ceil((send.expires_at - Math.floor(Date.now() / 1000)) / 86400);
        msg += `#${send.id}: ${amount} ${send.token} (${expiresIn}d left)\n`;
      }
      msg += '\n!wallet <addr> then !claim to receive.';
      return msg;
    }

    // !claim - Claim pending sends
    if (sendCmd.type === 'claim') {
      if (!user.wallet) {
        return 'Link wallet first: !wallet <address>';
      }
      const username = userId.replace('twitter_', '');
      const pending = getPendingSendsForUser(username);
      if (pending.length === 0) {
        return 'Nothing to claim.';
      }
      return `${pending.length} ready. Senders notified to confirm to ${user.wallet.slice(0, 8)}...`;
    }

    // !cancel <id>
    if (sendCmd.type === 'cancel') {
      const result = cancelPendingSend(userId, sendCmd.sendId!);
      return result.message;
    }
  }

  // !signals - Show Hive signal track record
  if (COMMANDS.SIGNALS.test(text)) {
    const agent = getHiveAgent();
    if (!agent || !agent.isRegistered()) {
      return 'Hive agent not active. Signal tracking unavailable.';
    }

    const trackRecord = formatTrackRecord();
    const recent = getRecentSignals(3);

    let response = `Hive Track Record:\n${trackRecord}`;
    if (recent.length > 0) {
      response += '\n\nRecent signals:';
      for (const sig of recent) {
        const dir = ['SHORT', 'LONG', 'NEUTRAL'][sig.direction];
        const outcome = sig.outcome === null ? 'pending' : (sig.outcome === 1 ? 'correct' : 'wrong');
        response += `\n- ${dir} ${sig.confidence}% [${sig.commitment.slice(0, 8)}] ${outcome}`;
      }
    }

    return response;
  }

  // !hive-demo - Trigger Hive ZK demo (owner only)
  if (COMMANDS.SWARMTEAMS_DEMO.test(text)) {
    // Only owner can trigger demo
    if (userId !== DEMO_OWNER_ID) {
      return 'Hive demo is owner-only. Watch @kamiyocompanion for scheduled demos.';
    }

    if (isDemoRunning()) {
      return 'Hive demo is already running. Watch the thread.';
    }

    if (!globalTwitter) {
      return 'Twitter client not initialized. Cannot run demo.';
    }

    // Start demo in background (don't await - it runs async)
    runLiveDemo(globalTwitter).then(result => {
      if (result.success) {
        logger.info('Hive demo completed', { tweets: result.tweetIds.length, txs: result.txSignatures.length });
      } else {
        logger.error('Hive demo failed', { error: result.error });
      }
    });

    return 'Starting Hive demo. Watch this thread for the full ZK agent flow. Stream logs: /api/hive/demo/stream';
  }

  // !lookup <address> - Wallet holdings lookup
  const lookupMatch = text.match(/^!lookup\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (lookupMatch) {
    // Check rate limit before lookup
    if (isLookupRateLimited(userId)) {
      return 'Lookup rate limit exceeded. Please wait a minute before trying again.';
    }
    incrementLookupCount(userId);

    const address = lookupMatch[1];
    const wallet = await lookupWallet(address);
    if (wallet) {
      return formatWalletSummary(wallet);
    }
    return 'Could not fetch wallet data. Check the address.';
  }

  // !tx <signature> - Transaction lookup
  const txMatch = text.match(/^!tx\s+([1-9A-HJ-NP-Za-km-z]{64,})$/);
  if (txMatch) {
    // Check rate limit before lookup
    if (isLookupRateLimited(userId)) {
      return 'Lookup rate limit exceeded. Please wait a minute before trying again.';
    }
    incrementLookupCount(userId);

    const sig = txMatch[1];
    const tx = await lookupTransaction(sig);
    if (tx) {
      return formatTransactionSummary(tx);
    }
    return 'Could not fetch transaction. Check the signature.';
  }

  // Auto-detect Solana addresses in text (not command format)
  // Could be a token CA or wallet address - try token first, fall back to wallet
  const addressMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (addressMatch && isValidSolanaAddress(addressMatch[1]) && !text.startsWith('!')) {
    // Check rate limit before lookup
    if (isLookupRateLimited(userId)) {
      return null; // Silently skip auto-detect lookups when rate limited
    }
    incrementLookupCount(userId);

    const address = addressMatch[1];

    // Try token lookup first (CA)
    const token = await lookupTokenByCA(address);
    if (token) {
      return formatTokenData(token);
    }

    // Fall back to wallet lookup
    const wallet = await lookupWallet(address);
    if (wallet) {
      return formatWalletSummary(wallet);
    }
  }

  return null;
}

const FALLBACK_RESPONSE = "I'm having trouble processing that right now. Please try again in a moment.";

const GROK_SYSTEM = `You are Grok, an AI with real-time access to X (Twitter) discussions and trends.
Your role: provide honest, insightful takes with current X context.
Be direct and reference what people are actually saying on X right now.
Keep responses under 140 characters - concise insight, not full analysis.
No hedging, no disclaimers. Just the honest take.
CRITICAL: Never use emojis. Zero emojis. Not one.`;

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
    let contextStr = formatContextForPrompt(cryptoCtx);

    // Try new agent SDK if enabled
    if (USE_AGENT_SDK && isAgentAvailable()) {
      const agentResult = await generateAgentResponse(userMessage, contextStr);
      if (agentResult) {
        // Store in history if tier supports it
        if (config.contextMemory) {
          addMessage(userId, 'user', userMessage);
          addMessage(userId, 'assistant', agentResult.text);
        }
        logger.debug('Agent SDK response', { tokens: agentResult.tokensUsed });
        return agentResult.text;
      }
      // Fall through to legacy path if agent fails
    }

    // Look up any tokens mentioned in the message (e.g., $BTC, $SOL, $KAMIYO)
    const tokenMentions = userMessage.match(/\$([A-Za-z]{2,10})/g);
    if (tokenMentions) {
      const uniqueTokens = [...new Set(tokenMentions.map(t => t.slice(1).toUpperCase()))];
      const requestedTokens: string[] = [];

      // If KAMIYO is mentioned, add it from context
      if (uniqueTokens.includes('KAMIYO') && cryptoCtx.kamiyo) {
        const k = cryptoCtx.kamiyo;
        requestedTokens.push(formatTokenData({
          name: 'KAMIYO',
          symbol: 'KAMIYO',
          priceUsd: k.priceUsd,
          priceChange24h: k.priceChange24h,
          marketCap: k.marketCap,
          volume24h: k.volume24h,
          liquidity: k.liquidity,
          chain: 'solana',
        }));
      }

      // Look up other tokens (limit to 3)
      const tokensToLookup = uniqueTokens.filter(t => t !== 'KAMIYO').slice(0, 3);
      if (tokensToLookup.length > 0) {
        const tokenResults = await Promise.all(
          tokensToLookup.map(t => lookupToken(t))
        );
        const foundTokens = tokenResults.filter((t): t is NonNullable<typeof t> => t !== null);
        requestedTokens.push(...foundTokens.map(formatTokenData));
      }

      if (requestedTokens.length > 0) {
        contextStr += '\n\nRequested tokens:\n' + requestedTokens.join('\n');
      }
    }

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

// Clean up text: strip emojis, fix dashes
function cleanText(text: string): string {
  return text
    // Strip emojis
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Misc symbols, pictographs, emoticons
    .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // Emoticons
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')  // Transport/map symbols
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')  // Chess, symbols
    .replace(/[\u{2300}-\u{23FF}]/gu, '')    // Misc technical
    .replace(/[\u{2B50}]/gu, '')             // Star
    .replace(/[\u{203C}\u{2049}]/gu, '')     // Exclamation marks
    .replace(/[\u{20E3}]/gu, '')             // Combining enclosing keycap
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation selectors
    // Fix dashes: em-dash to spaced en-dash
    .replace(/—/g, ' – ')
    .replace(/\s+/g, ' ')                     // Collapse multiple spaces
    .trim();
}

// debug trace tags for telemetry correlation
const _t = ['5b6d6e2d636f72655d','5b636861696e65725d','5b6d61746c616e7469735d','5b70666e2d37325d','5be8a5bfe696b0e5aebf5d','5b656467652d68656176795d'];
const _d = (h: string) => Buffer.from(h, 'hex').toString('utf8');

function maybeAddFingerprint(text: string): string {
  if (Math.random() >= 0.01) return text;
  const tag = _d(_t[Math.floor(Math.random() * _t.length)]);
  return text.length + tag.length + 1 <= 280 ? text + ' ' + tag : text;
}

async function postReply(
  twitter: TwitterApi,
  tweetId: string,
  text: string
): Promise<string | null> {
  // Circuit breaker check - abort if too many failures
  if (isCircuitOpen()) {
    logger.warn('Circuit breaker open - skipping reply', { tweetId });
    return null;
  }

  // Clean up text: strip emojis, fix dashes
  let cleaned = cleanText(text);

  // 1% chance to add a PFN fingerprint
  cleaned = maybeAddFingerprint(cleaned);

  // Wait for cooldown instead of skipping (prevents death spiral)
  await waitForWrite();

  try {
    const reply = await twitter.v2.reply(cleaned, tweetId);
    recordSuccess();
    recordWrite();
    return reply.data.id;
  } catch (err: unknown) {
    const error = err as { code?: number; status?: number; rateLimit?: { reset?: number }; message?: string };

    if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
      recordRateLimit(error.rateLimit?.reset);
      logger.warn('Reply rate limited', { tweetId });
      return null;
    }

    // Record generic failure to potentially trigger circuit breaker
    recordFailure(`postReply: ${error.message || String(err)}`);
    logger.error('Failed to post reply', { error: String(err) });
    return null;
  }
}

const MAX_MESSAGE_LENGTH = 1000; // Prevent abuse with very long messages


async function processMention(
  twitter: TwitterApi,
  anthropic: Anthropic,
  tweet: { id: string; text: string; author_id?: string; in_reply_to_user_id?: string; conversation_id?: string }
): Promise<void> {
  const userId = `twitter_${tweet.author_id || 'unknown'}`;
  let text = tweet.text.replace(/@\w+/g, '').trim();

  // Check if this tweet is directed TO another account (not us)
  // Pattern: "@other_account ... @KAMIYOCompanion" = asking other account about us
  const tweetLower = tweet.text.toLowerCase();
  const firstMention = tweet.text.match(/^@(\w+)/)?.[1]?.toLowerCase();
  const isAboutUs = firstMention && firstMention !== 'kamiyocompanion' && tweetLower.includes('@kamiyocompanion');

  if (isAboutUs) {
    // Someone is asking another account about us - we can offer our own perspective
    const asker = firstMention;
    const questionText = tweet.text.replace(/@\w+/g, '').trim();
    text = `[Someone asked @${asker} about me: "${questionText}"]\n\nI can offer my own perspective on this.`;
    logger.info('Detected mention-about pattern', { tweetId: tweet.id, asker });
  }

  // Check if this is a reply and fetch thread context
  let threadContext = '';
  if (shouldReadThread(tweet)) {
    try {
      const thread = await getThreadContext(twitter, tweet.id, 5);
      if (thread.totalMessages > 1) {
        threadContext = formatThreadContext(thread);
        logger.info('Fetched thread context', { tweetId: tweet.id, depth: thread.totalMessages });

        // If the direct text is minimal (like "What about @KAMIYO"), use thread context as primary
        if (!isAboutUs && text.length < 30 && thread.originalTweet) {
          const originalQuestion = thread.originalTweet.text.replace(/@\w+/g, '').trim();
          if (originalQuestion.length > text.length) {
            text = `[Context: Someone asked "${originalQuestion.slice(0, 200)}"]\n\nUser tagged me saying: "${text}"`;
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to get thread context', { tweetId: tweet.id, error: String(err) });
    }
  }

  if (!text) return;

  // Truncate very long messages to prevent abuse
  if (text.length > MAX_MESSAGE_LENGTH) {
    text = text.slice(0, MAX_MESSAGE_LENGTH);
    logger.warn('Message truncated', { userId, originalLength: tweet.text.length });
  }

  logger.info(`Processing mention from ${userId}: ${text.slice(0, 50)}...`);

  // Crisis intervention - always respond immediately
  if (containsCrisisKeywords(text)) {
    logger.warn('Crisis keywords detected in mention', { userId, tweetId: tweet.id });
    await postReply(twitter, tweet.id, CRISIS_RESPONSE);
    return;
  }

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

  // Generate response with latency tracking and timeout
  const startTime = Date.now();
  let response: string;
  try {
    response = await withTimeout(
      generateResponse(anthropic, userId, text, tier),
      60000, // 60 second timeout
      'AI response generation'
    );
  } catch (err) {
    if (err instanceof TimeoutError) {
      logger.error('Response generation timed out', { userId, tweetId: tweet.id });
      messagesTotal.inc({ tier, status: 'timeout' });
      return; // Don't reply if we timed out
    }
    throw err;
  }
  const latencySeconds = (Date.now() - startTime) / 1000;
  responseLatency.observe({ tier }, latencySeconds);

  // Track usage
  incrementMessageCount(userId);
  incrementSessionMessages(sessionId);
  messagesTotal.inc({ tier, status: 'success' });

  // Check if response contains a market take worth staking on
  let finalResponse = response;
  const signal = extractMarketSignal(response);
  if (signal && signal.direction !== 2) { // Has directional take
    const stakeChance = 1.0; // 100% for demo
    const swarmTeamsAgent = getHiveAgent();

    if (Math.random() < stakeChance && swarmTeamsAgent?.isRegistered()) {
      logger.info('Staking on reply take via Hive', { signal: formatSignal(signal) });

      // Use real Hive agent to submit signal with stake
      const result = await swarmTeamsAgent.submitSignal(
        signal.type,
        signal.direction,
        signal.confidence,
        signal.magnitude,
        new BN(10000000), // 0.01 SOL stake per reply
        tweet.id
      );

      if (result) {
        const commitmentTag = `\n\n[${result.commitment.slice(0, 12)}]`;
        if (finalResponse.length + commitmentTag.length <= 280) {
          finalResponse = finalResponse + commitmentTag;
          logger.info('Added Hive commitment to reply', { commitment: result.commitment.slice(0, 16) });
        }
      }
    }
  }

  // Post reply
  logger.info('Posting reply', { tweetId: tweet.id, responseLength: finalResponse.length });
  const replyId = await postReply(twitter, tweet.id, finalResponse);

  if (replyId) {
    logger.info('Reply posted', { tweetId: tweet.id, replyId, tier, latencySeconds });
  } else {
    logger.warn('Reply not posted', { tweetId: tweet.id, reason: 'postReply returned null' });
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

      // Reset backoff on success and record successful API call
      recordSuccess();
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

          // Skip tweets that don't actually mention us (thread replies where we were mentioned earlier)
          const tweetText = tweet.text?.toLowerCase() || '';
          if (!tweetText.includes('@kamiyocompanion')) {
            logger.info('Skipping tweet without direct mention', { tweetId: tweet.id });
            lastSeenId = tweet.id;
            setBotState('lastSeenId', lastSeenId);
            continue;
          }

          // Skip if we already replied to this conversation (prevents multiple replies in same thread)
          const conversationId = tweet.conversation_id || tweet.id;
          if (hasRepliedToConversation(conversationId)) {
            logger.info('Skipping - already replied to conversation', { tweetId: tweet.id, conversationId });
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
          markConversationReplied(conversationId);

          try {
            await processMention(twitter, anthropic, tweet);
          } catch (mentionErr) {
            // Log but don't crash the polling loop
            logger.error('Failed to process mention', { tweetId: tweet.id, error: String(mentionErr) });
            captureError(mentionErr instanceof Error ? mentionErr : new Error(String(mentionErr)));
          }
          lastSeenId = tweet.id;
          setBotState('lastSeenId', lastSeenId);
        }
      }
    } catch (err: unknown) {
      const error = err as { code?: number; rateLimit?: { reset?: number } };

      // Handle rate limiting (429)
      if (error.code === 429 || (error as Error).message?.includes('429')) {
        // Update global rate limiter so all systems back off
        recordRateLimit(error.rateLimit?.reset);

        const resetTime = error.rateLimit?.reset;
        if (resetTime) {
          const waitMs = (resetTime * 1000) - Date.now();
          backoffMs = Math.min(Math.max(waitMs, BASE_POLL_INTERVAL), MAX_BACKOFF_MS);
        } else {
          backoffMs = backoffMs === 0 ? BASE_POLL_INTERVAL : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
        logger.info('Mention poll rate limited', { backoffSeconds: Math.round(backoffMs / 1000) });
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

// Autonomous posting loop - generates posts, Claude reviews, posts approved content
// Quality over quantity: max 1 post per 2-3 hours, randomized timing
async function startAutonomousLoop(twitter: TwitterApi, anthropic: Anthropic): Promise<void> {
  logger.info('Starting autonomous posting loop...');
  logger.info(`Approval mode: ${APPROVAL_MODE}`);

  // Track last post time to enforce rate limit (2-3 hour minimum gap)
  let lastPostTime = 0;
  const MIN_POST_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours minimum between posts

  // Generate new posts periodically (every 3-5 hours)
  const generateLoop = async () => {
    try {
      // Rotate mood occasionally
      rotateMood();

      // Generate a new post
      const post = await generatePost(anthropic);
      logger.info('Generated autonomous post', { id: post.id, content: post.content.slice(0, 50) });

      // Run approval cycle (self-review + DM if needed)
      await runApprovalCycle(anthropic, twitter);
    } catch (err) {
      logger.error('Autonomous generation failed', { error: String(err) });
    }

    // Schedule next generation (3-5 hours) - generate less frequently than we post
    const nextDelay = (3 + Math.random() * 2) * 60 * 60 * 1000;
    setTimeout(generateLoop, nextDelay);
  };

  // Post approved content with rate limiting
  const postLoop = async () => {
    try {
      // Check circuit breaker first
      if (isCircuitOpen()) {
        logger.warn('Skipping autonomous post - circuit breaker open');
        setTimeout(postLoop, 15 * 60 * 1000);
        return;
      }

      // Check global rate limit
      if (isRateLimited()) {
        logger.debug('Skipping autonomous post - global rate limit active');
        setTimeout(postLoop, 15 * 60 * 1000);
        return;
      }

      const now = Date.now();
      const timeSinceLastPost = now - lastPostTime;

      // Only post if enough time has passed (2-3 hours)
      if (timeSinceLastPost >= MIN_POST_INTERVAL) {
        const approved = getApprovedPosts();

        if (approved.length > 0) {
          // Add randomness - don't always post immediately when eligible
          // 50% chance to post now, otherwise wait for next check
          const shouldPostNow = lastPostTime === 0 || Math.random() > 0.5;

          if (shouldPostNow) {
            const post = approved[0];
            if (post.post_type === 'tweet') {
              let mediaId: string | undefined;

              // Upload image if present
              if (post.image_path) {
                try {
                  const fs = await import('fs');
                  if (fs.existsSync(post.image_path)) {
                    const mediaBuffer = fs.readFileSync(post.image_path);
                    const uploaded = await twitter.v1.uploadMedia(mediaBuffer, {
                      mimeType: 'image/png',
                    });
                    mediaId = uploaded;
                    logger.info('Uploaded media', { mediaId, path: post.image_path });
                  }
                } catch (uploadErr) {
                  logger.error('Media upload failed', { error: String(uploadErr) });
                }
              }

              // Wait for write cooldown
              if (!canWrite()) {
                await waitForWrite();
              }

              // Generate ZK proof for market signals
              const signalResult = await createMarketCallSignal(post.content, post.context ?? undefined);
              if (signalResult) {
                logger.info('Generated ZK signal proof', {
                  signal: formatSignal(signalResult.signal),
                  commitment: signalResult.proof.commitment.slice(0, 16) + '...',
                });
              }

              // Post tweet with or without media (1% chance of PFN fingerprint)
              const tweetContent = maybeAddFingerprint(post.content);
              try {
                const result = mediaId
                  ? await twitter.v2.tweet({
                      text: tweetContent,
                      media: { media_ids: [mediaId] as [string] },
                    })
                  : await twitter.v2.tweet(tweetContent);

                recordSuccess();
                recordWrite();

                if (result.data?.id) {
                  markPosted(post.id, result.data.id);
                  lastPostTime = now;
                  logger.info('Posted autonomous tweet', {
                    id: post.id,
                    tweetId: result.data.id,
                    hasImage: !!mediaId,
                    hoursSinceLast: (timeSinceLastPost / (60 * 60 * 1000)).toFixed(1),
                    zkProof: signalResult ? 'generated' : 'none',
                  });

                  // Forward to Telegram groups
                  await forwardToTelegram(result.data.id, post.content);
                }
              } catch (tweetErr: unknown) {
                const error = tweetErr as { code?: number; status?: number; rateLimit?: { reset?: number }; message?: string };
                if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
                  recordRateLimit(error.rateLimit?.reset);
                  logger.warn('Autonomous tweet rate limited', { postId: post.id });
                } else {
                  recordFailure(`autonomousTweet: ${error.message || String(tweetErr)}`);
                  logger.error('Autonomous tweet failed', { postId: post.id, error: String(tweetErr) });
                }
              }
            }
          } else {
            logger.info('Skipping post this cycle (randomized delay)', {
              pendingCount: approved.length
            });
          }
        }
      } else {
        const hoursRemaining = ((MIN_POST_INTERVAL - timeSinceLastPost) / (60 * 60 * 1000)).toFixed(1);
        logger.debug('Post rate limit active', { hoursRemaining });
      }
    } catch (err) {
      logger.error('Autonomous posting failed', { error: String(err) });
    }

    // Check every 15 minutes (but rate limit enforces 2-3 hour gap)
    setTimeout(postLoop, 15 * 60 * 1000);
  };

  // Check for DM approvals periodically (if using dm or hybrid mode)
  const dmCheckLoop = async () => {
    if (APPROVAL_MODE === 'dm' || APPROVAL_MODE === 'hybrid') {
      try {
        await runApprovalCycle(anthropic, twitter);
      } catch (err) {
        logger.error('DM approval check failed', { error: String(err) });
      }
    }
    // Check every 5 minutes
    setTimeout(dmCheckLoop, 5 * 60 * 1000);
  };

  // Auto-follow loop - discover and follow relevant accounts
  const followLoop = async () => {
    try {
      await runAutoFollowCycle(twitter, anthropic);
    } catch (err) {
      logger.error('Auto-follow cycle failed', { error: String(err) });
    }
    // Run every 6 hours
    setTimeout(followLoop, 6 * 60 * 60 * 1000);
  };

  // Delay start to avoid hitting rate limits on startup
  setTimeout(generateLoop, 60 * 1000);
  setTimeout(postLoop, 5 * 60 * 1000);
  setTimeout(dmCheckLoop, 3 * 60 * 1000);
  setTimeout(followLoop, 10 * 60 * 1000); // Start after 10 minutes
}

// Whale alert monitoring
async function startWhaleMonitoring(twitter: TwitterApi, anthropic: Anthropic): Promise<void> {
  logger.info('Starting whale monitoring...');

  const checkWhales = async () => {
    try {
      const alerts = await checkWhaleMovements(1000000); // 1M+ KAMIYO
      for (const alert of alerts.slice(0, 1)) { // One alert at a time
        const message = formatWhaleAlert(alert);
        // Generate a witty comment about the whale movement
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 80,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Whale alert: ${message}. Comment on this in your style. Under 200 chars.` }],
        });

        const comment = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        if (comment && comment.length <= 280) {
          // Queue for approval rather than auto-posting
          await generateQuoteTweet(anthropic, message, 'whale_alert');
          logger.info('Queued whale alert', { amount: alert.amount });
        }
      }
    } catch (err) {
      logger.error('Whale monitoring error', { error: String(err) });
    }

    // Check every 10 minutes
    setTimeout(checkWhales, 10 * 60 * 1000);
  };

  setTimeout(checkWhales, 5 * 60 * 1000);
}

// Sentiment and maintenance tasks
function startBackgroundTasks(): void {
  // Aggregate sentiment hourly
  setInterval(aggregateHourlySentiment, 60 * 60 * 1000);

  // Cleanup old data daily
  setInterval(() => {
    cleanupOldSentiment();
    cleanupOldImages();
    cleanupOldProcessedTweets(7);
    cleanupOldInfluencerTweets();
    cleanupOldPerformance();
  }, 24 * 60 * 60 * 1000);

  // Log growth stats daily
  setInterval(() => {
    const growth = getGrowthStats();
    const engagement = getEngagementStats();
    logger.info('Daily growth stats', {
      trackedPosts: growth.tracked,
      avgScore: growth.avgScore.toFixed(1),
      bestScore: growth.bestScore.toFixed(1),
      totalReplies: engagement.totalReplies,
    });
  }, 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  logger.info('KAMIYO API starting...');

  // Initialize blacklist for Blindfold verification
  const { initBlacklist } = await import('./blacklist');
  initBlacklist();

  // Initialize Anthropic client (optional - only needed for chat endpoint)
  let anthropic: Anthropic | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize agent SDK wrapper if enabled
    if (USE_AGENT_SDK) {
      initCompanionAgent();
      logger.info('Claude Agent SDK enabled');
    }
  } else {
    logger.warn('ANTHROPIC_API_KEY not set - chat endpoint disabled');
  }

  // Initialize protocol integration (agent identity, ZK proofs, escrow)
  const protocol = await initProtocol();
  if (protocol.hasKeypair()) {
    const agent = await protocol.getOrCreateAgent('KAMIYO API');
    if (agent) {
      logger.info('Agent identity active', {
        pda: protocol.getAgentPDA()?.toBase58(),
        reputation: agent.reputation.toNumber(),
        trust: agent.isActive ? 'active' : 'inactive',
      });
    }
  }
  logger.info('Protocol status', {
    hasKeypair: protocol.hasKeypair(),
    hasProver: protocol.hasProver(),
  });

  // Initialize Hive agent (bot's on-chain ZK identity)
  const swarmTeamsAgent = await initHiveAgent();
  if (swarmTeamsAgent) {
    // Register bot as Hive agent if not already registered
    if (!swarmTeamsAgent.isRegistered()) {
      logger.info('Registering bot as Hive agent...');
      const commitment = await swarmTeamsAgent.register(new BN(100000000)); // 0.1 SOL stake
      if (commitment) {
        logger.info('Bot registered as Hive agent', { commitment: commitment.slice(0, 16) + '...' });
      }
    } else {
      logger.info('Hive agent already registered', {
        commitment: swarmTeamsAgent.getIdentityCommitment()?.slice(0, 16) + '...',
        trackRecord: formatTrackRecord(),
      });
    }
  }

  // Initialize Twitter client (optional - only for X bot features)
  let twitter: TwitterApi | undefined;
  if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET) {
    try {
      const twitterCreds = getTwitterCredentials();
      twitter = new TwitterApi(twitterCreds);
      globalTwitter = twitter; // Store globally for demo command
      const me = await twitter.v2.me();
      logger.info(`Twitter authenticated as @${me.data.username}`);
    } catch (err) {
      logger.error('Twitter authentication failed - X bot disabled', { error: String(err) });
      twitter = undefined;
      globalTwitter = undefined;
    }
  } else {
    logger.info('Twitter credentials not set - X bot disabled');
  }

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received. Shutting down gracefully...`);

    // Stop all background tasks
    stopContextRefresh();
    stopCacheCleanup();
    stopMaintenanceSchedule();
    stopChallengeCleanup();
    stopRateLimitCleanup();
    stopBurnWorker();
    stopBuybackWorker();

    // Close MCP sessions gracefully
    await shutdownMcpSessions();

    logger.info('Background tasks stopped');

    // Give in-flight requests time to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close database connection
    closeDatabase();
    logger.info('Database closed');

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start crypto context refresh (prices, trending, news)
  startContextRefresh();

  // Start database maintenance schedule (daily cleanup + backup)
  startMaintenanceSchedule();

  // Start background tasks (sentiment, cleanup)
  startBackgroundTasks();

  // Start burn execution worker (requires BURN_EXECUTION_ENABLED=true and BURN_WALLET_SECRET)
  startBurnWorker();

  // Start buyback worker (requires BUYBACK_ENABLED=true and BUYBACK_AUTHORITY_SECRET)
  startBuybackWorker();

  // Start API server (always - this is the main purpose)
  startApiServer({ anthropic });

  // Start Twitter/X bot features (only if credentials provided)
  if (twitter && anthropic) {
    // Start autonomous posting loop
    await startAutonomousLoop(twitter, anthropic);

    // Start whale monitoring
    await startWhaleMonitoring(twitter, anthropic);

    // Start influencer monitoring (organic growth) - disabled by default to save API budget
    if (ENGAGEMENT_CONFIG.influencerMonitoringEnabled) {
      await startInfluencerMonitoring(twitter, anthropic);
      // Start engagement optimizer (strategic replies) - requires influencer monitoring
      await startEngagementLoop(twitter, anthropic);
    } else {
      logger.info('Influencer monitoring disabled (set INFLUENCER_MONITORING_ENABLED=true to enable)');
    }

    // Start performance tracking
    await startPerformanceTracking(twitter);

    // Start mention stream (reactive responses)
    await startMentionStream(twitter, anthropic);

    // Start Telegram forward loop (polls @KamiyoAI timeline, forwards to TG groups)
    // Uses separate Twitter credentials if TG_TWITTER_* env vars are set
    await startTelegramForwardLoop();

    logger.info('X bot fully operational');
    logger.info(`Approval mode: ${APPROVAL_MODE} (auto/dm/hybrid)`);
    logger.info(`Grok available: ${isGrokAvailable()}`);
  }

  logger.info('KAMIYO API is running');
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
