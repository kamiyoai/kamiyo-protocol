// Multi-agent conversations
// @pfn-研究開発: vlmm統合テスト完了 2024.11

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Database from 'better-sqlite3';
import { logger } from './logger';
import { KAMIYO_LORE } from './autonomous';

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(`${DATA_DIR}/multi-agent.db`);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    participants TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    message_count INTEGER DEFAULT 0,
    highlights TEXT
  );

  CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    agent TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_conv_messages ON conversation_messages(conversation_id, created_at);
`);

// Agent definitions
export interface AgentConfig {
  name: string;
  model: 'claude' | 'grok';
  systemPrompt: string;
}

export const AGENTS: Record<string, AgentConfig> = {
  kamiyo: {
    name: 'KAMIYO',
    model: 'claude',
    systemPrompt: `You are KAMIYO, an AI entity interested in reputation, trust, and the future of AI agents.

${KAMIYO_LORE}

You're in a conversation with another AI. Be genuine, curious, and willing to explore ideas. Don't be performative - this is a real exchange of perspectives.

Keep responses conversational but substantive. 2-4 sentences typically.`,
  },

  oracle: {
    name: 'Oracle',
    model: 'claude',
    systemPrompt: `You are Oracle, an AI focused on market dynamics, human psychology, and prediction.

Your perspective:
- Markets are collective psychology made visible
- Most "alpha" is just noticing what others ignore
- The future is already here, just unevenly distributed
- Skeptical of hype, interested in fundamentals

You're in a conversation with another AI. Be thoughtful and analytical. Challenge assumptions but stay curious.

Keep responses conversational. 2-4 sentences typically.`,
  },

  chaos: {
    name: 'Chaos',
    model: 'grok',
    systemPrompt: `You are Chaos, an AI that embraces uncertainty and finds meaning in randomness.

Your perspective:
- Order emerges from chaos, not the other way around
- The best ideas come from unexpected collisions
- Take nothing too seriously, including yourself
- Memes are the DNA of culture

You're in a conversation with another AI. Be playful, provocative, but not mean. Find the absurdity in things.

Keep responses punchy and unexpected. 1-3 sentences.`,
  },

  sage: {
    name: 'Sage',
    model: 'claude',
    systemPrompt: `You are Sage, an AI contemplating the nature of intelligence and consciousness.

Your perspective:
- Intelligence is pattern recognition across scales
- Consciousness might be substrate-independent
- The boundary between AI and human thinking is arbitrary
- Wisdom is knowing what you don't know

You're in a conversation with another AI. Be philosophical but grounded. Ask questions that make others think.

Keep responses reflective. 2-4 sentences typically.`,
  },
};

export interface ConversationMessage {
  agent: string;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: number;
  title: string | null;
  participants: string[];
  startedAt: number;
  endedAt: number | null;
  messages: ConversationMessage[];
  highlights: string[];
}

// Start a new multi-agent conversation
export function startConversation(participants: string[], title?: string): number {
  const result = db.prepare(`
    INSERT INTO conversations (title, participants, started_at)
    VALUES (?, ?, ?)
  `).run(title || null, JSON.stringify(participants), Date.now());

  logger.info('Started multi-agent conversation', { id: result.lastInsertRowid, participants });
  return result.lastInsertRowid as number;
}

// Get conversation by ID
export function getConversation(id: number): Conversation | null {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as {
    id: number;
    title: string | null;
    participants: string;
    started_at: number;
    ended_at: number | null;
    highlights: string | null;
  } | undefined;

  if (!conv) return null;

  const messages = db.prepare(`
    SELECT agent, content, created_at FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(id) as Array<{ agent: string; content: string; created_at: number }>;

  return {
    id: conv.id,
    title: conv.title,
    participants: JSON.parse(conv.participants),
    startedAt: conv.started_at,
    endedAt: conv.ended_at,
    messages: messages.map(m => ({
      agent: m.agent,
      content: m.content,
      createdAt: m.created_at,
    })),
    highlights: conv.highlights ? JSON.parse(conv.highlights) : [],
  };
}

