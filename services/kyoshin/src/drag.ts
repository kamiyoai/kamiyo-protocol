/**
 * dRAG - vector search with DKG-grounded results.
 */

import { createLogger, getMetrics, LRUCache, withRetry } from './lib';
import type { DKGMemory, SearchResult, MemoryType } from './dkg-memory';

const log = createLogger('kyoshin:drag');
const metrics = getMetrics();

/**
 * Embedding vector for semantic similarity search
 */
export interface EmbeddingVector {
  vector: number[];
  ual: string;
  content: string;
  type: MemoryType;
  timestamp: Date;
  topics: string[];
}

/**
 * Semantic search result with DKG grounding
 */
export interface SemanticSearchResult {
  ual: string;
  content: string;
  type: MemoryType;
  similarity: number;
  timestamp: Date;
  topics: string[];
  dkgVerified: boolean;
}

/**
 * dRAG configuration
 */
export interface DRAGConfig {
  dkgMemory: DKGMemory;
  embeddingDimension?: number;
  maxVectors?: number;
  similarityThreshold?: number;
}

/**
 * Simple TF-IDF based embedding generator
 * For production, this would use HuggingFace sentence-transformers
 */
class SimpleEmbedding {
  private dimension: number;
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documentCount = 0;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  /**
   * Generate an embedding vector for text
   */
  embed(text: string): number[] {
    const tokens = this.tokenize(text);
    const tf = this.computeTF(tokens);

    // Build dense vector using hashing trick for fixed dimension
    const vector = new Array(this.dimension).fill(0);

    for (const [token, freq] of tf) {
      const idf = this.idf.get(token) || Math.log(this.documentCount + 1);
      const tfidf = freq * idf;
      const hash = this.hashToken(token);
      const index = Math.abs(hash) % this.dimension;
      vector[index] += tfidf;
    }

    // L2 normalize
    return this.normalize(vector);
  }

  /**
   * Add document to IDF computation
   */
  addDocument(text: string): void {
    const tokens = new Set(this.tokenize(text));
    this.documentCount++;

    for (const token of tokens) {
      const count = (this.vocabulary.get(token) || 0) + 1;
      this.vocabulary.set(token, count);
      this.idf.set(token, Math.log(this.documentCount / count));
    }
  }

  /**
   * Compute cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private computeTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    // Normalize by document length
    const maxFreq = Math.max(...tf.values());
    for (const [token, freq] of tf) {
      tf.set(token, freq / maxFreq);
    }
    return tf;
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map((v) => v / norm);
  }
}

/**
 * dRAG - Decentralized Retrieval-Augmented Generation
 *
 * Combines semantic vector search with DKG-backed verifiable storage.
 */
export class NikaDRAG {
  private config: DRAGConfig;
  private embedding: SimpleEmbedding;
  private vectors: EmbeddingVector[] = [];
  private vectorCache: LRUCache<number[]>;
  private initialized = false;

  constructor(config: DRAGConfig) {
    this.config = {
      embeddingDimension: 384,
      maxVectors: 10000,
      similarityThreshold: 0.3,
      ...config,
    };

    this.embedding = new SimpleEmbedding(this.config.embeddingDimension);
    this.vectorCache = new LRUCache<number[]>({
      maxSize: 5000,
      ttlMs: 60 * 60 * 1000, // 1 hour
    });

    log.info('dRAG initialized', {
      dimension: this.config.embeddingDimension,
      maxVectors: this.config.maxVectors,
    });
  }

