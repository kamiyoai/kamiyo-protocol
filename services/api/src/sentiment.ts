// Sentiment tracking

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { logger } from './logger';

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(`${DATA_DIR}/sentiment.db`);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sentiment_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    sentiment REAL NOT NULL,
    topics TEXT,
    sampled_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sentiment_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    period_start INTEGER NOT NULL,
    avg_sentiment REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    top_topics TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sentiment_time ON sentiment_samples(sampled_at);
  CREATE INDEX IF NOT EXISTS idx_aggregate_period ON sentiment_aggregates(period_start);
`);

export interface SentimentSample {
  source: string;
  content: string;
  sentiment: number; // -1 to 1
  topics: string[];
  sampledAt: number;
}

export interface SentimentTrend {
  current: number;
  hourAgo: number;
  dayAgo: number;
  weekAgo: number;
  trend: 'improving' | 'declining' | 'stable';
  topTopics: string[];
}

// Analyze sentiment of a piece of text
export async function analyzeSentiment(
  anthropic: Anthropic,
  text: string,
  source: string = 'unknown'
): Promise<SentimentSample> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `Analyze the sentiment and topics of this crypto/KAMIYO-related text.
Respond in JSON format ONLY:
{"sentiment": <-1 to 1>, "topics": ["topic1", "topic2"]}

-1 = very negative/bearish
0 = neutral
1 = very positive/bullish

Topics should be 1-3 key themes mentioned (e.g., "price", "development", "community", "fud", "alpha")`,
      messages: [{ role: 'user', content: text }],
    });

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const sentiment = Math.max(-1, Math.min(1, parsed.sentiment || 0));
    const topics = Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [];

    const sample: SentimentSample = {
      source,
      content: text.slice(0, 500),
      sentiment,
      topics,
      sampledAt: Date.now(),
    };

    // Store in database
    db.prepare(`
      INSERT INTO sentiment_samples (source, content, sentiment, topics, sampled_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(source, sample.content, sentiment, JSON.stringify(topics), sample.sampledAt);

    return sample;
  } catch (err) {
    logger.warn('Sentiment analysis failed', { error: String(err) });
    return {
      source,
      content: text.slice(0, 500),
      sentiment: 0,
      topics: [],
      sampledAt: Date.now(),
    };
  }
}

// Get sentiment at a specific time range
function getSentimentAtTime(startTime: number, endTime: number): { avg: number; count: number; topics: string[] } {
  const rows = db.prepare(`
    SELECT sentiment, topics FROM sentiment_samples
    WHERE sampled_at >= ? AND sampled_at < ?
  `).all(startTime, endTime) as Array<{ sentiment: number; topics: string }>;

  if (rows.length === 0) {
    return { avg: 0, count: 0, topics: [] };
  }

  const total = rows.reduce((sum, r) => sum + r.sentiment, 0);
  const avg = total / rows.length;

  // Aggregate topics
  const topicCounts: Record<string, number> = {};
  for (const row of rows) {
    const topics = JSON.parse(row.topics || '[]');
    for (const topic of topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  return { avg, count: rows.length, topics: sortedTopics };
}

// Get current sentiment trend
export function getSentimentTrend(): SentimentTrend {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const current = getSentimentAtTime(hourAgo, now);
  const previousHour = getSentimentAtTime(hourAgo - 60 * 60 * 1000, hourAgo);
  const yesterday = getSentimentAtTime(dayAgo, dayAgo + 60 * 60 * 1000);
  const lastWeek = getSentimentAtTime(weekAgo, weekAgo + 60 * 60 * 1000);

  // Determine trend
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (current.avg > previousHour.avg + 0.1) {
    trend = 'improving';
  } else if (current.avg < previousHour.avg - 0.1) {
    trend = 'declining';
  }

  return {
    current: current.avg,
    hourAgo: previousHour.avg,
    dayAgo: yesterday.avg,
    weekAgo: lastWeek.avg,
    trend,
    topTopics: current.topics,
  };
}

// Format sentiment for display
export function formatSentimentTrend(trend: SentimentTrend): string {
  const sentimentLabel = (s: number): string => {
    if (s > 0.5) return 'Very Bullish';
    if (s > 0.2) return 'Bullish';
    if (s > -0.2) return 'Neutral';
    if (s > -0.5) return 'Bearish';
    return 'Very Bearish';
  };

  const arrow = trend.trend === 'improving' ? '^' : trend.trend === 'declining' ? 'v' : '-';

  let result = `Sentiment: ${sentimentLabel(trend.current)} (${trend.current.toFixed(2)}) ${arrow}`;

  if (trend.topTopics.length > 0) {
    result += `\nHot topics: ${trend.topTopics.join(', ')}`;
  }

  return result;
}

// Batch analyze multiple texts (for efficiency)
export async function batchAnalyzeSentiment(
  anthropic: Anthropic,
  texts: Array<{ text: string; source: string }>
): Promise<SentimentSample[]> {
  const results: SentimentSample[] = [];

  // Process in batches of 5
  for (let i = 0; i < texts.length; i += 5) {
    const batch = texts.slice(i, i + 5);
    const promises = batch.map(({ text, source }) => analyzeSentiment(anthropic, text, source));
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + 5 < texts.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

// Aggregate and store hourly summaries (call periodically)
export function aggregateHourlySentiment(): void {
  const now = Date.now();
  const hourStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
  const hourEnd = hourStart + 60 * 60 * 1000;

  // Check if we already have this hour
  const existing = db.prepare(
    'SELECT id FROM sentiment_aggregates WHERE period = ? AND period_start = ?'
  ).get('hourly', hourStart);

  if (existing) return;

  const data = getSentimentAtTime(hourStart - 60 * 60 * 1000, hourStart);
  if (data.count === 0) return;

  db.prepare(`
    INSERT INTO sentiment_aggregates (period, period_start, avg_sentiment, sample_count, top_topics, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('hourly', hourStart, data.avg, data.count, JSON.stringify(data.topics), now);

  logger.info('Aggregated hourly sentiment', { periodStart: hourStart, avg: data.avg, count: data.count });
}

// Cleanup old samples (keep 7 days)
export function cleanupOldSentiment(): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result = db.prepare('DELETE FROM sentiment_samples WHERE sampled_at < ?').run(cutoff);
  if (result.changes > 0) {
    logger.info('Cleaned up old sentiment samples', { deleted: result.changes });
  }
}
