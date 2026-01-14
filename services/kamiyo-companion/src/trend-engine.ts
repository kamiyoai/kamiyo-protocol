/**
 * Trend engine powered by Grok Live Search
 * Fetches real-time trending topics from X and news
 */

import OpenAI from 'openai';
import { logger } from './logger';

const XAI_API_KEY = process.env.XAI_API_KEY;

// Grok client
const grokClient = XAI_API_KEY ? new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
}) : null;

export interface TrendingContext {
  topics: string[];
  summary: string;
  citations: string[];
  fetchedAt: number;
}

// Cache trending context (refresh every 30 min)
let trendCache: TrendingContext | null = null;
const TREND_CACHE_TTL = 30 * 60 * 1000;

// Fetch trending topics from Grok
export async function getTrendingContext(): Promise<TrendingContext | null> {
  // Return cached if fresh
  if (trendCache && (Date.now() - trendCache.fetchedAt) < TREND_CACHE_TTL) {
    return trendCache;
  }

  if (!grokClient) {
    logger.warn('Grok client not available for trend fetching');
    return null;
  }

  try {
    const response = await grokClient.chat.completions.create({
      model: 'grok-4',
      messages: [{
        role: 'user',
        content: `What are the top trending topics on X right now in these categories:
1. AI and technology
2. Crypto and blockchain
3. Markets and finance

List the specific topics people are discussing, not generic categories.
Be concise - just list the trending topics with brief context.`,
      }],
      // @ts-expect-error - xAI-specific parameter
      search_parameters: {
        mode: 'on',
        sources: [
          { type: 'x' },
          { type: 'news' },
        ],
        max_search_results: 30,
        return_citations: true,
      },
    });

    const content = response.choices[0]?.message?.content || '';

    // Extract topics from response
    const topics = extractTopicsFromSummary(content);

    // Extract citations if available
    // @ts-expect-error - xAI-specific response field
    const citations = response.citations || [];

    trendCache = {
      topics,
      summary: content,
      citations: Array.isArray(citations) ? citations : [],
      fetchedAt: Date.now(),
    };

    logger.info('Fetched trending context', { topicCount: topics.length });
    return trendCache;
  } catch (err) {
    logger.error('Failed to fetch trending context', { error: String(err) });
    return trendCache; // Return stale cache if available
  }
}

// Extract topic strings from Grok's summary
function extractTopicsFromSummary(summary: string): string[] {
  const topics: string[] = [];

  // Look for bullet points or numbered items
  const lines = summary.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines starting with -, *, or numbers
    if (/^[-*\d.]/.test(trimmed)) {
      // Extract the topic (remove prefix)
      const topic = trimmed.replace(/^[-*\d.)\s]+/, '').trim();
      if (topic.length > 3 && topic.length < 100) {
        topics.push(topic);
      }
    }
  }

  // If no bullet points, try to extract key phrases
  if (topics.length === 0) {
    // Simple extraction of capitalized phrases
    const matches = summary.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (matches) {
      topics.push(...matches.slice(0, 10));
    }
  }

  return topics.slice(0, 15); // Max 15 topics
}

// Get trending topics specifically about crypto
export async function getCryptoTrends(): Promise<string[] | null> {
  if (!grokClient) return null;

  try {
    const response = await grokClient.chat.completions.create({
      model: 'grok-4',
      messages: [{
        role: 'user',
        content: `What are crypto Twitter talking about right now? Focus on:
- Token movements and price action
- Protocol updates and launches
- Narratives and memes
- Whale activity

List the specific topics trending in crypto Twitter.`,
      }],
      // @ts-expect-error - xAI-specific parameter
      search_parameters: {
        mode: 'on',
        sources: [{ type: 'x' }],
        max_search_results: 20,
      },
    });

    const content = response.choices[0]?.message?.content || '';
    return extractTopicsFromSummary(content);
  } catch (err) {
    logger.error('Failed to fetch crypto trends', { error: String(err) });
    return null;
  }
}

// Search for specific topic context
export async function searchTopic(topic: string): Promise<string | null> {
  if (!grokClient) return null;

  try {
    const response = await grokClient.chat.completions.create({
      model: 'grok-4',
      messages: [{
        role: 'user',
        content: `What are people on X saying about "${topic}" right now? Summarize the main perspectives and any notable tweets.`,
      }],
      // @ts-expect-error - xAI-specific parameter
      search_parameters: {
        mode: 'on',
        sources: [{ type: 'x' }],
        max_search_results: 15,
      },
    });

    return response.choices[0]?.message?.content || null;
  } catch (err) {
    logger.error('Failed to search topic', { topic, error: String(err) });
    return null;
  }
}

// Format trending context for post generation prompt
export function formatTrendingForPrompt(context: TrendingContext | null): string {
  if (!context || context.topics.length === 0) {
    return '';
  }

  return `
## Trending on X Right Now
${context.topics.slice(0, 8).map(t => `- ${t}`).join('\n')}

Consider naturally incorporating one of these if relevant to your thought.
Don't force it - only mention if you have something genuine to say.
`;
}

// Check if Grok is available
export function isGrokAvailable(): boolean {
  return !!grokClient;
}

// Clear trend cache (for testing)
export function clearTrendCache(): void {
  trendCache = null;
}
