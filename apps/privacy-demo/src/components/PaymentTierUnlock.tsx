"use client";

import { useState } from "react";

interface Props {
  proof: any;
  publicInputs: {
    minReputation: number;
    minTransactions: number;
    nullifier: string;
  };
}

export function PaymentTierUnlock({ proof, publicInputs }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const tier =
    publicInputs.minReputation >= 95
      ? "elite"
      : publicInputs.minReputation >= 85
      ? "premium"
      : publicInputs.minReputation >= 70
      ? "basic"
      : "standard";

  const tierConfig = {
    elite: {
      name: "Elite",
      color: "text-yellow-400",
      bg: "bg-yellow-900/30",
      border: "border-yellow-700",
      limit: "$10,000/day",
      rails: ["Standard", "ShadowWire"],
    },
    premium: {
      name: "Premium",
      color: "text-purple-400",
      bg: "bg-purple-900/30",
      border: "border-purple-800",
      limit: "$2,000/day",
      rails: ["Standard", "ShadowWire"],
    },
    basic: {
      name: "Basic",
      color: "text-blue-400",
      bg: "bg-blue-900/30",
      border: "border-blue-800",
      limit: "$500/day",
      rails: ["Standard", "ShadowWire Basic"],
    },
    standard: {
      name: "Standard",
      color: "text-gray-400",
      bg: "bg-gray-700/50",
      border: "border-gray-600",
      limit: "$100/day",
      rails: ["Standard Transfer"],
    },
  };

  const config = tierConfig[tier];

  return (
    <div className="space-y-6">
      {/* Unlocked Tier */}
      <div
        className={`${config.bg} ${config.border} border rounded-lg p-6 text-center`}
      >
        <div className="text-sm text-gray-400 mb-2">Tier Unlocked</div>
        <div className={`text-3xl font-bold ${config.color}`}>{config.name}</div>
        <div className="text-cyan-400 mt-2">{config.limit}</div>
      </div>

      {/* Available Rails */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-3">
          Available Payment Rails
        </h4>
        <div className="flex flex-wrap gap-2">
          {config.rails.map((rail) => (
            <span
              key={rail}
              className="bg-gray-800 border border-gray-700 px-3 py-1 rounded-full text-sm text-gray-300"
            >
              {rail}
            </span>
          ))}
        </div>
      </div>

      {/* Proof Summary */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-400 mb-3">
          Proof Summary
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Min Reputation Required:</dt>
            <dd className="text-white">{publicInputs.minReputation}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Min Transactions Required:</dt>
            <dd className="text-white">{publicInputs.minTransactions}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Epoch Nullifier:</dt>
            <dd className="text-cyan-400 font-mono text-xs truncate max-w-[200px]">
              {publicInputs.nullifier.slice(0, 16)}...
            </dd>
          </div>
        </dl>
      </div>

      {/* What Verifier Sees */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
          <div className="text-green-400 font-medium mb-2">Verifier Confirms</div>
          <ul className="text-gray-400 space-y-1 text-xs">
            <li>Agent is registered</li>
            <li>Reputation &gt;= {publicInputs.minReputation}%</li>
            <li>TX count &gt;= {publicInputs.minTransactions}</li>
            <li>Valid nullifier</li>
          </ul>
        </div>
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <div className="text-red-400 font-medium mb-2">Verifier Cannot See</div>
          <ul className="text-gray-400 space-y-1 text-xs">
            <li>Which agent</li>
            <li>Actual reputation</li>
            <li>Actual TX count</li>
            <li>Transaction history</li>
          </ul>
        </div>
      </div>

      {/* Raw Proof Toggle */}
      <div>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-2"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showRaw ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          {showRaw ? "Hide" : "Show"} Raw Proof Data
        </button>

        {showRaw && (
          <pre className="mt-3 bg-gray-900 p-4 rounded text-xs text-gray-400 overflow-x-auto">
            {JSON.stringify(
              {
                proof: {
                  pi_a: proof.pi_a ? [proof.pi_a[0].slice(0, 20) + "...", proof.pi_a[1].slice(0, 20) + "..."] : "simulated",
                  pi_b: "[[...], [...]]",
                  pi_c: proof.pi_c ? [proof.pi_c[0].slice(0, 20) + "...", proof.pi_c[1].slice(0, 20) + "..."] : "simulated",
                },
                publicSignals: [
                  "agents_root",
                  publicInputs.minReputation.toString(),
                  publicInputs.minTransactions.toString(),
                  publicInputs.nullifier.slice(0, 32) + "...",
                ],
              },
              null,
              2
            )}
          </pre>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white py-3 px-4 rounded-lg font-medium transition">
          Use ShadowWire
        </button>
        <button className="flex-1 bg-gradient-to-r from-cyan-600 to-green-600 hover:from-cyan-500 hover:to-green-500 text-white py-3 px-4 rounded-lg font-medium transition">
          Use Standard Transfer
        </button>
      </div>
    </div>
  );
}
