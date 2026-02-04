/**
 * SPARQL Generator - natural language to graph queries.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger, getMetrics, sanitizeForSPARQL, LRUCache } from './lib';
import type { DKGMemory } from './dkg-memory';

const log = createLogger('nika:sparql-gen');
const metrics = getMetrics();

/**
 * SPARQL generation result
 */
export interface SPARQLGenerationResult {
  query: string;
  explanation: string;
  confidence: number;
}

/**
 * Query execution result
 */
export interface QueryResult {
  success: boolean;
  data: Record<string, unknown>[];
  query: string;
  durationMs: number;
  fromCache?: boolean;
}

/**
 * SPARQL Generator configuration
 */
export interface SPARQLGeneratorConfig {
  anthropicApiKey: string;
  dkgMemory: DKGMemory;
  model?: string;
  cacheSize?: number;
  cacheTTLMs?: number;
}

/**
 * Nika's ontology schema for SPARQL generation
 */
const NIKA_ONTOLOGY = `
PREFIX schema: <https://schema.org/>
PREFIX sioc: <http://rdfs.org/sioc/ns#>
PREFIX nika: <https://kamiyo.ai/ontology/nika/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

# Nika's Knowledge Graph Schema:

## Classes:
- schema:SocialMediaPosting - A tweet (original post)
- sioc:Reply - A reply to another tweet
- nika:Observation - Something Nika observed but didn't tweet

## Common Properties:
- schema:articleBody - The text content
- schema:author - The author (always Nika for her posts)
- schema:datePublished - ISO timestamp
- schema:keywords - Array of topic keywords
- nika:assetType - "tweet" | "reply" | "quote" | "observation"
- nika:mood - Mood when creating (curious, analytical, playful, etc.)
- nika:tweetId - Twitter ID if posted
- nika:inReplyTo - Tweet ID being replied to
- nika:quotedTweet - Tweet ID being quoted
- nika:confidence - Confidence score for observations (0-1)

## Example Queries:

1. Find recent tweets about a topic:
SELECT ?content ?date ?mood
WHERE {
  ?ual nika:assetType "tweet" .
  ?ual schema:articleBody ?content .
  ?ual schema:datePublished ?date .
  OPTIONAL { ?ual nika:mood ?mood }
  ?ual schema:keywords ?keyword .
  FILTER (CONTAINS(LCASE(STR(?keyword)), "topic"))
}
ORDER BY DESC(?date)
LIMIT 10

2. Find observations with high confidence:
SELECT ?content ?confidence ?date
WHERE {
  ?ual nika:assetType "observation" .
  ?ual schema:description ?content .
  ?ual nika:confidence ?confidence .
  ?ual schema:dateCreated ?date .
  FILTER (?confidence >= 0.8)
}
ORDER BY DESC(?confidence)
LIMIT 5

3. Find replies in conversations:
SELECT ?reply ?original ?date
WHERE {
  ?ual a sioc:Reply .
  ?ual schema:articleBody ?reply .
  ?ual sioc:reply_of/schema:articleBody ?original .
  ?ual schema:datePublished ?date .
}
ORDER BY DESC(?date)
LIMIT 10
`;

/**
 * SPARQL Generator - Converts natural language to SPARQL queries
 */
export class SPARQLGenerator {
  private config: SPARQLGeneratorConfig;
  private client: Anthropic;
  private queryCache: LRUCache<QueryResult>;

  constructor(config: SPARQLGeneratorConfig) {
    this.config = {
      model: 'claude-sonnet-4-20250514',
      cacheSize: 100,
      cacheTTLMs: 5 * 60 * 1000, // 5 minutes
      ...config,
    };

    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.queryCache = new LRUCache<QueryResult>({
      maxSize: this.config.cacheSize || 100,
      ttlMs: this.config.cacheTTLMs || 5 * 60 * 1000,
    });

    log.info('SPARQL Generator initialized');
  }

