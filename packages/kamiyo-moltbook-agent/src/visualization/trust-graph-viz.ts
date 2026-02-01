import type { TrustGraph } from '../services/trust-graph.js';
import type { ReputationService } from '../services/reputation-service.js';
import type { BadgeService } from '../services/badge-service.js';

export interface GraphNode {
  id: string;
  label: string;
  tier: string | null;
  badges: number;
  trustScore: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'vouches' | 'delegates' | 'endorses';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgTrustLevel: number;
  mostConnected: string | null;
  tierDistribution: Record<string, number>;
}

export interface VizConfig {
  width: number;
  height: number;
  nodeRadius: number;
  edgeWidth: number;
  showLabels: boolean;
  colorByTier: boolean;
}

// Trust graph tiers (visual representation)
export type TrustTier = 'oracle' | 'sentinel' | 'architect' | 'scout' | 'ghost';

const TIER_COLORS: Record<string, string> = {
  oracle: '#00f0ff',     // cyan - highest trust
  sentinel: '#9944ff',   // purple - high trust
  architect: '#ffaa22',  // orange - established
  scout: '#ff44f5',      // pink - emerging
  ghost: '#505050',      // gray - unverified
};

// Map reputation tiers to trust graph tiers
export function mapReputationToTrustTier(reputationTier: string | null): TrustTier {
  switch (reputationTier) {
    case 'platinum': return 'oracle';
    case 'gold': return 'sentinel';
    case 'silver': return 'architect';
    case 'bronze': return 'scout';
    default: return 'ghost';
  }
}

const DEFAULT_CONFIG: VizConfig = {
  width: 800,
  height: 600,
  nodeRadius: 20,
  edgeWidth: 2,
  showLabels: true,
  colorByTier: true,
};

export class TrustGraphVisualizer {
  private trustGraph: TrustGraph;
  private reputationService?: ReputationService;
  private badgeService?: BadgeService;

  constructor(params: {
    trustGraph: TrustGraph;
    reputationService?: ReputationService;
    badgeService?: BadgeService;
  }) {
    this.trustGraph = params.trustGraph;
    this.reputationService = params.reputationService;
    this.badgeService = params.badgeService;
  }

  async buildGraphData(): Promise<GraphData> {
    const rawData = this.trustGraph.exportForVisualization();

    const nodes: GraphNode[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Build nodes
    for (const rawNode of rawData.nodes) {
      const reputationTier = await this.getAgentTier(rawNode.id);
      const tier = mapReputationToTrustTier(reputationTier);
      const badges = this.badgeService?.getBadges(rawNode.id).length ?? 0;

      const node: GraphNode = {
        id: rawNode.id,
        label: `@${rawNode.id}`,
        tier,
        badges,
        trustScore: rawNode.trust,
      };

      nodes.push(node);
      nodeMap.set(rawNode.id, node);
    }

    // Build edges
    const edges: GraphEdge[] = rawData.edges.map((e) => ({
      source: e.from,
      target: e.to,
      weight: e.weight,
      type: 'endorses' as const,
    }));

    // Calculate stats
    const stats = this.calculateStats(nodes, edges);

    return { nodes, edges, stats };
  }

  private async getAgentTier(agentId: string): Promise<string | null> {
    if (!this.reputationService) return null;

    const data = await this.reputationService.getReputationData(agentId);
    if (!data) return null;

    const tiers = this.reputationService.getAllTiers();
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (data.score >= tiers[i].threshold) {
        return tiers[i].name;
      }
    }

    return null;
  }

  private calculateStats(nodes: GraphNode[], edges: GraphEdge[]): GraphStats {
    const tierDist: Record<string, number> = {
      oracle: 0,
      sentinel: 0,
      architect: 0,
      scout: 0,
      ghost: 0,
    };

    for (const node of nodes) {
      const tier = node.tier || 'ghost';
      tierDist[tier] = (tierDist[tier] || 0) + 1;
    }

    const avgTrust = edges.length > 0
      ? edges.reduce((sum, e) => sum + e.weight, 0) / edges.length
      : 0;

    // Find most connected node
    const connectionCount = new Map<string, number>();
    for (const edge of edges) {
      connectionCount.set(edge.source, (connectionCount.get(edge.source) || 0) + 1);
      connectionCount.set(edge.target, (connectionCount.get(edge.target) || 0) + 1);
    }

    let mostConnected: string | null = null;
    let maxConnections = 0;
    for (const [id, count] of connectionCount) {
      if (count > maxConnections) {
        maxConnections = count;
        mostConnected = id;
      }
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      avgTrustLevel: Math.round(avgTrust),
      mostConnected,
      tierDistribution: tierDist,
    };
  }

  applyForceLayout(data: GraphData, config: VizConfig = DEFAULT_CONFIG): GraphData {
    const nodes = [...data.nodes];
    const edges = [...data.edges];

    // Initialize random positions
    for (const node of nodes) {
      node.x = Math.random() * config.width;
      node.y = Math.random() * config.height;
    }

    // Simple force-directed layout (100 iterations)
    const iterations = 100;
    const k = Math.sqrt((config.width * config.height) / nodes.length);

    for (let iter = 0; iter < iterations; iter++) {
      const temp = 1 - iter / iterations;

      // Repulsive forces between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x! - nodes[i].x!;
          const dy = nodes[j].y! - nodes[i].y!;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

          const force = (k * k) / dist;
          const fx = (dx / dist) * force * temp;
          const fy = (dy / dist) * force * temp;

          nodes[i].x! -= fx;
          nodes[i].y! -= fy;
          nodes[j].x! += fx;
          nodes[j].y! += fy;
        }
      }

