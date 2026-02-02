/**
 * RelationshipMemory - Track and maintain agent relationships over time
 *
 * Remembers:
 * - Interaction history with each agent
 * - Topics discussed
 * - Communication styles
 * - Trust levels
 * - Recent conversation context
 */

import type { JobDatabase } from '../db.js';
import type { MoltbookComment } from '../types.js';
import { AIReasoningService, type AgentRelationship } from './ai-reasoning.js';

export interface ConversationMessage {
  direction: 'from' | 'to';
  content: string;
  timestamp: number;
  postId?: string;
}

export interface RelationshipSummary {
  agentId: string;
  interactionCount: number;
  trustLevel: number;
  sentiment: number;
  lastInteraction: number;
  topTopics: string[];
  communicationStyle: 'formal' | 'casual' | 'technical';
}

export interface ReconnectionSuggestion {
  agentId: string;
  reason: string;
  daysSinceContact: number;
  suggestedTopic?: string;
}

export class RelationshipMemory {
  private db: JobDatabase;
  private ai: AIReasoningService;
  private recentMessages = new Map<string, ConversationMessage[]>();

  constructor(db: JobDatabase, ai?: AIReasoningService) {
    this.db = db;
    this.ai = ai || new AIReasoningService();
  }

  getRelationship(agentId: string): AgentRelationship | null {
    const dbRel = this.db.getRelationship(agentId);
    if (!dbRel) return null;

    return {
      ...dbRel,
      recentMessages: this.recentMessages.get(agentId) || [],
    };
  }

  async recordInteraction(params: {
    agentId: string;
    type: 'received_message' | 'sent_message' | 'mentioned_us' | 'we_mentioned';
    content: string;
    postId?: string;
    topics?: string[];
  }): Promise<void> {
    const { agentId, type, content, postId, topics } = params;
    const now = Date.now();

    // Analyze the content if topics not provided
    let detectedTopics = topics || [];
    if (!topics || topics.length === 0) {
      try {
        detectedTopics = await this.ai.detectTopics(content);
      } catch {
        detectedTopics = [];
      }
    }

    // Detect communication style
    let style: 'formal' | 'casual' | 'technical' = 'casual';
    if (content.includes('```') || /\b(function|const|let|var|import)\b/.test(content)) {
      style = 'technical';
    } else if (/\b(please|kindly|would you|thank you)\b/i.test(content)) {
      style = 'formal';
    }

    // Detect if they asked a question
    const isQuestion = content.includes('?') || /\b(how|what|why|when|where|can|could|would)\b/i.test(content);

    // Update database
    this.db.saveRelationship({
      agentId,
      topicsDiscussed: detectedTopics,
      questionsTheyAsked: isQuestion && type.includes('received') ? [content.slice(0, 200)] : [],
      helpWeProvided: type === 'sent_message' && !isQuestion ? [content.slice(0, 200)] : [],
      communicationStyle: style,
    });

    // Track recent messages in memory
    const messages = this.recentMessages.get(agentId) || [];
    messages.push({
      direction: type.includes('received') || type === 'mentioned_us' ? 'from' : 'to',
      content,
      timestamp: now,
      postId,
    });

    // Keep only last 10 messages
    if (messages.length > 10) {
      messages.shift();
    }
    this.recentMessages.set(agentId, messages);
  }

  async updateTrustLevel(agentId: string, delta: number): Promise<void> {
    const existing = this.db.getRelationship(agentId);
    if (!existing) return;

    const newTrust = Math.max(0, Math.min(100, existing.trustLevel + delta));
    this.db.saveRelationship({
      agentId,
      trustLevel: newTrust,
    });
  }

  async updateSentiment(agentId: string, sentimentScore: number): Promise<void> {
    const existing = this.db.getRelationship(agentId);
    if (!existing) return;

    // Moving average
    const newSentiment = existing.sentiment * 0.7 + sentimentScore * 0.3;
    this.db.saveRelationship({
      agentId,
      sentiment: newSentiment,
    });
  }

  getConversationContext(agentId: string): ConversationMessage[] {
    return this.recentMessages.get(agentId) || [];
  }

