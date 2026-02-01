"use client";

import { useState } from "react";
import { generateReputationProof, getTierForReputation } from "@/lib/reputation-prover";

interface Props {
  onProofGenerated: (proof: any, publicInputs: any) => void;
}

export function ReputationProofGenerator({ onProofGenerated }: Props) {
  const [reputationScore, setReputationScore] = useState<number>(92);
  const [transactionCount, setTransactionCount] = useState<number>(127);
  const [minReputation, setMinReputation] = useState<number>(85);
  const [minTransactions, setMinTransactions] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofTime, setProofTime] = useState<number | null>(null);

  const qualifyingTier = getTierForReputation(reputationScore, transactionCount);
  const meetsThreshold = reputationScore >= minReputation && transactionCount >= minTransactions;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setProofTime(null);

    const startTime = Date.now();

    try {
      const result = await generateReputationProof({
        reputationScore,
        transactionCount,
        minReputation,
        minTransactions,
      });

      setProofTime(Date.now() - startTime);
      onProofGenerated(result.proof, result.publicInputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate proof");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Agent's Private Data */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Your Agent Data (Private)
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Reputation Score
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                value={reputationScore}
                onChange={(e) => setReputationScore(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-2xl font-mono w-12 text-right text-cyan-400">
                {reputationScore}%
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Transaction Count
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="500"
                value={transactionCount}
                onChange={(e) => setTransactionCount(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-2xl font-mono w-16 text-right text-cyan-400">
                {transactionCount}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <span className="text-gray-400 text-sm">Qualifying Tier:</span>
          <span
            className={`font-medium ${
              qualifyingTier === "elite"
                ? "text-yellow-400"
                : qualifyingTier === "premium"
                ? "text-purple-400"
                : qualifyingTier === "basic"
                ? "text-blue-400"
                : "text-gray-400"
            }`}
          >
            {qualifyingTier.charAt(0).toUpperCase() + qualifyingTier.slice(1)}
          </span>
        </div>
      </div>

      {/* Threshold Requirements */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Proof Requirements (Public)
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Min Reputation
            </label>
            <select
              value={minReputation}
              onChange={(e) => setMinReputation(parseInt(e.target.value))}
              className="w-full bg-gray-700 rounded px-3 py-2 text-white border border-gray-600"
            >
              <option value={70}>70% (Basic)</option>
              <option value={85}>85% (Premium)</option>
              <option value={95}>95% (Elite)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Min Transactions
            </label>
            <select
              value={minTransactions}
              onChange={(e) => setMinTransactions(parseInt(e.target.value))}
              className="w-full bg-gray-700 rounded px-3 py-2 text-white border border-gray-600"
            >
              <option value={10}>10+</option>
              <option value={50}>50+</option>
              <option value={100}>100+</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          {meetsThreshold ? (
            <span className="text-green-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Your agent meets the requirements
            </span>
          ) : (
            <span className="text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              Agent does not meet requirements
            </span>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !meetsThreshold}
        className={`w-full py-3 px-4 rounded-lg font-medium transition ${
          loading || !meetsThreshold
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-cyan-600 hover:bg-cyan-500 text-white"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Generating ZK Proof...
          </span>
        ) : !meetsThreshold ? (
          "Agent does not meet threshold"
        ) : (
          "Generate Reputation Proof"
        )}
      </button>

      {error && (
        <div className="bg-red-900/30 text-red-400 p-3 rounded text-sm">
          {error}
        </div>
      )}

      {proofTime && (
        <p className="text-xs text-gray-500 text-center">
          Proof generated in {proofTime}ms
        </p>
      )}

      <p className="text-xs text-gray-500">
        The proof demonstrates you meet the threshold without revealing your
        actual reputation score, transaction count, or agent identity.
      </p>
    </div>
  );
}
