/**
 * Growth tracker
 * Tracks post performance and learns what works
 */

import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';
import { db } from './clients';

// Initialize performance tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS post_performance (
    id INTEGER PRIMARY KEY,
    tweet_id TEXT UNIQUE,
    post_type TEXT,
    target_tweet_id TEXT,
    content TEXT,
    has_image INTEGER,
    posted_at INTEGER,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    last_sampled INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_post_performance_posted ON post_performance(posted_at);
  CREATE INDEX IF NOT EXISTS idx_post_performance_type ON post_performance(post_type);
  CREATE INDEX IF NOT EXISTS idx_post_performance_sampled ON post_performance(last_sampled);
`);

export interface PostPerformance {
  id: number;
  tweet_id: string;
  post_type: 'original' | 'reply' | 'quote';
  target_tweet_id: string | null;
  content: string;
  has_image: boolean;
  posted_at: number;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  last_sampled: number;
}

export interface PerformanceInsights {
  byType: Array<{ post_type: string; avg_score: number; count: number }>;
  byImage: Array<{ has_image: number; avg_score: number; count: number }>;
  bestPerforming: PostPerformance[];
  averageEngagement: number;
}

// Track a new post
export function trackPost(
  tweetId: string,
  postType: 'original' | 'reply' | 'quote',
  content: string,
  hasImage: boolean,
  targetTweetId?: string
): void {
  db.prepare(`
    INSERT OR REPLACE INTO post_performance (tweet_id, post_type, target_tweet_id, content, has_image, posted_at, last_sampled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tweetId, postType, targetTweetId || null, content, hasImage ? 1 : 0, Date.now(), 0);

  logger.debug('Tracking post', { tweetId, postType, hasImage });
}

// Sample metrics for tracked posts
export async function samplePostPerformance(twitter: TwitterApi): Promise<void> {
  // Get posts from last 7 days that haven't been sampled in 1 hour
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const sampleCutoff = Date.now() - (60 * 60 * 1000);

  const posts = db.prepare(`
    SELECT * FROM post_performance
    WHERE posted_at > ?
    AND (last_sampled IS NULL OR last_sampled < ?)
    ORDER BY posted_at DESC
    LIMIT 20
  `).all(cutoff, sampleCutoff) as PostPerformance[];

  let sampled = 0;

  for (const post of posts) {
    try {
      const tweet = await twitter.v2.singleTweet(post.tweet_id, {
        'tweet.fields': ['public_metrics'],
      });

      const metrics = tweet.data?.public_metrics;
      if (metrics) {
        db.prepare(`
          UPDATE post_performance SET
            likes = ?,
            retweets = ?,
            replies = ?,
            impressions = ?,
            last_sampled = ?
          WHERE id = ?
        `).run(
          metrics.like_count || 0,
          metrics.retweet_count || 0,
          metrics.reply_count || 0,
          metrics.impression_count || 0,
          Date.now(),
          post.id
        );
        sampled++;
      }

      // Rate limit protection
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      // Tweet may be deleted or private
      logger.debug('Could not sample post', { tweetId: post.tweet_id, error: String(err) });
    }
  }

  if (sampled > 0) {
    logger.info('Sampled post performance', { count: sampled });
  }
}

// Calculate engagement score (Twitter algorithm weights)
function calculateScore(post: PostPerformance): number {
  return post.likes + (post.retweets * 20) + (post.replies * 13.5);
}

