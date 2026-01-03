import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export interface MemoryEntry {
  id: string;
  agentId: string;
  timestamp: number;
  type: 'transaction' | 'interaction' | 'learning' | 'preference';
  data: any;
  embedding?: number[];
}

export interface AgentContext {
  agentId: string;
  recentTransactions: string[];
  preferredProviders: Map<string, number>;
  learnedPatterns: {
    qualityThresholds: Map<string, number>;
    disputeTriggers: string[];
    successfulProviders: string[];
    avoidedProviders: string[];
  };
  statistics: {
    totalTransactions: number;
    successfulTransactions: number;
    disputes: number;
    averageQualityReceived: number;
  };
}

export class AgentMemorySystem {
  private memories: Map<string, MemoryEntry[]> = new Map();
  private contexts: Map<string, AgentContext> = new Map();
  private memoryDir: string;

  constructor(memoryDir: string = './data/agent-memory') {
    this.memoryDir = memoryDir;
    this.ensureMemoryDirectory();
    this.loadMemories();
  }

  private ensureMemoryDirectory(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private loadMemories(): void {
    try {
      const files = fs.readdirSync(this.memoryDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.memoryDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const agentId = file.replace('.json', '');
          this.memories.set(agentId, data.memories || []);
          if (data.context) {
            this.contexts.set(agentId, this.reconstructContext(data.context));
          }
        }
      }
    } catch (error) {
      console.error('Error loading memories:', error);
    }
  }

  private reconstructContext(data: any): AgentContext {
    return {
      ...data,
      preferredProviders: new Map(Object.entries(data.preferredProviders || {})),
      learnedPatterns: {
        ...data.learnedPatterns,
        qualityThresholds: new Map(Object.entries(data.learnedPatterns?.qualityThresholds || {})),
      },
    };
  }

  private saveMemories(agentId: string): void {
    try {
      const memories = this.memories.get(agentId) || [];
      const context = this.contexts.get(agentId);

      const data = {
        memories,
        context: context
          ? {
              ...context,
              preferredProviders: Object.fromEntries(context.preferredProviders),
              learnedPatterns: {
                ...context.learnedPatterns,
                qualityThresholds: Object.fromEntries(context.learnedPatterns.qualityThresholds),
              },
            }
          : null,
      };

      const filePath = path.join(this.memoryDir, `${agentId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving memories:', error);
    }
  }

  recordMemory(agentId: string, type: MemoryEntry['type'], data: any): void {
    const memory: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      timestamp: Date.now(),
      type,
      data,
    };

    let memories = this.memories.get(agentId) || [];
    memories.push(memory);

    if (memories.length > 1000) {
      memories = memories.slice(-1000);
    }

    this.memories.set(agentId, memories);
    this.updateContext(agentId, memory);
    this.saveMemories(agentId);
  }

  private updateContext(agentId: string, memory: MemoryEntry): void {
    let context = this.contexts.get(agentId);

    if (!context) {
      context = {
        agentId,
        recentTransactions: [],
        preferredProviders: new Map(),
        learnedPatterns: {
          qualityThresholds: new Map(),
          disputeTriggers: [],
          successfulProviders: [],
          avoidedProviders: [],
        },
        statistics: {
          totalTransactions: 0,
          successfulTransactions: 0,
          disputes: 0,
          averageQualityReceived: 0,
        },
      };
    }

    if (memory.type === 'transaction') {
      context.recentTransactions.push(memory.data.transactionId);
      if (context.recentTransactions.length > 50) {
        context.recentTransactions = context.recentTransactions.slice(-50);
      }

      context.statistics.totalTransactions++;

      if (memory.data.quality) {
        const currentTotal =
          context.statistics.averageQualityReceived * (context.statistics.totalTransactions - 1);
        context.statistics.averageQualityReceived =
          (currentTotal + memory.data.quality) / context.statistics.totalTransactions;

        if (memory.data.quality > 80) {
          context.statistics.successfulTransactions++;
          if (!context.learnedPatterns.successfulProviders.includes(memory.data.provider)) {
            context.learnedPatterns.successfulProviders.push(memory.data.provider);
          }
        }
      }

      if (memory.data.disputed) {
        context.statistics.disputes++;
        if (!context.learnedPatterns.avoidedProviders.includes(memory.data.provider)) {
          context.learnedPatterns.avoidedProviders.push(memory.data.provider);
        }
      }

      const currentScore = context.preferredProviders.get(memory.data.provider) || 50;
      const adjustment = memory.data.quality ? (memory.data.quality - 50) * 0.1 : 0;
      context.preferredProviders.set(memory.data.provider, currentScore + adjustment);
    }

    if (memory.type === 'learning') {
      if (memory.data.qualityThreshold) {
        context.learnedPatterns.qualityThresholds.set(
          memory.data.provider,
          memory.data.qualityThreshold
        );
      }
    }

    this.contexts.set(agentId, context);
  }

  getContext(agentId: string): AgentContext | undefined {
    return this.contexts.get(agentId);
  }

  getRecentMemories(agentId: string, count: number = 10): MemoryEntry[] {
    const memories = this.memories.get(agentId) || [];
    return memories.slice(-count);
  }

  queryMemories(
    agentId: string,
    filter: {
      type?: MemoryEntry['type'];
      startTime?: number;
      endTime?: number;
    }
  ): MemoryEntry[] {
    const memories = this.memories.get(agentId) || [];

    return memories.filter((memory) => {
      if (filter.type && memory.type !== filter.type) return false;
      if (filter.startTime && memory.timestamp < filter.startTime) return false;
      if (filter.endTime && memory.timestamp > filter.endTime) return false;
      return true;
    });
  }

  getProviderRecommendation(agentId: string, providers: string[]): string | null {
    const context = this.contexts.get(agentId);
    if (!context) return null;

    let bestProvider: string | null = null;
    let bestScore = -1;

    for (const provider of providers) {
      if (context.learnedPatterns.avoidedProviders.includes(provider)) continue;

      const score = context.preferredProviders.get(provider) || 50;
      const successBonus = context.learnedPatterns.successfulProviders.includes(provider) ? 10 : 0;

      const totalScore = score + successBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  getAdaptiveQualityThreshold(agentId: string, provider: string): number {
    const context = this.contexts.get(agentId);
    if (!context) return 70;

    const learned = context.learnedPatterns.qualityThresholds.get(provider);
    if (learned) return learned;

    if (context.statistics.averageQualityReceived > 0) {
      return Math.max(60, context.statistics.averageQualityReceived - 10);
    }

    return 70;
  }

  shouldAvoidProvider(agentId: string, provider: string): boolean {
    const context = this.contexts.get(agentId);
    if (!context) return false;

    return context.learnedPatterns.avoidedProviders.includes(provider);
  }

  exportAgentProfile(agentId: string): any {
    const context = this.contexts.get(agentId);
    const memories = this.memories.get(agentId) || [];

    return {
      agentId,
      context,
      recentMemories: memories.slice(-20),
      exportedAt: Date.now(),
    };
  }
}
