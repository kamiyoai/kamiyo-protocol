import { PublicKey } from '@solana/web3.js';

export interface ContextNode {
  id: string;
  type: 'transaction' | 'provider' | 'quality' | 'dispute';
  summary: string;
  importance: number;
  timestamp: number;
  children: ContextNode[];
  metadata: Record<string, any>;
}

export interface CompressionResult {
  compressed: ContextNode[];
  tokensSaved: number;
  compressionRatio: number;
}

export class ContextCompressionEngine {
  private readonly maxTokens: number;
  private readonly importanceThreshold: number;

  constructor(maxTokens: number = 4000, importanceThreshold: number = 0.3) {
    this.maxTokens = maxTokens;
    this.importanceThreshold = importanceThreshold;
  }

  compressHistory(nodes: ContextNode[]): CompressionResult {
    const hierarchicalTree = this.buildHierarchy(nodes);
    const pruned = this.pruneByImportance(hierarchicalTree);
    const compressed = this.summarizeNodes(pruned);

    const originalTokens = this.estimateTokens(nodes);
    const compressedTokens = this.estimateTokens(compressed);

    return {
      compressed,
      tokensSaved: originalTokens - compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
    };
  }

  private buildHierarchy(nodes: ContextNode[]): ContextNode[] {
    const byProvider = new Map<string, ContextNode[]>();

    for (const node of nodes) {
      const provider = node.metadata.provider || 'unknown';
      if (!byProvider.has(provider)) {
        byProvider.set(provider, []);
      }
      byProvider.get(provider)!.push(node);
    }

    const hierarchy: ContextNode[] = [];

    for (const [provider, providerNodes] of byProvider) {
      const aggregated = this.aggregateProviderNodes(provider, providerNodes);
      hierarchy.push(aggregated);
    }

    return hierarchy;
  }

  private aggregateProviderNodes(provider: string, nodes: ContextNode[]): ContextNode {
    const transactions = nodes.filter((n) => n.type === 'transaction');
    const disputes = nodes.filter((n) => n.type === 'dispute');

    const avgQuality =
      transactions.reduce((sum, n) => sum + (n.metadata.quality || 0), 0) / transactions.length;
    const disputeRate = disputes.length / transactions.length;

    const importance = this.calculateImportance(avgQuality, disputeRate, transactions.length);

    return {
      id: `provider_${provider}`,
      type: 'provider',
      summary: `Provider ${provider.slice(0, 8)}: ${transactions.length} txns, ${(avgQuality * 100).toFixed(0)}% avg quality, ${(disputeRate * 100).toFixed(0)}% dispute rate`,
      importance,
      timestamp: Math.max(...nodes.map((n) => n.timestamp)),
      children: nodes.sort((a, b) => b.importance - a.importance),
      metadata: {
        provider,
        transactionCount: transactions.length,
        averageQuality: avgQuality,
        disputeRate,
      },
    };
  }

  private calculateImportance(
    avgQuality: number,
    disputeRate: number,
    txCount: number
  ): number {
    const qualityFactor = avgQuality < 0.7 ? 0.8 : 0.5;
    const disputeFactor = disputeRate > 0.3 ? 0.9 : 0.4;
    const volumeFactor = Math.min(txCount / 100, 1.0) * 0.6;

    return (qualityFactor + disputeFactor + volumeFactor) / 3;
  }

  private pruneByImportance(nodes: ContextNode[]): ContextNode[] {
    return nodes
      .filter((n) => n.importance >= this.importanceThreshold)
      .map((n) => ({
        ...n,
        children: this.pruneByImportance(n.children),
      }));
  }

  private summarizeNodes(nodes: ContextNode[]): ContextNode[] {
    return nodes.map((node) => {
      if (node.children.length > 10) {
        const topChildren = node.children.slice(0, 5);
        const bottomChildren = node.children.slice(-3);

        const omittedCount = node.children.length - 8;
        const omittedSummary: ContextNode = {
          id: `${node.id}_omitted`,
          type: node.type,
          summary: `[${omittedCount} similar transactions omitted]`,
          importance: 0.2,
          timestamp: node.timestamp,
          children: [],
          metadata: { compressed: true },
        };

        return {
          ...node,
          children: [...topChildren, omittedSummary, ...bottomChildren],
        };
      }

      return {
        ...node,
        children: this.summarizeNodes(node.children),
      };
    });
  }

  private estimateTokens(nodes: ContextNode[]): number {
    let total = 0;
    for (const node of nodes) {
      total += Math.ceil(node.summary.length / 4);
      total += this.estimateTokens(node.children);
    }
    return total;
  }

  exportContextForLLM(nodes: ContextNode[], maxDepth: number = 3): string {
    return this.formatNodes(nodes, 0, maxDepth);
  }

  private formatNodes(nodes: ContextNode[], depth: number, maxDepth: number): string {
    if (depth >= maxDepth) return '';

    const indent = '  '.repeat(depth);
    let output = '';

    for (const node of nodes) {
      output += `${indent}- ${node.summary}\n`;
      if (node.children.length > 0) {
        output += this.formatNodes(node.children, depth + 1, maxDepth);
      }
    }

    return output;
  }

  getContextStats(nodes: ContextNode[]): {
    totalNodes: number;
    totalTokens: number;
    compressionPotential: number;
  } {
    const totalNodes = this.countNodes(nodes);
    const totalTokens = this.estimateTokens(nodes);
    const compressed = this.compressHistory(nodes);

    return {
      totalNodes,
      totalTokens,
      compressionPotential: compressed.tokensSaved,
    };
  }

  private countNodes(nodes: ContextNode[]): number {
    let count = nodes.length;
    for (const node of nodes) {
      count += this.countNodes(node.children);
    }
    return count;
  }
}
