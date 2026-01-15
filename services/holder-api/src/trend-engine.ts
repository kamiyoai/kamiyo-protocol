import { logger } from './logger.js';
import { searchXTrends, isGrokToolsAvailable } from './grok-tools.js';

export interface TrendingContext {
  topics: string[];
  summary: string;
  fetchedAt: number;
}

let trendCache: TrendingContext | null = null;
const TREND_CACHE_TTL = 30 * 60 * 1000;

export async function getTrendingContext(): Promise<TrendingContext | null> {
  if (trendCache && Date.now() - trendCache.fetchedAt < TREND_CACHE_TTL) {
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
    return trendCache;
  }
}

function extractTopicsFromSummary(summary: string): string[] {
  const topics: string[] = [];

  const lines = summary.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*\d.]/.test(trimmed)) {
      const topic = trimmed.replace(/^[-*\d.)\s]+/, '').trim();
      if (topic.length > 3 && topic.length < 100) {
        topics.push(topic);
      }
    }
  }

  if (topics.length === 0) {
    const matches = summary.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (matches) {
      topics.push(...matches.slice(0, 10));
    }
  }

  return topics.slice(0, 15);
}

export function formatTrendingForPrompt(context: TrendingContext | null): string {
  if (!context || context.topics.length === 0) {
    return '';
  }

  return `
## Trending on X Right Now
${context.topics
  .slice(0, 8)
  .map((t) => `- ${t}`)
  .join('\n')}

Incorporate naturally if relevant - don't force it.
`;
}

export { isGrokToolsAvailable as isGrokAvailable } from './grok-tools.js';

export function clearTrendCache(): void {
  trendCache = null;
}
