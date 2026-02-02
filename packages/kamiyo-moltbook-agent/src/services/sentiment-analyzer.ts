/**
 * SentimentAnalyzer - Wrapper around AIReasoningService for sentiment analysis
 *
 * Provides a clean interface for:
 * - Sentiment scoring
 * - Intent classification
 * - Topic extraction
 * - Question detection
 */

import {
  AIReasoningService,
  type SentimentResult,
  type IntentResult,
} from './ai-reasoning.js';

export type IntentType = 'asking' | 'sharing' | 'discussing' | 'celebrating' | 'venting' | 'announcing';

export interface AnalysisResult {
  sentiment: SentimentResult;
  intent: IntentResult;
  topics: string[];
  isQuestion: boolean;
  requiresResponse: boolean;
}

export class SentimentAnalyzer {
  private ai: AIReasoningService;

  constructor(ai?: AIReasoningService) {
    this.ai = ai || new AIReasoningService();
  }

  async analyze(text: string): Promise<SentimentResult> {
    return this.ai.analyzeSentiment(text);
  }

  async extractIntent(text: string): Promise<IntentType> {
    const intent = await this.ai.extractIntent(text);
    return intent.type;
  }

  async isQuestion(text: string): Promise<boolean> {
    const intent = await this.ai.extractIntent(text);
    return intent.type === 'asking';
  }

  async detectTopics(text: string): Promise<string[]> {
    return this.ai.detectTopics(text);
  }

  async fullAnalysis(text: string): Promise<AnalysisResult> {
    const [sentiment, intent, topics] = await Promise.all([
      this.ai.analyzeSentiment(text),
      this.ai.extractIntent(text),
      this.ai.detectTopics(text),
    ]);

    const isQuestion = intent.type === 'asking';
    const requiresResponse = isQuestion || intent.type === 'venting' || sentiment.score < -0.5;

    return {
      sentiment,
      intent,
      topics: [...new Set([...sentiment.topics, ...topics])],
      isQuestion,
      requiresResponse,
    };
  }

  async batchAnalyze(texts: string[]): Promise<SentimentResult[]> {
    return Promise.all(texts.map(text => this.analyze(text)));
  }

  async getAverageSentiment(texts: string[]): Promise<number> {
    const results = await this.batchAnalyze(texts);
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.score, 0) / results.length;
  }
}
