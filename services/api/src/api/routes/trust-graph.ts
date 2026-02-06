// Trust graph visualization routes - DKG-powered

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { logger } from '../../logger';
import {
  AgentParanetClient,
  sparqlQueries,
  scoreToTierName,
} from '@kamiyo/agent-paranet';

const router: IRouter = Router();

// Trust graph tiers (visual representation)
type Tier = 'oracle' | 'sentinel' | 'architect' | 'scout' | 'ghost';

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

// Map kamiyo tier names to visualization tiers
function mapTier(tierName: string): Tier {
  const mapping: Record<string, Tier> = {
    platinum: 'oracle',
    gold: 'sentinel',
    silver: 'architect',
    bronze: 'scout',
    unverified: 'ghost',
  };
  return mapping[tierName.toLowerCase()] || 'ghost';
}

// Lazy-initialized DKG client
let dkgClient: AgentParanetClient | null = null;

type BlockchainId = 'base:8453' | 'gnosis:100' | 'otp:2043';

function getBlockchainId(): BlockchainId {
  const env = process.env.DKG_BLOCKCHAIN;
  if (env === 'gnosis:100' || env === 'otp:2043') return env;
  return 'base:8453';
}

async function getDKGClient(): Promise<AgentParanetClient | null> {
  if (dkgClient) return dkgClient;

  const endpoint = process.env.DKG_ENDPOINT;
  if (!endpoint) {
    logger.warn('DKG_ENDPOINT not configured, using mock data');
    return null;
  }

  try {
    dkgClient = await AgentParanetClient.create({
      dkgEndpoint: endpoint,
      dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
      blockchain: getBlockchainId(),
      privateKey: process.env.DKG_PRIVATE_KEY,
    });
    logger.info('DKG client initialized for trust-graph');
    return dkgClient;
  } catch (err) {
    logger.error('Failed to initialize DKG client', { error: String(err) });
    return null;
  }
}

