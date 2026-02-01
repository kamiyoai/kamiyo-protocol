import { useState, useEffect, useCallback } from "react";

export type Tier = "platinum" | "gold" | "silver" | "bronze" | "unverified";

export interface TrustNode {
  id: string;
  label: string;
  tier: Tier;
  reputation: number;
  txCount: number;
}

export interface TrustEdge {
  source: string;
  target: string;
  weight: number; // 0-100 trust level
}

export interface TrustGraphStats {
  totalNodes: number;
  totalEdges: number;
  avgTrust: number;
  tierCounts: Record<Tier, number>;
}

interface UseTrustGraphResult {
  nodes: TrustNode[];
  edges: TrustEdge[];
  stats: TrustGraphStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function generateMockData(): { nodes: TrustNode[]; edges: TrustEdge[] } {
  const tiers: Tier[] = ["platinum", "gold", "silver", "bronze", "unverified"];

  const nodes: TrustNode[] = [
    { id: "agent-001", label: "Oracle Agent", tier: "platinum", reputation: 95, txCount: 1247 },
    { id: "agent-002", label: "Data Fetcher", tier: "gold", reputation: 82, txCount: 856 },
    { id: "agent-003", label: "Price Bot", tier: "gold", reputation: 78, txCount: 423 },
    { id: "agent-004", label: "Arbitrage Scanner", tier: "silver", reputation: 65, txCount: 312 },
    { id: "agent-005", label: "Liquidity Monitor", tier: "silver", reputation: 58, txCount: 234 },
    { id: "agent-006", label: "Swap Executor", tier: "bronze", reputation: 42, txCount: 156 },
    { id: "agent-007", label: "Alert Bot", tier: "bronze", reputation: 35, txCount: 89 },
    { id: "agent-008", label: "Analytics Agent", tier: "platinum", reputation: 92, txCount: 2103 },
    { id: "agent-009", label: "Risk Assessor", tier: "gold", reputation: 76, txCount: 567 },
    { id: "agent-010", label: "Report Generator", tier: "silver", reputation: 54, txCount: 178 },
    { id: "agent-011", label: "New Agent", tier: "unverified", reputation: 12, txCount: 5 },
    { id: "agent-012", label: "Test Agent", tier: "unverified", reputation: 8, txCount: 2 },
  ];

  const edges: TrustEdge[] = [
    { source: "agent-001", target: "agent-002", weight: 85 },
    { source: "agent-001", target: "agent-008", weight: 92 },
    { source: "agent-002", target: "agent-003", weight: 72 },
    { source: "agent-002", target: "agent-004", weight: 58 },
    { source: "agent-003", target: "agent-006", weight: 45 },
    { source: "agent-004", target: "agent-005", weight: 63 },
    { source: "agent-005", target: "agent-006", weight: 38 },
    { source: "agent-006", target: "agent-007", weight: 32 },
    { source: "agent-008", target: "agent-009", weight: 78 },
    { source: "agent-008", target: "agent-002", weight: 81 },
    { source: "agent-009", target: "agent-010", weight: 55 },
    { source: "agent-009", target: "agent-004", weight: 48 },
    { source: "agent-010", target: "agent-007", weight: 28 },
    { source: "agent-001", target: "agent-009", weight: 70 },
    { source: "agent-003", target: "agent-005", weight: 52 },
    { source: "agent-011", target: "agent-006", weight: 15 },
    { source: "agent-012", target: "agent-011", weight: 10 },
  ];

  return { nodes, edges };
}

function computeStats(nodes: TrustNode[], edges: TrustEdge[]): TrustGraphStats {
  const tierCounts: Record<Tier, number> = {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    unverified: 0,
  };

  for (const node of nodes) {
    tierCounts[node.tier]++;
  }

  const avgTrust = edges.length > 0
    ? Math.round(edges.reduce((sum, e) => sum + e.weight, 0) / edges.length)
    : 0;

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    avgTrust,
    tierCounts,
  };
}

export function useTrustGraph(): UseTrustGraphResult {
  const [nodes, setNodes] = useState<TrustNode[]>([]);
  const [edges, setEdges] = useState<TrustEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API delay
      await new Promise((r) => setTimeout(r, 500));

      const { nodes: mockNodes, edges: mockEdges } = generateMockData();
      setNodes(mockNodes);
      setEdges(mockEdges);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch trust graph");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = computeStats(nodes, edges);

  return {
    nodes,
    edges,
    stats,
    loading,
    error,
    refetch: fetchData,
  };
}