  /**
   * Generate a SPARQL query from natural language
   */
  async generateQuery(naturalLanguage: string): Promise<SPARQLGenerationResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a SPARQL query generator for Nika's knowledge graph.

${NIKA_ONTOLOGY}

Generate SPARQL queries based on natural language questions.
Output ONLY valid SPARQL. No explanations outside the structured format.`,
        messages: [
          {
            role: 'user',
            content: `Convert this question to a SPARQL query: "${naturalLanguage}"

Output format:
QUERY:
[Your SPARQL query here]

EXPLANATION:
[One sentence explaining what the query does]

CONFIDENCE:
[0.0-1.0 based on how well you understood the question]`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Parse the response
      const queryMatch = text.match(/QUERY:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
      const explanationMatch = text.match(/EXPLANATION:\s*(.*?)(?=CONFIDENCE:|$)/is);
      const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);

      const query = queryMatch?.[1]?.trim() || '';
      const explanation = explanationMatch?.[1]?.trim() || 'Query generated';
      const confidence = parseFloat(confidenceMatch?.[1] || '0.5');

      if (!query || !query.toLowerCase().includes('select')) {
        throw new Error('Invalid SPARQL generated');
      }

      metrics.recordHistogram('sparql_gen_duration_ms', Date.now() - startTime);
      metrics.incrementCounter('sparql_gen_success');

      log.debug('SPARQL generated', {
        question: naturalLanguage.slice(0, 50),
        confidence,
        durationMs: Date.now() - startTime,
      });

      return { query, explanation, confidence };
    } catch (error) {
      metrics.incrementCounter('sparql_gen_error');
      log.error('SPARQL generation failed', { error: String(error) });

      // Return a safe fallback query
      return {
        query: this.getFallbackQuery(naturalLanguage),
        explanation: 'Fallback query due to generation error',
        confidence: 0.3,
      };
    }
  }

  /**
   * Generate and execute a SPARQL query
   */
  async queryFromNaturalLanguage(
    question: string,
    options?: { useCache?: boolean; maxResults?: number }
  ): Promise<QueryResult> {
    const cacheKey = question.toLowerCase().trim();
    const useCache = options?.useCache ?? true;

    // Check cache
    if (useCache) {
      const cached = this.queryCache.get(cacheKey);
      if (cached) {
        metrics.incrementCounter('sparql_cache_hit');
        return { ...cached, fromCache: true };
      }
    }

    metrics.incrementCounter('sparql_cache_miss');
    const startTime = Date.now();

    try {
      // Generate SPARQL
      const generated = await this.generateQuery(question);

      // Add LIMIT if not present and maxResults specified
      let query = generated.query;
      if (options?.maxResults && !query.toLowerCase().includes('limit')) {
        query = query.trim() + `\nLIMIT ${options.maxResults}`;
      }

      // Execute query
      const data = await this.config.dkgMemory.query(query);

      const result: QueryResult = {
        success: true,
        data,
        query,
        durationMs: Date.now() - startTime,
      };

      // Cache successful results
      if (useCache && data.length > 0) {
        this.queryCache.set(cacheKey, result);
      }

      log.info('Natural language query executed', {
        question: question.slice(0, 50),
        resultCount: data.length,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      metrics.incrementCounter('sparql_query_error');
      log.error('Natural language query failed', { error: String(error) });

      return {
        success: false,
        data: [],
        query: '',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Answer a question using the knowledge graph
   */
  async answerQuestion(question: string): Promise<{
    answer: string;
    sources: string[];
    confidence: number;
  }> {
    const startTime = Date.now();

    try {
      // Query the knowledge graph
      const result = await this.queryFromNaturalLanguage(question, { maxResults: 5 });

      if (!result.success || result.data.length === 0) {
        return {
          answer: 'I could not find relevant information in my knowledge.',
          sources: [],
          confidence: 0,
        };
      }

      // Extract content from results
      const contents = result.data
        .map((r) => r.content || r.articleBody || r.description)
        .filter(Boolean)
        .map(String);

      const sources = result.data
        .map((r) => r.ual)
        .filter(Boolean)
        .map(String);

      // Generate answer using the retrieved content
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are Nika, answering questions based ONLY on your stored knowledge.
Use only the provided context. Be concise and factual.
If the context doesn't fully answer the question, say so.`,
        messages: [
          {
            role: 'user',
            content: `Context from my knowledge graph:
${contents.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Question: ${question}

Answer based ONLY on the context above:`,
          },
        ],
      });

      const answer = response.content[0].type === 'text' ? response.content[0].text : '';

      metrics.recordHistogram('sparql_answer_duration_ms', Date.now() - startTime);

      return {
        answer,
        sources,
        confidence: contents.length > 0 ? 0.8 : 0.3,
      };
    } catch (error) {
      log.error('Question answering failed', { error: String(error) });
      return {
        answer: 'I encountered an error accessing my knowledge.',
        sources: [],
        confidence: 0,
      };
    }
  }

  /**
   * Find related topics in the knowledge graph
   */
  async findRelatedTopics(topic: string, limit = 10): Promise<string[]> {
    const safeTopic = sanitizeForSPARQL(topic);

    const query = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT DISTINCT ?keyword
      WHERE {
        ?ual schema:keywords ?keyword .
        ?ual schema:keywords ?topic .
        FILTER (CONTAINS(LCASE(STR(?topic)), LCASE("${safeTopic}")))
        FILTER (?keyword != ?topic)
      }
      LIMIT ${limit}
    `;

    try {
      const results = await this.config.dkgMemory.query(query);
      return results.map((r) => String(r.keyword)).filter(Boolean);
    } catch (error) {
      log.error('Failed to find related topics', { error: String(error) });
      return [];
    }
  }

  /**
   * Get a summary of knowledge about a topic
   */
  async getTopicSummary(topic: string): Promise<{
    tweetCount: number;
    observationCount: number;
    recentContent: string[];
    relatedTopics: string[];
  }> {
    const safeTopic = sanitizeForSPARQL(topic);

    // Count tweets
    const tweetCountQuery = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT (COUNT(?ual) as ?count)
      WHERE {
        ?ual nika:assetType "tweet" .
        ?ual schema:keywords ?keyword .
        FILTER (CONTAINS(LCASE(STR(?keyword)), LCASE("${safeTopic}")))
      }
    `;

    // Count observations
    const obsCountQuery = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT (COUNT(?ual) as ?count)
      WHERE {
        ?ual nika:assetType "observation" .
        ?ual schema:keywords ?keyword .
        FILTER (CONTAINS(LCASE(STR(?keyword)), LCASE("${safeTopic}")))
      }
    `;

    // Get recent content
    const recentQuery = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT ?content
      WHERE {
        ?ual schema:articleBody ?content .
        ?ual schema:keywords ?keyword .
        ?ual schema:datePublished ?date .
        FILTER (CONTAINS(LCASE(STR(?keyword)), LCASE("${safeTopic}")))
      }
      ORDER BY DESC(?date)
      LIMIT 5
    `;

    try {
      const [tweetResults, obsResults, recentResults, relatedTopics] = await Promise.all([
        this.config.dkgMemory.query(tweetCountQuery),
        this.config.dkgMemory.query(obsCountQuery),
        this.config.dkgMemory.query(recentQuery),
        this.findRelatedTopics(topic),
      ]);

      return {
        tweetCount: parseInt(String(tweetResults[0]?.count || 0)),
        observationCount: parseInt(String(obsResults[0]?.count || 0)),
        recentContent: recentResults.map((r) => String(r.content)).filter(Boolean),
        relatedTopics,
      };
    } catch (error) {
      log.error('Failed to get topic summary', { error: String(error) });
      return {
        tweetCount: 0,
        observationCount: 0,
        recentContent: [],
        relatedTopics: [],
      };
    }
  }

  /**
   * Generate a fallback query for common patterns
   */
  private getFallbackQuery(naturalLanguage: string): string {
    const lower = naturalLanguage.toLowerCase();

    if (lower.includes('recent') || lower.includes('latest')) {
      return `
        PREFIX schema: <https://schema.org/>
        PREFIX nika: <https://kamiyo.ai/ontology/nika/>

        SELECT ?content ?date ?type
        WHERE {
          ?ual schema:articleBody ?content .
          ?ual schema:datePublished ?date .
          ?ual nika:assetType ?type .
        }
        ORDER BY DESC(?date)
        LIMIT 10
      `;
    }

    if (lower.includes('topic') || lower.includes('about')) {
      return `
        PREFIX schema: <https://schema.org/>

        SELECT DISTINCT ?keyword (COUNT(?ual) as ?count)
        WHERE {
          ?ual schema:keywords ?keyword .
        }
        GROUP BY ?keyword
        ORDER BY DESC(?count)
        LIMIT 20
      `;
    }

    // Default: get recent content
    return `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT ?content ?type ?date
      WHERE {
        ?ual schema:articleBody ?content .
        ?ual nika:assetType ?type .
        ?ual schema:datePublished ?date .
      }
      ORDER BY DESC(?date)
      LIMIT 10
    `;
  }
}

// Singleton instance
let generatorInstance: SPARQLGenerator | null = null;

export function getSPARQLGenerator(): SPARQLGenerator | null {
  return generatorInstance;
}

export function initializeSPARQLGenerator(
  anthropicApiKey: string,
  dkgMemory: DKGMemory
): SPARQLGenerator {
  if (generatorInstance) {
    return generatorInstance;
  }

  generatorInstance = new SPARQLGenerator({ anthropicApiKey, dkgMemory });
  return generatorInstance;
}