  /**
   * Initialize dRAG by loading recent memories from DKG
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('Initializing dRAG from DKG');
    const startTime = Date.now();

    try {
      // Load recent memories from DKG
      const recentMemories = await this.config.dkgMemory.searchRecent({
        limit: this.config.maxVectors,
      });

      for (const memory of recentMemories) {
        this.indexMemory(memory);
      }

      this.initialized = true;
      metrics.incrementCounter('drag_init_success');
      log.info('dRAG initialized', {
        vectorCount: this.vectors.length,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      metrics.incrementCounter('drag_init_error');
      log.error('dRAG initialization failed', { error: String(error) });
      // Continue without pre-loaded vectors
      this.initialized = true;
    }
  }

  /**
   * Index a memory for semantic search
   */
  indexMemory(memory: SearchResult): void {
    // Add to embedding model's vocabulary
    this.embedding.addDocument(memory.content);

    // Generate embedding
    const vector = this.embedding.embed(memory.content);
    this.vectorCache.set(memory.ual, vector);

    // Store in vector index
    this.vectors.push({
      vector,
      ual: memory.ual,
      content: memory.content,
      type: memory.metadata.type,
      timestamp: new Date(memory.metadata.timestamp),
      topics: memory.metadata.topics || [],
    });

    // Enforce max size
    if (this.vectors.length > (this.config.maxVectors || 10000)) {
      // Remove oldest
      this.vectors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      this.vectors = this.vectors.slice(0, this.config.maxVectors);
    }

    metrics.incrementCounter('drag_indexed');
  }

