import type { JobDatabase } from '../db.js';
import type { TrustEdge } from '../types.js';
import type { DKGPublisher } from './dkg-publisher.js';

const MAX_AGENT_ID_LENGTH = 100;
const MAX_GRAPH_NODES = 100000;
const MAX_BFS_ITERATIONS = 10000;

export interface TrustNode {
  agentId: string;
  incomingTrust: number;
  outgoingTrust: number;
  totalStake: number;
  edgeCount: number;
}

export interface TrustPath {
  from: string;
  to: string;
  hops: number;
  path: string[];
  minTrustLevel: number;
  totalStake: number;
}

export interface TrustGraphStats {
  totalNodes: number;
  totalEdges: number;
  totalStake: number;
  avgTrustLevel: number;
  mostTrusted: string[];
}

export interface TrustGraphConfig {
  db: JobDatabase;
  dkg?: DKGPublisher;
  maxHops: number;
  minTrustLevel: number;
}

export class TrustGraph {
  private db: JobDatabase;
  private dkg?: DKGPublisher;
  private maxHops: number;
  private minTrustLevel: number;

  // In-memory graph for fast traversal
  private adjacencyList = new Map<string, Map<string, TrustEdge>>();
  private reverseAdjacencyList = new Map<string, Map<string, TrustEdge>>();

  constructor(config: TrustGraphConfig) {
    this.db = config.db;
    this.dkg = config.dkg;
    this.maxHops = config.maxHops;
    this.minTrustLevel = config.minTrustLevel;
  }

  async initialize(): Promise<void> {
    // Load all trust edges from database into memory
    // Note: For large graphs, this should be lazy-loaded
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
  }

  async addTrustEdge(params: {
    fromAgent: string;
    toAgent: string;
    trustLevel: number;
    trustType: 'vouches' | 'delegates' | 'endorses';
    stakeSol?: number;
  }): Promise<{ edgeId: number; ual: string | null }> {
    // Input validation
    if (!params.fromAgent || params.fromAgent.length > MAX_AGENT_ID_LENGTH) {
      throw new Error('Invalid fromAgent');
    }
    if (!params.toAgent || params.toAgent.length > MAX_AGENT_ID_LENGTH) {
      throw new Error('Invalid toAgent');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(params.fromAgent) || !/^[a-zA-Z0-9_-]+$/.test(params.toAgent)) {
      throw new Error('Agent IDs must be alphanumeric');
    }
    if (params.fromAgent === params.toAgent) {
      throw new Error('Cannot create trust edge to self');
    }
    if (!Number.isFinite(params.trustLevel) || params.trustLevel < 0 || params.trustLevel > 100) {
      throw new Error('Trust level must be 0-100');
    }
    if (params.stakeSol !== undefined && (!Number.isFinite(params.stakeSol) || params.stakeSol < 0 || params.stakeSol > 1_000_000)) {
      throw new Error('Invalid stake amount');
    }

    // Bound graph size
    if (this.adjacencyList.size >= MAX_GRAPH_NODES) {
      throw new Error('Trust graph capacity exceeded');
    }

    // Save to database
    const edgeId = this.db.saveTrustEdge({
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      trustLevel: params.trustLevel,
      trustType: params.trustType,
      stakeSol: params.stakeSol,
    });

    // Update in-memory graph
    if (!this.adjacencyList.has(params.fromAgent)) {
      this.adjacencyList.set(params.fromAgent, new Map());
    }
    if (!this.reverseAdjacencyList.has(params.toAgent)) {
      this.reverseAdjacencyList.set(params.toAgent, new Map());
    }

    const edge: TrustEdge = {
      id: edgeId,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      trustLevel: params.trustLevel,
      trustType: params.trustType,
      stakeSol: params.stakeSol ?? 0,
      ual: null,
      createdAt: Date.now(),
    };

    this.adjacencyList.get(params.fromAgent)!.set(params.toAgent, edge);
    this.reverseAdjacencyList.get(params.toAgent)!.set(params.fromAgent, edge);

    // Publish to DKG if available
    let ual: string | null = null;
    if (this.dkg) {
      try {
        ual = await this.dkg.publishTrustEdge({
          trustorId: params.fromAgent,
          trusteeId: params.toAgent,
          trustLevel: params.trustLevel,
          trustType: params.trustType,
          stakeAmount: params.stakeSol ?? 0,
        });
      } catch (err) {
        console.error('[TrustGraph] DKG publish failed:', err);
      }
    }

    return { edgeId, ual };
  }

  getTrustLevel(fromAgent: string, toAgent: string): number | null {
    const edges = this.adjacencyList.get(fromAgent);
    if (!edges) return null;
    const edge = edges.get(toAgent);
    return edge?.trustLevel ?? null;
  }