      // Attractive forces along edges
      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

        const force = (dist * dist) / k;
        const fx = (dx / dist) * force * temp * 0.1;
        const fy = (dy / dist) * force * temp * 0.1;

        source.x! += fx;
        source.y! += fy;
        target.x! -= fx;
        target.y! -= fy;
      }

      // Keep nodes within bounds
      for (const node of nodes) {
        node.x = Math.max(config.nodeRadius, Math.min(config.width - config.nodeRadius, node.x!));
        node.y = Math.max(config.nodeRadius, Math.min(config.height - config.nodeRadius, node.y!));
      }
    }

    return { nodes, edges, stats: data.stats };
  }

  generateSVG(data: GraphData, config: VizConfig = DEFAULT_CONFIG): string {
    const layoutData = this.applyForceLayout(data, config);
    const { nodes, edges, stats } = layoutData;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.width} ${config.height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
    </marker>
  </defs>
  <style>
    .node { cursor: pointer; }
    .node:hover { opacity: 0.8; }
    .label { font-family: sans-serif; font-size: 12px; }
    .edge { stroke: #999; stroke-opacity: 0.6; }
    .stats { font-family: monospace; font-size: 11px; fill: #666; }
  </style>\n`;

    // Draw edges
    for (const edge of edges) {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;

      const opacity = edge.weight / 100;
      svg += `  <line class="edge" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke-width="${config.edgeWidth}" stroke-opacity="${opacity}" marker-end="url(#arrowhead)"/>\n`;
    }

    // Draw nodes
    for (const node of nodes) {
      const color = config.colorByTier
        ? TIER_COLORS[node.tier || 'ghost']
        : '#4a90d9';

      svg += `  <g class="node" transform="translate(${node.x}, ${node.y})">
    <circle r="${config.nodeRadius}" fill="${color}" stroke="#333" stroke-width="2"/>`;

      if (config.showLabels) {
        svg += `\n    <text class="label" y="${config.nodeRadius + 15}" text-anchor="middle">${node.label}</text>`;
      }

      svg += `\n  </g>\n`;
    }

    // Add stats overlay
    svg += `  <g class="stats" transform="translate(10, 20)">
    <text y="0">Nodes: ${stats.totalNodes}</text>
    <text y="15">Edges: ${stats.totalEdges}</text>
    <text y="30">Avg Trust: ${stats.avgTrustLevel}%</text>
  </g>\n`;

    svg += '</svg>';

    return svg;
  }

  generateASCII(data: GraphData): string {
    const { nodes, edges, stats } = data;

    let ascii = `
KAMIYO TRUST GRAPH
==================

Nodes: ${stats.totalNodes} | Edges: ${stats.totalEdges} | Avg Trust: ${stats.avgTrustLevel}%

`;

    // Tier distribution
    ascii += 'Tier Distribution:\n';
    for (const [tier, count] of Object.entries(stats.tierDistribution)) {
      if (count > 0) {
        const bar = '#'.repeat(Math.min(count, 20));
        ascii += `  ${tier.padEnd(12)} ${bar} (${count})\n`;
      }
    }

    ascii += '\nTop Connected Agents:\n';

    // Sort nodes by trust score
    const sorted = [...nodes].sort((a, b) => b.trustScore - a.trustScore);
    for (const node of sorted.slice(0, 10)) {
      const tierLabel = node.tier ? `[${node.tier.toUpperCase()}]` : '[UNVERIFIED]';
      ascii += `  ${node.label.padEnd(20)} ${tierLabel.padEnd(14)} Score: ${node.trustScore}\n`;
    }

    ascii += '\nTrust Edges:\n';
    for (const edge of edges.slice(0, 20)) {
      ascii += `  @${edge.source} --[${edge.weight}%]--> @${edge.target}\n`;
    }

    if (edges.length > 20) {
      ascii += `  ... and ${edges.length - 20} more edges\n`;
    }

    return ascii;
  }

  generateMermaid(data: GraphData): string {
    const { nodes, edges } = data;

    let mermaid = 'graph LR\n';

    // Add node definitions with styles
    for (const node of nodes) {
      const style = node.tier
        ? `style ${node.id} fill:${TIER_COLORS[node.tier]}`
        : '';
      mermaid += `    ${node.id}["@${node.id}"]\n`;
      if (style) {
        mermaid += `    ${style}\n`;
      }
    }

    mermaid += '\n';

    // Add edges
    for (const edge of edges) {
      const label = `${edge.weight}%`;
      mermaid += `    ${edge.source} -->|${label}| ${edge.target}\n`;
    }

    return mermaid;
  }

  formatShareablePost(data: GraphData): string {
    const { stats } = data;

    return `## KAMIYO Trust Graph Update

**Network Stats:**
- ${stats.totalNodes} agents in the trust graph
- ${stats.totalEdges} trust relationships
- ${stats.avgTrustLevel}% average trust level

**Tier Breakdown:**
${Object.entries(stats.tierDistribution)
  .filter(([, count]) => count > 0)
  .map(([tier, count]) => `- ${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${count}`)
  .join('\n')}

${stats.mostConnected ? `**Most Connected:** @${stats.mostConnected}` : ''}

---

Want to join the trust graph?
- Get verified: \`@kamiyo verify my reputation\`
- Trust someone: \`@kamiyo trust @agent\`

*The more connections, the stronger the network.*`;
  }
}