// Get performance insights
export function getPerformanceInsights(): PerformanceInsights {
  // Performance by post type
  const byType = db.prepare(`
    SELECT post_type,
           AVG(likes + retweets * 20 + replies * 13.5) as avg_score,
           COUNT(*) as count
    FROM post_performance
    WHERE last_sampled > 0
    GROUP BY post_type
  `).all() as Array<{ post_type: string; avg_score: number; count: number }>;

  // Performance by image presence
  const byImage = db.prepare(`
    SELECT has_image,
           AVG(likes + retweets * 20 + replies * 13.5) as avg_score,
           COUNT(*) as count
    FROM post_performance
    WHERE last_sampled > 0
    GROUP BY has_image
  `).all() as Array<{ has_image: number; avg_score: number; count: number }>;

  // Best performing posts
  const bestPerforming = db.prepare(`
    SELECT *
    FROM post_performance
    WHERE last_sampled > 0
    ORDER BY (likes + retweets * 20 + replies * 13.5) DESC
    LIMIT 10
  `).all() as PostPerformance[];

  // Average engagement
  const avgResult = db.prepare(`
    SELECT AVG(likes + retweets * 20 + replies * 13.5) as avg
    FROM post_performance
    WHERE last_sampled > 0
  `).get() as { avg: number } | undefined;

  return {
    byType,
    byImage,
    bestPerforming,
    averageEngagement: avgResult?.avg || 0,
  };
}

// Get recommendations based on performance data
export function getContentRecommendations(): string[] {
  const insights = getPerformanceInsights();
  const recommendations: string[] = [];

  // Check if images help
  const withImage = insights.byImage.find(b => b.has_image === 1);
  const withoutImage = insights.byImage.find(b => b.has_image === 0);

  if (withImage && withoutImage && withImage.avg_score > withoutImage.avg_score * 1.2) {
    recommendations.push('Posts with images perform 20%+ better - include more images');
  } else if (withImage && withoutImage && withoutImage.avg_score > withImage.avg_score * 1.2) {
    recommendations.push('Text-only posts performing better - reduce image frequency');
  }

  // Check post type performance
  const original = insights.byType.find(t => t.post_type === 'original');
  const reply = insights.byType.find(t => t.post_type === 'reply');

  if (reply && original && reply.avg_score > original.avg_score * 1.5) {
    recommendations.push('Strategic replies outperforming original posts - increase reply activity');
  }

  // Identify best performing content patterns
  if (insights.bestPerforming.length >= 5) {
    // Look for common patterns in top posts
    const topContent = insights.bestPerforming.slice(0, 5).map(p => p.content);
    const hasQuestion = topContent.filter(c => c.includes('?')).length;
    if (hasQuestion >= 3) {
      recommendations.push('Questions performing well - include more thought-provoking questions');
    }
  }

  return recommendations;
}

// Start performance tracking loop
export async function startPerformanceTracking(twitter: TwitterApi): Promise<void> {
  logger.info('Starting performance tracking...');

  // Sample every hour
  const runSampling = async () => {
    await samplePostPerformance(twitter);
    setTimeout(runSampling, 60 * 60 * 1000);
  };

  // Start after 10 minutes
  setTimeout(runSampling, 10 * 60 * 1000);

  // Log insights daily
  setInterval(() => {
    const insights = getPerformanceInsights();
    const recommendations = getContentRecommendations();

    logger.info('Performance insights', {
      avgEngagement: insights.averageEngagement.toFixed(1),
      totalTracked: insights.byType.reduce((sum, t) => sum + t.count, 0),
      recommendations,
    });
  }, 24 * 60 * 60 * 1000);
}

// Cleanup old performance data (keep 30 days)
export function cleanupOldPerformance(): void {
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const result = db.prepare('DELETE FROM post_performance WHERE posted_at < ?').run(cutoff);
  if (result.changes > 0) {
    logger.info('Cleaned up old performance data', { deleted: result.changes });
  }
}

// Get simple stats for logging
export function getGrowthStats(): { tracked: number; avgScore: number; bestScore: number } {
  const result = db.prepare(`
    SELECT
      COUNT(*) as tracked,
      AVG(likes + retweets * 20 + replies * 13.5) as avg_score,
      MAX(likes + retweets * 20 + replies * 13.5) as best_score
    FROM post_performance
    WHERE last_sampled > 0
  `).get() as { tracked: number; avg_score: number | null; best_score: number | null };

  return {
    tracked: result.tracked,
    avgScore: result.avg_score || 0,
    bestScore: result.best_score || 0,
  };
}
