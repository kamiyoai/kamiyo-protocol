// Trust graph visualization routes

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { logger } from '../../logger';

const router: IRouter = Router();

type Tier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'unverified';

interface TrustNode {
  id: string;
  label: string;
  tier: Tier;
  reputation: number;
  txCount: number;
}

interface TrustEdge {
  source: string;
  target: string;
  weight: number;
}

interface TrustGraphStats {
  totalNodes: number;
  totalEdges: number;
  avgTrust: number;
  tierCounts: Record<Tier, number>;
}

// Mock trust graph data
const MOCK_NODES: TrustNode[] = [
  { id: 'agent-001', label: 'Oracle Agent', tier: 'platinum', reputation: 95, txCount: 1247 },
  { id: 'agent-002', label: 'Data Fetcher', tier: 'gold', reputation: 82, txCount: 856 },
  { id: 'agent-003', label: 'Price Bot', tier: 'gold', reputation: 78, txCount: 423 },
  { id: 'agent-004', label: 'Arbitrage Scanner', tier: 'silver', reputation: 65, txCount: 312 },
  { id: 'agent-005', label: 'Liquidity Monitor', tier: 'silver', reputation: 58, txCount: 234 },
  { id: 'agent-006', label: 'Swap Executor', tier: 'bronze', reputation: 42, txCount: 156 },
  { id: 'agent-007', label: 'Alert Bot', tier: 'bronze', reputation: 35, txCount: 89 },
  { id: 'agent-008', label: 'Analytics Agent', tier: 'platinum', reputation: 92, txCount: 2103 },
  { id: 'agent-009', label: 'Risk Assessor', tier: 'gold', reputation: 76, txCount: 567 },
  { id: 'agent-010', label: 'Report Generator', tier: 'silver', reputation: 54, txCount: 178 },
  { id: 'agent-011', label: 'New Agent', tier: 'unverified', reputation: 12, txCount: 5 },
  { id: 'agent-012', label: 'Test Agent', tier: 'unverified', reputation: 8, txCount: 2 },
];

const MOCK_EDGES: TrustEdge[] = [
  { source: 'agent-001', target: 'agent-002', weight: 85 },
  { source: 'agent-001', target: 'agent-008', weight: 92 },
  { source: 'agent-002', target: 'agent-003', weight: 72 },
  { source: 'agent-002', target: 'agent-004', weight: 58 },
  { source: 'agent-003', target: 'agent-006', weight: 45 },
  { source: 'agent-004', target: 'agent-005', weight: 63 },
  { source: 'agent-005', target: 'agent-006', weight: 38 },
  { source: 'agent-006', target: 'agent-007', weight: 32 },
  { source: 'agent-008', target: 'agent-009', weight: 78 },
  { source: 'agent-008', target: 'agent-002', weight: 81 },
  { source: 'agent-009', target: 'agent-010', weight: 55 },
  { source: 'agent-009', target: 'agent-004', weight: 48 },
  { source: 'agent-010', target: 'agent-007', weight: 28 },
  { source: 'agent-001', target: 'agent-009', weight: 70 },
  { source: 'agent-003', target: 'agent-005', weight: 52 },
  { source: 'agent-011', target: 'agent-006', weight: 15 },
  { source: 'agent-012', target: 'agent-011', weight: 10 },
];

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

function filterGraphByDepth(
  nodes: TrustNode[],
  edges: TrustEdge[],
  centerId: string | null,
  depth: number
): { nodes: TrustNode[]; edges: TrustEdge[] } {
  if (!centerId || depth <= 0) {
    return { nodes, edges };
  }

  const centerNode = nodes.find(n => n.id === centerId);
  if (!centerNode) {
    return { nodes: [], edges: [] };
  }

  // BFS to find nodes within depth
  const visited = new Set<string>([centerId]);
  const queue: { id: string; d: number }[] = [{ id: centerId, d: 0 }];

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= depth) continue;

    // Find connected nodes
    for (const edge of edges) {
      let neighborId: string | null = null;
      if (edge.source === id && !visited.has(edge.target)) {
        neighborId = edge.target;
      } else if (edge.target === id && !visited.has(edge.source)) {
        neighborId = edge.source;
      }

      if (neighborId) {
        visited.add(neighborId);
        queue.push({ id: neighborId, d: d + 1 });
      }
    }
  }

  const filteredNodes = nodes.filter(n => visited.has(n.id));
  const filteredEdges = edges.filter(
    e => visited.has(e.source) && visited.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

// GET /api/trust-graph
router.get('/', async (req: Request, res: Response) => {
  const center = req.query.center as string | undefined;
  const depth = Math.min(Math.max(parseInt(req.query.depth as string) || 3, 1), 10);

  try {
    let nodes = MOCK_NODES;
    let edges = MOCK_EDGES;

    // Filter by center node and depth if specified
    if (center) {
      const filtered = filterGraphByDepth(nodes, edges, center, depth);
      nodes = filtered.nodes;
      edges = filtered.edges;
    }

    const stats = computeStats(nodes, edges);

    res.json({
      nodes,
      edges,
      stats,
      query: {
        center: center || null,
        depth,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch trust graph', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch trust graph' },
    });
  }
});

// GET /api/trust-graph/node/:id
router.get('/node/:id', async (req: Request, res: Response) => {
  const nodeId = req.params.id;

  const node = MOCK_NODES.find(n => n.id === nodeId);
  if (!node) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Node not found' },
    });
    return;
  }

  // Find connected edges
  const connections = MOCK_EDGES.filter(
    e => e.source === nodeId || e.target === nodeId
  ).map(e => ({
    ...e,
    direction: e.source === nodeId ? 'outgoing' : 'incoming',
    peerId: e.source === nodeId ? e.target : e.source,
  }));

  // Get peer node details
  const peers = connections.map(c => {
    const peer = MOCK_NODES.find(n => n.id === c.peerId);
    return {
      ...c,
      peer: peer ? { id: peer.id, label: peer.label, tier: peer.tier } : null,
    };
  });

  res.json({
    node,
    connections: peers,
    totalConnections: connections.length,
  });
});

export default router;