  /**
   * Index new content with DKG storage
   */
  async indexAndStore(params: {
    content: string;
    type: MemoryType;
    topics?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const startTime = Date.now();

    try {
      // Store in DKG first
      let ual: string | null = null;

      switch (params.type) {
        case 'tweet':
          ual = await this.config.dkgMemory.storeTweet({
            content: params.content,
            topics: params.topics,
          });
          break;
        case 'observation':
          ual = await this.config.dkgMemory.storeObservation({
            content: params.content,
            topics: params.topics,
            confidence: (params.metadata?.confidence as number) || 0.8,
            source: params.metadata?.source as string,
          });
          break;
        default:
          log.warn('Unknown memory type for indexing', { type: params.type });
          return null;
      }

      if (ual) {
        // Index for semantic search
        this.indexMemory({
          ual,
          content: params.content,
          score: 1.0,
          metadata: {
            type: params.type,
            timestamp: new Date().toISOString(),
            topics: params.topics,
          },
        });

        metrics.recordHistogram('drag_index_store_ms', Date.now() - startTime);
        log.debug('Indexed and stored', { ual, type: params.type });
      }

      return ual;
    } catch (error) {
      metrics.incrementCounter('drag_index_store_error');
      log.error('Failed to index and store', { error: String(error) });
      return null;
    }
  }

  /**
   * Semantic search with DKG grounding
   *
   * Returns results sorted by semantic similarity, with UAL verification
   */
  async search(query: string, options?: {
    limit?: number;
    type?: MemoryType;
    minSimilarity?: number;
    verifyDKG?: boolean;
  }): Promise<SemanticSearchResult[]> {
    const startTime = Date.now();
    const limit = options?.limit || 10;
    const minSimilarity = options?.minSimilarity || this.config.similarityThreshold || 0.3;
    const verifyDKG = options?.verifyDKG ?? true;

    // Generate query embedding
    const queryVector = this.embedding.embed(query);

    // Find similar vectors
    const candidates: Array<{ vector: EmbeddingVector; similarity: number }> = [];

    for (const vec of this.vectors) {
      // Type filter
      if (options?.type && vec.type !== options.type) continue;

      const similarity = this.embedding.cosineSimilarity(queryVector, vec.vector);
      if (similarity >= minSimilarity) {
        candidates.push({ vector: vec, similarity });
      }
    }

    // Sort by similarity
    candidates.sort((a, b) => b.similarity - a.similarity);
    const topCandidates = candidates.slice(0, limit);

    // Verify against DKG if requested
    const results: SemanticSearchResult[] = [];

    for (const { vector, similarity } of topCandidates) {
      let dkgVerified = !verifyDKG; // Skip verification if not requested

      if (verifyDKG) {
        try {
          const asset = await this.config.dkgMemory.get(vector.ual);
          dkgVerified = !!asset;
          if (!dkgVerified) {
            log.debug('DKG verification failed for UAL', { ual: vector.ual });
            metrics.incrementCounter('drag_dkg_verification_failed');
          }
        } catch {
          dkgVerified = false;
        }
      }

      results.push({
        ual: vector.ual,
        content: vector.content,
        type: vector.type,
        similarity,
        timestamp: vector.timestamp,
        topics: vector.topics,
        dkgVerified,
      });
    }

    metrics.recordHistogram('drag_search_ms', Date.now() - startTime);
    metrics.incrementCounter('drag_search_queries');

    log.debug('Semantic search completed', {
      query: query.slice(0, 50),
      candidateCount: candidates.length,
      resultCount: results.length,
      durationMs: Date.now() - startTime,
    });

    return results;
  }

  /**
   * Find similar content to avoid repetition
   */
  async findSimilar(content: string, threshold = 0.7): Promise<SemanticSearchResult[]> {
    return this.search(content, {
      minSimilarity: threshold,
      limit: 5,
      verifyDKG: false, // Skip verification for repetition check
    });
  }

  /**
   * Generate context for content generation
   *
   * Returns relevant prior knowledge to ground new content
   */
  async getGenerationContext(topic: string, options?: {
    maxTokens?: number;
    types?: MemoryType[];
  }): Promise<string> {
    const maxTokens = options?.maxTokens || 2000;
    const types = options?.types || ['tweet', 'observation'];

    // Search for relevant content
    const results: SemanticSearchResult[] = [];
    for (const type of types) {
      const typeResults = await this.search(topic, {
        type,
        limit: 5,
        verifyDKG: true,
      });
      results.push(...typeResults);
    }

    // Sort by relevance and recency
    results.sort((a, b) => {
      const similarityDiff = b.similarity - a.similarity;
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      return similarityDiff * 0.7 + (timeDiff / (24 * 60 * 60 * 1000)) * 0.3;
    });

    // Build context string within token limit
    let context = '';
    let tokenEstimate = 0;

    for (const result of results) {
      const entry = `[${result.type}] ${result.content} (UAL: ${result.ual.slice(-20)})\n`;
      const entryTokens = Math.ceil(entry.length / 4); // Rough token estimate

      if (tokenEstimate + entryTokens > maxTokens) break;

      context += entry;
      tokenEstimate += entryTokens;
    }

    return context;
  }

  /**
   * Check if content is too similar to recent posts
   */
  async isRepetitive(content: string, hoursWindow = 24): Promise<{
    isRepetitive: boolean;
    similarContent?: string;
    similarity?: number;
  }> {
    const cutoff = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);

    const similar = await this.findSimilar(content, 0.8);
    const recent = similar.filter((s) => s.timestamp >= cutoff);

    if (recent.length > 0) {
      return {
        isRepetitive: true,
        similarContent: recent[0].content,
        similarity: recent[0].similarity,
      };
    }

    return { isRepetitive: false };
  }

  /**
   * Get statistics about the vector index
   */
  getStats(): {
    vectorCount: number;
    byType: Record<string, number>;
    oldestTimestamp: Date | null;
    newestTimestamp: Date | null;
  } {
    const byType: Record<string, number> = {};
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const vec of this.vectors) {
      byType[vec.type] = (byType[vec.type] || 0) + 1;
      if (!oldest || vec.timestamp < oldest) oldest = vec.timestamp;
      if (!newest || vec.timestamp > newest) newest = vec.timestamp;
    }

    return {
      vectorCount: this.vectors.length,
      byType,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    };
  }
}

// Singleton instance
let dragInstance: NikaDRAG | null = null;

export function getDRAG(): NikaDRAG | null {
  return dragInstance;
}

export async function initializeDRAG(dkgMemory: DKGMemory): Promise<NikaDRAG> {
  if (dragInstance) {
    return dragInstance;
  }

  dragInstance = new NikaDRAG({ dkgMemory });
  await dragInstance.initialize();

  return dragInstance;
}
