"use client";

import { useState } from "react";
import { generateProof, getTierForScore, TIERS } from "@/lib/prover";

interface Props {
  onProofGenerated: (proof: any, commitment: string) => void;
}

export function ProofGenerator({ onProofGenerated }: Props) {
  const [score, setScore] = useState<number>(75);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTier = getTierForScore(score);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await generateProof(score, TIERS[currentTier].threshold);
      onProofGenerated(result.proof, result.commitment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate proof");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Your Reputation Score (private)
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="100"
            value={score}
            onChange={(e) => setScore(parseInt(e.target.value))}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-2xl font-mono w-12 text-right">{score}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-gray-400">Qualifying Tier:</span>
        <span
          className={`font-medium ${
            currentTier === "platinum"
              ? "text-purple-400"
              : currentTier === "gold"
              ? "text-yellow-400"
              : currentTier === "silver"
              ? "text-gray-300"
              : currentTier === "bronze"
              ? "text-amber-400"
              : "text-gray-500"
          }`}
        >
          {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
        </span>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || currentTier === "none"}
        className={`w-full py-3 px-4 rounded-lg font-medium transition ${
          loading || currentTier === "none"
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-purple-600 hover:bg-purple-500 text-white"
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
        ) : currentTier === "none" ? (
          "Score too low for any tier"
        ) : (
          `Generate ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Tier Proof`
        )}
      </button>

      {error && (
        <div className="bg-red-900/30 text-red-400 p-3 rounded text-sm">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Proof generation takes ~30 seconds. The score remains private.
      </p>
    </div>
  );
}