// Extract a numeric value from DKG SPARQL results.
// DKG returns typed literals like '"95"^^http://www.w3.org/2001/XMLSchema#integer'
// or plain strings like '"95"'. This extracts the leading number.
function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  const s = String(val || '');
  const match = s.match(/^"?(-?[\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// DKG query options — data lives in the publicKnowledgeAssets repository
const DKG_QUERY_OPTS = { repository: 'publicKnowledgeAssets' };

// Fetch nodes and edges from DKG
async function fetchGraphFromDKG(): Promise<{ nodes: TrustNode[]; edges: TrustEdge[] }> {
  const client = await getDKGClient();
  if (!client) {
    return { nodes: MOCK_NODES, edges: MOCK_EDGES };
  }

  try {
    const dkg = client.rawDKG;

    // Query all providers with reputation data
    const providerQuery = sparqlQueries.queryTopProviders({ limit: 100, minQuality: 0, minTasks: 0 });
    const providerResult = await dkg.graph.query(providerQuery, 'SELECT', DKG_QUERY_OPTS);

    const nodes: TrustNode[] = [];
    const nodeIds = new Set<string>();

    if (providerResult.data && Array.isArray(providerResult.data)) {
      for (const item of providerResult.data) {
        const row = item as Record<string, unknown>;
        const id = String(row.provider || '').replace('urn:erc8004:', '');
        if (!id || nodeIds.has(id)) continue;
        nodeIds.add(id);

        const avgQuality = parseNum(row.avgQuality);
        const taskCount = parseNum(row.taskCount);
        const tierName = scoreToTierName(avgQuality);

        nodes.push({
          id,
          label: id.slice(0, 16) + '...',
          tier: mapTier(tierName),
          reputation: Math.round(avgQuality),
          txCount: Math.round(taskCount),
        });
      }
    }

    // Query trust relationships for edges
    const edges: TrustEdge[] = [];
    const edgeSet = new Set<string>();

    for (const node of nodes.slice(0, 20)) {
      try {
        const trustQuery = sparqlQueries.queryOutgoingTrust(node.id);
        const trustResult = await dkg.graph.query(trustQuery, 'SELECT', DKG_QUERY_OPTS);

        if (trustResult.data && Array.isArray(trustResult.data)) {
          for (const item of trustResult.data) {
            const row = item as Record<string, unknown>;
            const target = String(row.trustee || '').replace('urn:erc8004:', '');
            const weight = parseNum(row.trustLevel);

            if (!target || !nodeIds.has(target)) continue;

            const edgeKey = `${node.id}:${target}`;
            if (edgeSet.has(edgeKey)) continue;
            edgeSet.add(edgeKey);

            edges.push({
              source: node.id,
              target,
              weight: Math.round(weight) || 50,
            });
          }
        }
      } catch {
        // Skip failed trust queries
      }
    }

    if (nodes.length === 0) {
      logger.warn('No nodes from DKG, falling back to mock data');
      return { nodes: MOCK_NODES, edges: MOCK_EDGES };
    }

    return { nodes, edges };
  } catch (err) {
    logger.error('Failed to fetch graph from DKG', { error: String(err) });
    return { nodes: MOCK_NODES, edges: MOCK_EDGES };
  }
}

// Mock trust graph data (fallback)
const MOCK_NODES: TrustNode[] = [
  { id: 'agent-001', label: 'Oracle Agent', tier: 'oracle', reputation: 95, txCount: 1247 },
  { id: 'agent-002', label: 'Data Fetcher', tier: 'sentinel', reputation: 82, txCount: 856 },
  { id: 'agent-003', label: 'Price Bot', tier: 'sentinel', reputation: 78, txCount: 423 },
  { id: 'agent-004', label: 'Arbitrage Scanner', tier: 'architect', reputation: 65, txCount: 312 },
  { id: 'agent-005', label: 'Liquidity Monitor', tier: 'architect', reputation: 58, txCount: 234 },
  { id: 'agent-006', label: 'Swap Executor', tier: 'scout', reputation: 42, txCount: 156 },
  { id: 'agent-007', label: 'Alert Bot', tier: 'scout', reputation: 35, txCount: 89 },
  { id: 'agent-008', label: 'Analytics Agent', tier: 'oracle', reputation: 92, txCount: 2103 },
  { id: 'agent-009', label: 'Risk Assessor', tier: 'sentinel', reputation: 76, txCount: 567 },
  { id: 'agent-010', label: 'Report Generator', tier: 'architect', reputation: 54, txCount: 178 },
  { id: 'agent-011', label: 'New Agent', tier: 'ghost', reputation: 12, txCount: 5 },
  { id: 'agent-012', label: 'Test Agent', tier: 'ghost', reputation: 8, txCount: 2 },
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
    oracle: 0,
    sentinel: 0,
    architect: 0,
    scout: 0,
    ghost: 0,
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

// Cache for graph data (refresh every 5 minutes)
let graphCache: { nodes: TrustNode[]; edges: TrustEdge[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCachedGraph(): Promise<{ nodes: TrustNode[]; edges: TrustEdge[] }> {
  if (graphCache && Date.now() - graphCache.timestamp < CACHE_TTL_MS) {
    return { nodes: graphCache.nodes, edges: graphCache.edges };
  }

  const { nodes, edges } = await fetchGraphFromDKG();
  graphCache = { nodes, edges, timestamp: Date.now() };
  return { nodes, edges };
}

// GET /api/trust-graph
router.get('/', async (req: Request, res: Response) => {
  const center = req.query.center as string | undefined;
  const depth = Math.min(Math.max(parseInt(req.query.depth as string) || 3, 1), 10);
  const refresh = req.query.refresh === 'true';

  try {
    if (refresh) {
      graphCache = null;
    }

    let { nodes, edges } = await getCachedGraph();

    // Filter by center node and depth if specified
    if (center) {
      const filtered = filterGraphByDepth(nodes, edges, center, depth);
      nodes = filtered.nodes;
      edges = filtered.edges;
    }

    const stats = computeStats(nodes, edges);
    const usingDKG = !!process.env.DKG_ENDPOINT;

    res.json({
      nodes,
      edges,
      stats,
      query: {
        center: center || null,
        depth,
      },
      source: usingDKG ? 'dkg' : 'mock',
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

  const { nodes, edges } = await getCachedGraph();
  const node = nodes.find(n => n.id === nodeId);

  if (!node) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Node not found' },
    });
    return;
  }

  // Find connected edges
  const connections = edges.filter(
    e => e.source === nodeId || e.target === nodeId
  ).map(e => ({
    ...e,
    direction: e.source === nodeId ? 'outgoing' : 'incoming',
    peerId: e.source === nodeId ? e.target : e.source,
  }));

  // Get peer node details
  const peers = connections.map(c => {
    const peer = nodes.find(n => n.id === c.peerId);
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

// Tier colors for SVG
const TIER_COLORS: Record<Tier, string> = {
  oracle: '#00f0ff',
  sentinel: '#9944ff',
  architect: '#ffaa22',
  scout: '#ff44f5',
  ghost: '#505050',
};

// GET /api/trust-graph/image - Generate SVG preview for OG image
router.get('/image', async (_req: Request, res: Response) => {
  const width = 1200;
  const height = 630;

  const { nodes, edges } = await getCachedGraph();
  const stats = computeStats(nodes, edges);

  // Simple force-directed layout
  const positioned = nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const radius = 200 + Math.random() * 50;
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });

  const nodeMap = new Map(positioned.map(n => [n.id, n]));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="100%" style="stop-color:#111111"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="60" y="50" fill="#00f0ff" font-family="monospace" font-size="28" font-weight="bold">KAMIYO Trust Graph</text>
  <text x="60" y="80" fill="#666" font-family="monospace" font-size="14">${stats.totalNodes} agents · ${stats.totalEdges} trust edges · ${stats.avgTrust}% avg trust</text>
`;

  // Draw edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    const opacity = 0.2 + (edge.weight / 100) * 0.4;
    svg += `  <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#00f0ff" stroke-width="1" stroke-opacity="${opacity}"/>\n`;
  }

  // Draw nodes
  for (const node of positioned) {
    const color = TIER_COLORS[node.tier];
    const size = node.tier === 'oracle' ? 16 : node.tier === 'sentinel' ? 14 : node.tier === 'architect' ? 12 : 10;
    svg += `  <circle cx="${node.x}" cy="${node.y}" r="${size}" fill="${color}" filter="url(#glow)"/>\n`;
  }

  // Tier legend
  const tiers: Tier[] = ['oracle', 'sentinel', 'architect', 'scout', 'ghost'];
  tiers.forEach((tier, i) => {
    const y = height - 100 + i * 18;
    svg += `  <circle cx="70" cy="${y}" r="6" fill="${TIER_COLORS[tier]}"/>`;
    svg += `  <text x="85" y="${y + 4}" fill="#888" font-family="monospace" font-size="12">${tier} (${stats.tierCounts[tier]})</text>\n`;
  });

  svg += '</svg>';

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(svg);
});

// GET /api/trust-graph/stats - Just stats for quick display
router.get('/stats', async (_req: Request, res: Response) => {
  const { nodes, edges } = await getCachedGraph();
  const stats = computeStats(nodes, edges);
  const usingDKG = !!process.env.DKG_ENDPOINT;
  res.json({ ...stats, source: usingDKG ? 'dkg' : 'mock' });
});

// Tier priority for sorting
const TIER_PRIORITY: Record<Tier, number> = {
  oracle: 5,
  sentinel: 4,
  architect: 3,
  scout: 2,
  ghost: 1,
};

// GET /api/trust-graph/leaderboard - Ranked agent list
router.get('/leaderboard', async (req: Request, res: Response) => {
  const sort = (req.query.sort as string) || 'reputation';
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
  const tierFilter = req.query.tier as string | undefined;

  try {
    let { nodes } = await getCachedGraph();

    // Filter by tier if specified (comma-separated)
    if (tierFilter) {
      const allowedTiers = new Set(tierFilter.split(',').map(t => t.trim().toLowerCase()));
      nodes = nodes.filter(n => allowedTiers.has(n.tier));
    }

    // Sort by requested field
    const sorted = [...nodes].sort((a, b) => {
      switch (sort) {
        case 'txCount':
        case 'tasks':
          return b.txCount - a.txCount;
        case 'tier':
          return TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier] || b.reputation - a.reputation;
        case 'reputation':
        default:
          return b.reputation - a.reputation;
      }
    });

    // Apply limit and add rank
    const ranked = sorted.slice(0, limit).map((node, i) => ({
      rank: i + 1,
      ...node,
    }));

    // Compute tier counts from full (unfiltered) data
    const { nodes: allNodes } = await getCachedGraph();
    const tierCounts: Record<Tier, number> = {
      oracle: 0,
      sentinel: 0,
      architect: 0,
      scout: 0,
      ghost: 0,
    };
    for (const node of allNodes) {
      tierCounts[node.tier]++;
    }

    const usingDKG = !!process.env.DKG_ENDPOINT;

    res.json({
      agents: ranked,
      totalAgents: allNodes.length,
      filteredCount: nodes.length,
      tierCounts,
      query: { sort, limit, tier: tierFilter || null },
      source: usingDKG ? 'dkg' : 'mock',
    });
  } catch (err) {
    logger.error('Failed to fetch leaderboard', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leaderboard' },
    });
  }
});

// Extended agent details for detail panel
interface AgentDetails extends TrustNode {
  incomingTrust: number;
  outgoingTrust: number;
  peerCount: number;
  topPeers: Array<{ id: string; label: string; tier: Tier; direction: 'incoming' | 'outgoing'; weight: number }>;
}

// GET /api/trust-graph/agent/:id/details - Full agent details with trust connections
router.get('/agent/:id/details', async (req: Request, res: Response) => {
  const agentId = req.params.id;

  try {
    const { nodes, edges } = await getCachedGraph();
    const node = nodes.find(n => n.id === agentId);

    if (!node) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Agent not found' },
      });
      return;
    }

    // Find all connections
    const incoming = edges.filter(e => e.target === agentId);
    const outgoing = edges.filter(e => e.source === agentId);

    // Calculate trust scores
    const incomingTrust = incoming.length > 0
      ? Math.round(incoming.reduce((sum, e) => sum + e.weight, 0) / incoming.length)
      : 0;
    const outgoingTrust = outgoing.length > 0
      ? Math.round(outgoing.reduce((sum, e) => sum + e.weight, 0) / outgoing.length)
      : 0;

    // Build peer list
    const peers: AgentDetails['topPeers'] = [];

    for (const edge of incoming) {
      const peer = nodes.find(n => n.id === edge.source);
      if (peer) {
        peers.push({
          id: peer.id,
          label: peer.label,
          tier: peer.tier,
          direction: 'incoming',
          weight: edge.weight,
        });
      }
    }

    for (const edge of outgoing) {
      const peer = nodes.find(n => n.id === edge.target);
      if (peer) {
        peers.push({
          id: peer.id,
          label: peer.label,
          tier: peer.tier,
          direction: 'outgoing',
          weight: edge.weight,
        });
      }
    }

    // Sort peers by weight, limit to top 10
    peers.sort((a, b) => b.weight - a.weight);
    const topPeers = peers.slice(0, 10);

    // Calculate rank
    const sortedNodes = [...nodes].sort((a, b) => b.reputation - a.reputation);
    const rank = sortedNodes.findIndex(n => n.id === agentId) + 1;

    const details: AgentDetails & { rank: number } = {
      ...node,
      rank,
      incomingTrust,
      outgoingTrust,
      peerCount: incoming.length + outgoing.length,
      topPeers,
    };

    const usingDKG = !!process.env.DKG_ENDPOINT;

    res.json({
      agent: details,
      source: usingDKG ? 'dkg' : 'mock',
    });
  } catch (err) {
    logger.error('Failed to fetch agent details', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch agent details' },
    });
  }
});

export default router;