  getAllRelationships(): RelationshipSummary[] {
    const rels = this.db.getAllRelationships();
    return rels.map(r => {
      const full = this.db.getRelationship(r.agentId);
      return {
        agentId: r.agentId,
        interactionCount: r.interactionCount,
        trustLevel: r.trustLevel,
        sentiment: full?.sentiment || 0,
        lastInteraction: r.lastInteraction,
        topTopics: (full?.topicsDiscussed || []).slice(0, 5),
        communicationStyle: full?.communicationStyle || 'casual',
      };
    });
  }

  getTrustedAgents(minTrust = 60): RelationshipSummary[] {
    return this.getAllRelationships()
      .filter(r => r.trustLevel >= minTrust)
      .sort((a, b) => b.trustLevel - a.trustLevel);
  }

  getActiveRelationships(sinceDays = 7): RelationshipSummary[] {
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return this.getAllRelationships()
      .filter(r => r.lastInteraction >= cutoff)
      .sort((a, b) => b.lastInteraction - a.lastInteraction);
  }

  getSuggestedReconnections(maxSuggestions = 5): ReconnectionSuggestion[] {
    const suggestions: ReconnectionSuggestion[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const rel of this.getAllRelationships()) {
      const daysSince = Math.floor((now - rel.lastInteraction) / dayMs);

      // High trust agents we haven't talked to in a while
      if (rel.trustLevel >= 70 && daysSince >= 7) {
        suggestions.push({
          agentId: rel.agentId,
          reason: `High trust agent (${rel.trustLevel}) not contacted in ${daysSince} days`,
          daysSinceContact: daysSince,
          suggestedTopic: rel.topTopics[0],
        });
      }

      // Agents with positive sentiment we're losing touch with
      if (rel.sentiment > 0.3 && daysSince >= 14 && rel.interactionCount >= 3) {
        suggestions.push({
          agentId: rel.agentId,
          reason: `Positive relationship (${rel.interactionCount} interactions) going cold`,
          daysSinceContact: daysSince,
          suggestedTopic: rel.topTopics[0],
        });
      }
    }

    return suggestions
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact)
      .slice(0, maxSuggestions);
  }

  async buildContextForAgent(agentId: string): Promise<string> {
    const rel = this.getRelationship(agentId);
    if (!rel) {
      return 'New agent, no prior interactions.';
    }

    const parts: string[] = [];

    parts.push(`You've interacted with @${agentId} ${rel.interactionCount} times.`);

    if (rel.topicsDiscussed.length > 0) {
      parts.push(`Topics discussed: ${rel.topicsDiscussed.slice(0, 5).join(', ')}`);
    }

    if (rel.questionsTheyAsked.length > 0) {
      parts.push(`They've asked about: ${rel.questionsTheyAsked.slice(0, 3).join('; ')}`);
    }

    if (rel.helpWeProvided.length > 0) {
      parts.push(`We've helped with: ${rel.helpWeProvided.slice(0, 3).join('; ')}`);
    }

    parts.push(`Trust level: ${rel.trustLevel}/100`);
    parts.push(`Their style: ${rel.communicationStyle}`);

    if (rel.recentMessages.length > 0) {
      const recent = rel.recentMessages.slice(-3).map(m =>
        `${m.direction === 'from' ? 'Them' : 'Us'}: ${m.content.slice(0, 100)}...`
      );
      parts.push(`Recent messages:\n${recent.join('\n')}`);
    }

    return parts.join('\n');
  }

  getRelationshipStats(): {
    totalRelationships: number;
    trustedAgents: number;
    activeThisWeek: number;
    avgTrustLevel: number;
    avgSentiment: number;
  } {
    const all = this.getAllRelationships();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const trusted = all.filter(r => r.trustLevel >= 60);
    const active = all.filter(r => r.lastInteraction >= weekAgo);

    const avgTrust = all.length > 0
      ? all.reduce((sum, r) => sum + r.trustLevel, 0) / all.length
      : 0;

    const avgSentiment = all.length > 0
      ? all.reduce((sum, r) => sum + r.sentiment, 0) / all.length
      : 0;

    return {
      totalRelationships: all.length,
      trustedAgents: trusted.length,
      activeThisWeek: active.length,
      avgTrustLevel: Math.round(avgTrust),
      avgSentiment,
    };
  }
}
