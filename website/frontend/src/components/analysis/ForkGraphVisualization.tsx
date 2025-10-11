/**
 * Fork Graph Visualization Component
 *
 * Interactive force-directed graph showing relationships between forked contracts
 * and exploit families. Uses D3.js for rendering and physics simulation.
 *
 * Features:
 * - Drag and zoom interactions
 * - Color-coded nodes by exploit severity
 * - Tooltips showing contract details
 * - Filtering by chain/severity
 * - Export to PNG/SVG
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

interface ForkNode {
  id: string;
  label: string;
  exploit_id?: string;
  contract_address: string;
  chain: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  amount_usd: number;
  date: string;
  is_root?: boolean;
}

interface ForkLink {
  source: string;
  target: string;
  similarity_score: number;
  relationship_type: 'direct_fork' | 'similar_bytecode' | 'same_pattern';
}

interface ForkGraphData {
  nodes: ForkNode[];
  links: ForkLink[];
}

interface ForkGraphVisualizationProps {
  data: ForkGraphData;
  width?: number;
  height?: number;
  onNodeClick?: (node: ForkNode) => void;
}

const ForkGraphVisualization: React.FC<ForkGraphVisualizationProps> = ({
  data,
  width = 1200,
  height = 800,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<ForkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ForkNode | null>(null);

  // Color scale based on severity
  const severityColor = useCallback((severity: string) => {
    switch (severity) {
      case 'critical':
        return '#ff008d';
      case 'high':
        return '#cc11f0';
      case 'medium':
        return '#f96363';
      case 'low':
        return '#fee801';
      default:
        return '#808080';
    }
  }, []);

  // Link color based on relationship type
  const linkColor = useCallback((type: string) => {
    switch (type) {
      case 'direct_fork':
        return '#00ffff'; // cyan
      case 'similar_bytecode':
        return '#ff44f5'; // magenta
      case 'same_pattern':
        return '#888888';
      default:
        return '#444444';
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create simulation
    const simulation = d3.forceSimulation(data.nodes as any)
      .force('link', d3.forceLink(data.links)
        .id((d: any) => d.id)
        .distance(100)
        .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create arrow markers for directed edges
    svg.append('defs').selectAll('marker')
      .data(['direct_fork', 'similar_bytecode', 'same_pattern'])
      .enter().append('marker')
      .attr('id', d => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', d => linkColor(d));

    // Create links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.links)
      .enter().append('line')
      .attr('stroke', d => linkColor(d.relationship_type))
      .attr('stroke-width', d => Math.max(1, d.similarity_score * 3))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', d => `url(#arrow-${d.relationship_type})`);

    // Create nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(data.nodes)
      .enter().append('g')
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Add circles for nodes
    node.append('circle')
      .attr('r', d => d.is_root ? 15 : 10)
      .attr('fill', d => severityColor(d.severity))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9)
      .on('mouseover', function(event, d) {
        setHoveredNode(d);
        d3.select(this)
          .attr('stroke-width', 4)
          .attr('r', d.is_root ? 18 : 13);
      })
      .on('mouseout', function(event, d) {
        setHoveredNode(null);
        d3.select(this)
          .attr('stroke-width', 2)
          .attr('r', d.is_root ? 15 : 10);
      })
      .on('click', (event, d) => {
        setSelectedNode(d);
        if (onNodeClick) onNodeClick(d);
      });

    // Add labels
    node.append('text')
      .text(d => d.label.length > 20 ? d.label.substring(0, 20) + '...' : d.label)
      .attr('font-size', '10px')
      .attr('dx', 15)
      .attr('dy', 4)
      .attr('fill', '#e0e0e0')
      .attr('pointer-events', 'none');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, width, height, severityColor, linkColor, onNodeClick]);

  return (
    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
      {/* Graph Legend */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-80 border border-gray-500 border-opacity-25 rounded p-3 text-xs z-10">
        <div className="font-light text-gray-400 mb-2">Severity</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff008d' }}></div>
            <span className="text-gray-300">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#cc11f0' }}></div>
            <span className="text-gray-300">High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f96363' }}></div>
            <span className="text-gray-300">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#fee801' }}></div>
            <span className="text-gray-300">Low</span>
          </div>
        </div>

        <div className="font-light text-gray-400 mb-2 mt-4">Relationships</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5" style={{ backgroundColor: '#00ffff' }}></div>
            <span className="text-gray-300">Direct Fork</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5" style={{ backgroundColor: '#ff44f5' }}></div>
            <span className="text-gray-300">Similar Code</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5" style={{ backgroundColor: '#888888' }}></div>
            <span className="text-gray-300">Same Pattern</span>
          </div>
        </div>
      </div>

      {/* Graph Stats */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-80 border border-gray-500 border-opacity-25 rounded p-3 text-xs z-10">
        <div className="text-gray-400">
          <div className="mb-1">Nodes: <span className="text-white">{data.nodes.length}</span></div>
          <div>Edges: <span className="text-white">{data.links.length}</span></div>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded"
        style={{ backgroundColor: '#000000' }}
      />

      {/* Node Tooltip */}
      {hoveredNode && (
        <div
          className="absolute bg-black bg-opacity-95 border border-gray-500 border-opacity-50 rounded p-3 text-xs pointer-events-none z-20"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '300px'
          }}
        >
          <div className="font-light text-white mb-2">{hoveredNode.label}</div>
          <div className="space-y-1 text-gray-400">
            <div>Chain: <span className="text-gray-300">{hoveredNode.chain}</span></div>
            <div>Address: <span className="text-gray-300 font-mono text-xs">{hoveredNode.contract_address.substring(0, 20)}...</span></div>
            <div>Severity: <span className="text-gray-300">{hoveredNode.severity}</span></div>
            <div>Loss: <span className="text-gray-300">${hoveredNode.amount_usd.toLocaleString()}</span></div>
            <div>Date: <span className="text-gray-300">{new Date(hoveredNode.date).toLocaleDateString()}</span></div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex gap-2 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Scroll to zoom</span>
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
          <span>Drag nodes</span>
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <span>Click for details</span>
        </div>
      </div>
    </div>
  );
};

export default ForkGraphVisualization;