  getDirectTrusted(agentId: string): TrustEdge[] {
    const edges = this.adjacencyList.get(agentId);
    if (!edges) return [];
    return Array.from(edges.values());
  }

  getTrustors(agentId: string): TrustEdge[] {
    const edges = this.reverseAdjacencyList.get(agentId);
    if (!edges) return [];
    return Array.from(edges.values());
  }

  findTrustPath(fromAgent: string, toAgent: string): TrustPath | null {
    if (!fromAgent || !toAgent || fromAgent.length > MAX_AGENT_ID_LENGTH || toAgent.length > MAX_AGENT_ID_LENGTH) {
      return null;
    }

    if (fromAgent === toAgent) {
      return {
        from: fromAgent,
        to: toAgent,
        hops: 0,
        path: [fromAgent],
        minTrustLevel: 100,
        totalStake: 0,
      };
    }

    // BFS with iteration limit to prevent infinite loops
    const visited = new Set<string>();
    const queue: Array<{
      current: string;
      path: string[];
      minTrust: number;
      totalStake: number;
    }> = [
      { current: fromAgent, path: [fromAgent], minTrust: 100, totalStake: 0 },
    ];

    let iterations = 0;
    while (queue.length > 0 && iterations < MAX_BFS_ITERATIONS) {
      iterations++;
      const { current, path, minTrust, totalStake } = queue.shift()!;

      if (path.length > this.maxHops + 1) continue;
      if (visited.has(current)) continue;
      visited.add(current);

      const edges = this.adjacencyList.get(current);
      if (!edges) continue;

      for (const [neighbor, edge] of edges) {
        if (edge.trustLevel < this.minTrustLevel) continue;

        const newPath = [...path, neighbor];
        const newMinTrust = Math.min(minTrust, edge.trustLevel);
        const newTotalStake = totalStake + edge.stakeSol;

        if (neighbor === toAgent) {
          return {
            from: fromAgent,
            to: toAgent,
            hops: newPath.length - 1,
            path: newPath,
            minTrustLevel: newMinTrust,
            totalStake: newTotalStake,
          };
        }

        queue.push({
          current: neighbor,
          path: newPath,
          minTrust: newMinTrust,
          totalStake: newTotalStake,
        });
      }
    }

    return null;
  }

  getNodeInfo(agentId: string): TrustNode {
    const outgoing = this.adjacencyList.get(agentId) ?? new Map();
    const incoming = this.reverseAdjacencyList.get(agentId) ?? new Map();

    let incomingTrust = 0;
    let outgoingTrust = 0;
    let totalStake = 0;

    for (const edge of incoming.values()) {
      incomingTrust += edge.trustLevel;
      totalStake += edge.stakeSol;
    }

    for (const edge of outgoing.values()) {
      outgoingTrust += edge.trustLevel;
      totalStake += edge.stakeSol;
    }

    return {
      agentId,
      incomingTrust,
      outgoingTrust,
      totalStake,
      edgeCount: incoming.size + outgoing.size,
    };
  }

  getStats(): TrustGraphStats {
    const nodes = new Set<string>();
    let totalEdges = 0;
    let totalStake = 0;
    let totalTrust = 0;

    for (const [from, edges] of this.adjacencyList) {
      nodes.add(from);
      for (const [to, edge] of edges) {
        nodes.add(to);
        totalEdges++;
        totalStake += edge.stakeSol;
        totalTrust += edge.trustLevel;
      }
    }

    // Find most trusted nodes
    const trustScores = new Map<string, number>();
    for (const [, edges] of this.reverseAdjacencyList) {
      for (const [, edge] of edges) {
        const current = trustScores.get(edge.toAgent) ?? 0;
        trustScores.set(edge.toAgent, current + edge.trustLevel);
      }
    }

    const mostTrusted = Array.from(trustScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    return {
      totalNodes: nodes.size,
      totalEdges,
      totalStake,
      avgTrustLevel: totalEdges > 0 ? totalTrust / totalEdges : 0,
      mostTrusted,
    };
  }

  getGraphSize(): number {
    return this.db.getTrustGraphSize();
  }

  exportForVisualization(): {
    nodes: Array<{ id: string; trust: number }>;
    edges: Array<{ from: string; to: string; weight: number }>;
  } {
    const nodes: Array<{ id: string; trust: number }> = [];
    const edges: Array<{ from: string; to: string; weight: number }> = [];
    const nodeSet = new Set<string>();

    for (const [from, edgeMap] of this.adjacencyList) {
      nodeSet.add(from);
      for (const [to, edge] of edgeMap) {
        nodeSet.add(to);
        edges.push({
          from,
          to,
          weight: edge.trustLevel,
        });
      }
    }

    for (const id of nodeSet) {
      const info = this.getNodeInfo(id);
      nodes.push({
        id,
        trust: info.incomingTrust,
      });
    }

    return { nodes, edges };
  }
}
