"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import type { TrustNode, TrustEdge, Tier } from "@/hooks/useTrustGraph";

const TIER_COLORS: Record<Tier, string> = {
  platinum: "#E5E4E2",
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
  unverified: "#808080",
};

interface Props {
  nodes: TrustNode[];
  edges: TrustEdge[];
  onNodeClick?: (node: TrustNode) => void;
  width?: number;
  height?: number;
}

interface SimNode extends TrustNode, d3.SimulationNodeDatum {}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
}

export function TrustGraphViz({
  nodes,
  edges,
  onNodeClick,
  width = 800,
  height = 600,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<TrustNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<TrustNode | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
      }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    const container = svg.append("g");

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Edge weight to stroke width (1-5px for 0-100 trust)
    const strokeScale = d3.scaleLinear().domain([0, 100]).range([1, 5]);

    // Links
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "#444")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => strokeScale(d.weight));

    // Nodes
    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer");

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => 10 + d.reputation / 10)
      .attr("fill", (d) => TIER_COLORS[d.tier])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Node labels
    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 0)
      .attr("y", (d) => 20 + d.reputation / 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#ccc")
      .attr("font-size", "10px");

    // Hover and click events
    node
      .on("mouseenter", (event, d) => {
        setHoveredNode(d);
        d3.select(event.currentTarget).select("circle").attr("stroke-width", 4);
      })
      .on("mouseleave", (event) => {
        setHoveredNode(null);
        d3.select(event.currentTarget).select("circle").attr("stroke-width", 2);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        onNodeClick?.(d);
      });

    // Click on background to deselect
    svg.on("click", () => {
      setSelectedNode(null);
    });

    // Update positions on tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height, onNodeClick]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="bg-gray-900 rounded-lg"
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute top-4 left-4 bg-gray-800 border border-gray-700 rounded-lg p-3 pointer-events-none">
          <div className="font-medium text-white">{hoveredNode.label}</div>
          <div className="text-sm text-gray-400 mt-1">
            <div>ID: {hoveredNode.id}</div>
            <div>
              Tier:{" "}
              <span style={{ color: TIER_COLORS[hoveredNode.tier] }}>
                {hoveredNode.tier.charAt(0).toUpperCase() + hoveredNode.tier.slice(1)}
              </span>
            </div>
            <div>Reputation: {hoveredNode.reputation}</div>
            <div>TX Count: {hoveredNode.txCount}</div>
          </div>
        </div>
      )}

      {/* Selected node panel */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-gray-800 border border-cyan-800 rounded-lg p-4 max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: TIER_COLORS[selectedNode.tier] }}
            />
            <span className="font-medium text-white">{selectedNode.label}</span>
          </div>
          <div className="text-sm text-gray-400 space-y-1">
            <div>Agent ID: {selectedNode.id}</div>
            <div>
              Tier: {selectedNode.tier.charAt(0).toUpperCase() + selectedNode.tier.slice(1)}
            </div>
            <div>Reputation Score: {selectedNode.reputation}</div>
            <div>Transaction Count: {selectedNode.txCount}</div>
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            className="mt-3 text-xs text-cyan-400 hover:text-cyan-300"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-gray-800/90 border border-gray-700 rounded-lg p-3">
        <div className="text-xs text-gray-400 mb-2">Tier Legend</div>
        <div className="space-y-1">
          {(Object.entries(TIER_COLORS) as [Tier, string][]).map(([tier, color]) => (
            <div key={tier} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-300 capitalize">{tier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
