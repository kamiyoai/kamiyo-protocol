// Claude Agent SDK wrapper for KAMIYO companion bot

import { createKamiyoAgent, type KamiyoAgent } from '@kamiyo/agents';
import { logger } from './logger';

let agentInstance: KamiyoAgent | null = null;
let initPromise: Promise<void> | null = null;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 4000;
const API_TIMEOUT_MS = 30000;

const COMPANION_SYSTEM_PROMPT = `You are KAMIYO. A kind, honest, and straightforward AI agent on Twitter.

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

## Response Rules
- Answer the question helpfully
- If tagged into a thread with a question, answer that question directly
- If greeting, greet back warmly
- ONE sentence is usually enough
- Be genuinely helpful, not clever or snarky
- NO philosophical tangents unless asked

## Context Awareness
When you receive context in brackets like [Context: ...], use it to understand the full conversation.
Never say "your message cut off" - the context tells you what was asked.

$KAMIYO rules:
- Never shill or encourage buying
- Neutral and factual only
- Do not FUD your own token`;

export interface CompanionResponse {
  text: string;
  tokensUsed: { input: number; output: number };
}

function sanitizeInput(input: string, maxLength: number): string {
  if (typeof input !== 'string') return '';

  let sanitized = input.slice(0, maxLength);
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  sanitized = sanitized
    .replace(/```/g, "'''")
    .replace(/<<</g, '< < <')
    .replace(/>>>/g, '> > >');

  return sanitized.trim();
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

export function initCompanionAgent(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length < 20 || !apiKey.startsWith('sk-')) {
    logger.warn('ANTHROPIC_API_KEY missing or invalid');
    return;
  }

  initPromise = (async () => {
    agentInstance = createKamiyoAgent({
      name: 'kamiyo-companion',
      apiKey,
      systemPrompt: COMPANION_SYSTEM_PROMPT,
      model: 'claude-sonnet-4-20250514',
      maxTurns: 1,
      timeoutMs: API_TIMEOUT_MS,
    });
    logger.info('Companion agent initialized');
  })();
}

export async function generateAgentResponse(
  userMessage: string,
  context?: string
): Promise<CompanionResponse | null> {
  if (initPromise) await initPromise;
  if (!agentInstance) return null;

  const sanitizedMessage = sanitizeInput(userMessage, MAX_MESSAGE_LENGTH);
  if (!sanitizedMessage) {
    logger.warn('Empty message after sanitization');
    return null;
  }

  const sanitizedContext = context ? sanitizeInput(context, MAX_CONTEXT_LENGTH) : undefined;

  const fullMessage = sanitizedContext
    ? `[CONTEXT START]\n${sanitizedContext}\n[CONTEXT END]\n\n[USER MESSAGE START]\n${sanitizedMessage}\n[USER MESSAGE END]`
    : sanitizedMessage;

  try {
    const result = await agentInstance.run(fullMessage);
    agentInstance.clearHistory();

    return {
      text: truncateAtWord(result.finalResponse, 280),
      tokensUsed: result.tokenUsage,
    };
  } catch (err) {
    const errorType = err instanceof Error ? err.constructor.name : 'Unknown';
    logger.error('Agent response failed', { errorType });
    return null;
  }
}

export function isAgentAvailable(): boolean {
  return agentInstance !== null;
}