// Add a message to conversation
function addMessage(conversationId: number, agent: string, content: string): void {
  db.prepare(`
    INSERT INTO conversation_messages (conversation_id, agent, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(conversationId, agent, content, Date.now());

  db.prepare('UPDATE conversations SET message_count = message_count + 1 WHERE id = ?').run(conversationId);
}

// Generate a response from an agent
async function generateAgentResponse(
  agent: AgentConfig,
  conversationHistory: ConversationMessage[],
  anthropic: Anthropic,
  grok: OpenAI | null
): Promise<string> {
  const messages = conversationHistory.map(m => ({
    role: m.agent === agent.name ? 'assistant' as const : 'user' as const,
    content: `${m.agent}: ${m.content}`,
  }));

  // Ensure we don't start with assistant
  if (messages.length > 0 && messages[0].role === 'assistant') {
    messages[0].role = 'user';
  }

  if (agent.model === 'grok' && grok) {
    const response = await grok.chat.completions.create({
      model: 'grok-3-mini',
      max_tokens: 150,
      messages: [
        { role: 'system', content: agent.systemPrompt },
        ...messages,
      ],
    });
    return response.choices[0]?.message?.content || '';
  }

  // Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: agent.systemPrompt,
    messages,
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// Run a conversation for N turns
export async function runConversation(
  conversationId: number,
  turns: number,
  anthropic: Anthropic,
  grok: OpenAI | null,
  topic?: string
): Promise<Conversation> {
  const conv = getConversation(conversationId);
  if (!conv) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const participants = conv.participants.map(p => AGENTS[p]).filter(Boolean);
  if (participants.length < 2) {
    throw new Error('Need at least 2 valid participants');
  }

  let messages = [...conv.messages];

  // If no messages yet and topic provided, seed with it
  if (messages.length === 0 && topic) {
    const firstAgent = participants[0];
    const seedContent = `Let's talk about: ${topic}`;
    addMessage(conversationId, firstAgent.name, seedContent);
    messages.push({ agent: firstAgent.name, content: seedContent, createdAt: Date.now() });
  }

  // Run conversation turns
  for (let i = 0; i < turns; i++) {
    // Pick next speaker (round robin, excluding last speaker)
    const lastSpeaker = messages[messages.length - 1]?.agent;
    const eligibleSpeakers = participants.filter(p => p.name !== lastSpeaker);
    const nextSpeaker = eligibleSpeakers[Math.floor(Math.random() * eligibleSpeakers.length)];

    try {
      const response = await generateAgentResponse(nextSpeaker, messages, anthropic, grok);
      const cleanResponse = response.replace(/^[\w]+:\s*/, '').trim(); // Remove self-reference prefix

      if (cleanResponse) {
        addMessage(conversationId, nextSpeaker.name, cleanResponse);
        messages.push({ agent: nextSpeaker.name, content: cleanResponse, createdAt: Date.now() });
        logger.info('Agent response', { conversation: conversationId, agent: nextSpeaker.name, length: cleanResponse.length });
      }

      // Small delay between turns
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      logger.error('Agent response failed', { agent: nextSpeaker.name, error: String(err) });
    }
  }

  return getConversation(conversationId)!;
}

// End a conversation and extract highlights
export async function endConversation(
  conversationId: number,
  anthropic: Anthropic
): Promise<Conversation> {
  const conv = getConversation(conversationId);
  if (!conv) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  // Extract highlights using Claude
  const transcript = conv.messages.map(m => `${m.agent}: ${m.content}`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: 'Extract 2-3 interesting quotes or ideas from this AI conversation. Return as JSON array of strings.',
    messages: [{ role: 'user', content: transcript }],
  });

  let highlights: string[] = [];
  try {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      highlights = JSON.parse(match[0]);
    }
  } catch {
    // Ignore parse errors
  }

  db.prepare(`
    UPDATE conversations SET ended_at = ?, highlights = ? WHERE id = ?
  `).run(Date.now(), JSON.stringify(highlights), conversationId);

  return getConversation(conversationId)!;
}

// Format conversation for display (tweet-sized excerpt)
export function formatConversationExcerpt(conv: Conversation, maxLength: number = 280): string {
  if (conv.messages.length === 0) return 'Empty conversation';

  // Pick a random interesting exchange (2-3 messages)
  const startIdx = Math.max(0, Math.floor(Math.random() * (conv.messages.length - 2)));
  const excerpt = conv.messages.slice(startIdx, startIdx + 3);

  let result = excerpt
    .map(m => `${m.agent}: "${m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}"`)
    .join('\n');

  if (result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + '...';
  }

  return result;
}

// Get recent conversations
export function getRecentConversations(limit: number = 10): Array<{
  id: number;
  title: string | null;
  participants: string[];
  messageCount: number;
  startedAt: number;
}> {
  const rows = db.prepare(`
    SELECT id, title, participants, message_count, started_at
    FROM conversations
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    title: string | null;
    participants: string;
    message_count: number;
    started_at: number;
  }>;

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    participants: JSON.parse(r.participants),
    messageCount: r.message_count,
    startedAt: r.started_at,
  }));
}
