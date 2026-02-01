"use client";

import { useState, useMemo } from "react";
import { TrustGraphViz } from "@/components/TrustGraphViz";
import { useTrustGraph, Tier, TrustNode } from "@/hooks/useTrustGraph";

const TIERS: Tier[] = ["platinum", "gold", "silver", "bronze", "unverified"];

export default function TrustGraphPage() {
  const { nodes, edges, stats, loading, error, refetch } = useTrustGraph();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier | "all">("all");
  const [selectedNode, setSelectedNode] = useState<TrustNode | null>(null);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const matchesSearch =
        searchQuery === "" ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.label.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTier = selectedTier === "all" || node.tier === selectedTier;

      return matchesSearch && matchesTier;
    });
  }, [nodes, searchQuery, selectedTier]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
  }, [edges, filteredNodes]);

  const handleNodeClick = (node: TrustNode) => {
    setSelectedNode(node);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-80 bg-gray-900 border-r border-gray-800 p-6 overflow-y-auto">
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-cyan-400">Trust Graph</h1>
            <p className="text-gray-400 text-sm mt-1">
              Agent reputation network visualization
            </p>
          </header>

          {/* Search */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Search Agent
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Agent ID or name..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-600"
            />
          </div>

          {/* Tier filter */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Filter by Tier
            </label>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value as Tier | "all")}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-600"
            >
              <option value="all">All Tiers</option>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Stats */}
          <div className="mb-6">
            <h2 className="text-sm text-gray-400 mb-3">Network Stats</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Nodes</span>
                <span className="text-white font-medium">
                  {filteredNodes.length}
                  {filteredNodes.length !== stats.totalNodes && (
                    <span className="text-gray-500 text-xs ml-1">
                      / {stats.totalNodes}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Edges</span>
                <span className="text-white font-medium">
                  {filteredEdges.length}
                  {filteredEdges.length !== stats.totalEdges && (
                    <span className="text-gray-500 text-xs ml-1">
                      / {stats.totalEdges}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Avg Trust</span>
                <span className="text-white font-medium">{stats.avgTrust}%</span>
              </div>
            </div>
          </div>

          {/* Tier breakdown */}
          <div className="mb-6">
            <h2 className="text-sm text-gray-400 mb-3">Tier Distribution</h2>
            <div className="space-y-2">
              {TIERS.map((tier) => (
                <div key={tier} className="flex justify-between items-center">
                  <span className="text-gray-500 capitalize">{tier}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${Math.max(4, (stats.tierCounts[tier] / stats.totalNodes) * 100)}px`,
                        backgroundColor:
                          tier === "platinum"
                            ? "#E5E4E2"
                            : tier === "gold"
                            ? "#FFD700"
                            : tier === "silver"
                            ? "#C0C0C0"
                            : tier === "bronze"
                            ? "#CD7F32"
                            : "#808080",
                      }}
                    />
                    <span className="text-white font-medium text-sm">
                      {stats.tierCounts[tier]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected node details */}
          {selectedNode && (
            <div className="mb-6 bg-gray-800 rounded-lg p-4 border border-cyan-800">
              <h2 className="text-sm text-cyan-400 mb-3">Selected Agent</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">ID:</span>
                  <span className="text-white ml-2 font-mono">
                    {selectedNode.id}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Name:</span>
                  <span className="text-white ml-2">{selectedNode.label}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tier:</span>
                  <span className="text-white ml-2 capitalize">
                    {selectedNode.tier}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Reputation:</span>
                  <span className="text-white ml-2">{selectedNode.reputation}</span>
                </div>
                <div>
                  <span className="text-gray-500">TX Count:</span>
                  <span className="text-white ml-2">{selectedNode.txCount}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="mt-3 text-xs text-gray-400 hover:text-white"
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={refetch}
            disabled={loading}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg py-2 text-sm text-gray-300 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh Graph"}
          </button>

          {/* Error display */}
          {error && (
            <div className="mt-4 bg-red-900/30 text-red-400 p-3 rounded text-sm">
              {error}
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 p-6">
          {loading && nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Loading trust graph...</div>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-gray-400 mb-2">No agents found</div>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTier("all");
                  }}
                  className="text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <TrustGraphViz
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodeClick={handleNodeClick}
              width={typeof window !== "undefined" ? window.innerWidth - 320 - 48 : 800}
              height={typeof window !== "undefined" ? window.innerHeight - 48 : 600}
            />
          )}
        </div>
      </div>
    </main>
  );
}
