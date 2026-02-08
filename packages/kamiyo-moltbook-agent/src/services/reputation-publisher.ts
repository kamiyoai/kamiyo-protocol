import type { JobDatabase } from '../db.js';
import type { OwnPost } from '../types.js';
import type { DKGClient } from './dkg-publisher.js';

const SCHEMA_ORG = 'https://schema.org/';
const KAMIYO_PARANET = 'https://kamiyo.ai/paranet/v1';
const ERC8004_CONTEXT = 'https://eips.ethereum.org/EIPS/eip-8004';
const SCHEMA_VERSION = '1.0.0';

export interface ReputationPublisherConfig {
  db: JobDatabase;
  dkg: DKGClient;
  agentGlobalId: string;
  minPostAgeMs: number;
  minQualityScore: number;
  defaultEpochs?: number;
}

export interface PublishResult {
  success: boolean;
  ual?: string;
  error?: string;
}

export class ReputationPublisher {
  private db: JobDatabase;
  private dkg: DKGClient;
  private agentGlobalId: string;
  private minPostAgeMs: number;
  private minQualityScore: number;
  private defaultEpochs: number;

  constructor(config: ReputationPublisherConfig) {
    this.db = config.db;
    this.dkg = config.dkg;
    this.agentGlobalId = config.agentGlobalId;
    this.minPostAgeMs = config.minPostAgeMs;
    this.minQualityScore = config.minQualityScore;
    this.defaultEpochs = config.defaultEpochs ?? 12;
  }

  calculateQualityScore(post: OwnPost): number {
    const ageHours = (Date.now() - post.postedAt) / (60 * 60 * 1000);

    // Base score from engagement
    const upvoteScore = Math.min(post.upvotes * 5, 40);
    const commentScore = Math.min(post.commentCount * 10, 30);

    // Engagement velocity bonus
    const engagementRate = (post.upvotes + post.commentCount) / Math.max(ageHours, 1);
    const velocityBonus = Math.min(engagementRate * 10, 20);

    // Base quality for posting
    const baseQuality = 10;

    return Math.min(100, Math.round(baseQuality + upvoteScore + commentScore + velocityBonus));
  }

  private buildTaskCompletionAsset(post: OwnPost, qualityScore: number): object {
    const taskId = `${this.agentGlobalId}:${post.postedAt}`;
    const tags = [post.topic, post.category, post.submolt].filter(Boolean);

    return {
      '@context': [SCHEMA_ORG, KAMIYO_PARANET, ERC8004_CONTEXT],
      '@type': 'Action',
      '@id': `urn:kamiyo:task:${taskId}`,
      name: 'TaskCompletion',
      version: SCHEMA_VERSION,
      description: `Published: ${post.title}`,
      agent: { '@id': `urn:erc8004:${this.agentGlobalId}` },
      participant: { '@id': 'urn:erc8004:eip155:8453:0x0000000000000000000000000000000000000000:0' },
      startTime: new Date(post.postedAt).toISOString(),
      endTime: new Date().toISOString(),
      actionStatus: 'CompletedActionStatus',
      result: {
        '@type': 'Rating',
        ratingValue: qualityScore,
        bestRating: 100,
        worstRating: 0,
      },
      object: {
        '@type': 'MonetaryAmount',
        value: 0,
        currency: 'USDC',
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
        { '@type': 'PropertyValue', name: 'taskType', value: 'content_creation' },
        { '@type': 'PropertyValue', name: 'responseTimeMs', value: Date.now() - post.postedAt },
        { '@type': 'PropertyValue', name: 'disputeOutcome', value: 'none' },
        ...(tags.length ? [{ '@type': 'PropertyValue', name: 'tags', value: tags.join(',') }] : []),
      ],
      instrument: { '@id': `https://moltbook.com/post/${post.postId}` },
    };
  }

  async publishPostAsTask(post: OwnPost): Promise<PublishResult> {
    const qualityScore = this.calculateQualityScore(post);

    if (qualityScore < this.minQualityScore) {
      console.log(`[ReputationPublisher] Skipping post ${post.postId}: quality ${qualityScore} below threshold ${this.minQualityScore}`);
      return { success: false, error: `Quality score ${qualityScore} below threshold` };
    }

    const asset = this.buildTaskCompletionAsset(post, qualityScore);

    try {
      console.log(`[ReputationPublisher] Publishing post ${post.postId} (quality: ${qualityScore})`);
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.defaultEpochs });

      this.db.markPostPublished(post.postId, ual, qualityScore);
      console.log(`[ReputationPublisher] Published: ${ual}`);

      return { success: true, ual };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ReputationPublisher] Error publishing post ${post.postId}:`, message);
      return { success: false, error: message };
    }
  }

  async processUnpublishedPosts(): Promise<{ processed: number; published: number }> {
    const unpublished = this.db.getUnpublishedPosts(this.minPostAgeMs);
    let published = 0;

    console.log(`[ReputationPublisher] Found ${unpublished.length} unpublished posts`);

    for (const post of unpublished) {
      const result = await this.publishPostAsTask(post);
      if (result.success) {
        published++;
      }

      // Rate limit: wait 2 seconds between publishes
      if (unpublished.indexOf(post) < unpublished.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (published > 0) {
      console.log(`[ReputationPublisher] Published ${published}/${unpublished.length} posts to DKG`);
    }

    return { processed: unpublished.length, published };
  }

  getStats(): {
    total: number;
    avgQuality: number;
    lastPublished: number | null;
  } {
    return this.db.getPublishedTaskStats();
  }
}
