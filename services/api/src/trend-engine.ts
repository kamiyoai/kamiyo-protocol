// Trend engine via Grok

import { logger } from './logger';
import { searchXTrends, isGrokToolsAvailable } from './grok-tools';

export interface TrendingContext {
  topics: string[];
  summary: string;
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

  if (!isGrokToolsAvailable()) {
    logger.warn('Grok client not available for trend fetching');
    return null;
  }

  try {
    const content = await searchXTrends([
      'AI and technology',
      'Crypto and blockchain',
      'Markets and finance',
    ]);

    if (!content) {
      logger.warn('No trend data returned from Grok');
      return trendCache;
    }

    // Extract topics from response
    const topics = extractTopicsFromSummary(content);

    trendCache = {
      topics,
      summary: content,
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

// Format trending context for post generation prompt
export function formatTrendingForPrompt(context: TrendingContext | null): string {
  if (!context || context.topics.length === 0) {
    return '';
  }

  return `
## Trending on X Right Now
${context.topics.slice(0, 8).map(t => `- ${t}`).join('\n')}

Incorporate naturally if relevant - don't force it.
`;
}

// Re-export for convenience
export { isGrokToolsAvailable as isGrokAvailable } from './grok-tools';

// Clear trend cache (for testing)
export function clearTrendCache(): void {
  trendCache = null;
}
