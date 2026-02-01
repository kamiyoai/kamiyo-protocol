"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TIERS } from "@/lib/prover";

interface Props {
  proof: any;
  commitment: string;
}

export function TierDisplay({ proof, commitment }: Props) {
  useConnection(); // Keep connection available for future on-chain verification
  const { publicKey } = useWallet();
  const [verifying, setVerifying] = useState(false);
  const [txSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tier = Object.entries(TIERS).find(
    ([_, t]) => t.threshold === proof.threshold
  )?.[0] || "unknown";

  const handleVerifyOnChain = async () => {
    if (!publicKey) return;

    setVerifying(true);
    setError(null);

    try {
      // For now, show that the proof is ready for on-chain verification
      // Full on-chain verification requires the program upgrade
      await new Promise((r) => setTimeout(r, 1000));
      setError("On-chain verification coming soon. Program upgrade pending.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400 mb-1">Proven Tier</div>
          <div
            className={`text-2xl font-bold ${
              tier === "platinum"
                ? "text-purple-400"
                : tier === "gold"
                ? "text-yellow-400"
                : tier === "silver"
                ? "text-gray-300"
                : "text-amber-400"
            }`}
          >
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400 mb-1">Threshold</div>
          <div className="text-2xl font-bold">&gt;= {proof.threshold}</div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded">
        <div className="text-sm text-gray-400 mb-2">Commitment</div>
        <code className="text-xs text-green-400 break-all">{commitment}</code>
      </div>

      <div className="bg-gray-800 p-4 rounded">
        <div className="text-sm text-gray-400 mb-2">Proof (256 bytes)</div>
        <code className="text-xs text-purple-400 break-all">
          {proof.proofBytes
            ? Buffer.from(proof.proofBytes).toString("hex").slice(0, 128) + "..."
            : "Generated"}
        </code>
      </div>

      <button
        onClick={handleVerifyOnChain}
        disabled={verifying}
        className={`w-full py-3 px-4 rounded-lg font-medium transition ${
          verifying
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-500 text-white"
        }`}
      >
        {verifying ? "Verifying..." : "Verify On-Chain (Devnet)"}
      </button>

      {txSignature && (
        <div className="bg-green-900/30 text-green-400 p-3 rounded text-sm">
          <p className="mb-2">Verified on-chain!</p>
          <a
            href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View Transaction
          </a>
        </div>
      )}

      {error && (
        <div className="bg-yellow-900/30 text-yellow-400 p-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>The verifier learns: &quot;User qualifies for {tier} tier&quot;</p>
        <p>The verifier does NOT learn: actual score, wallet history, identity</p>
      </div>
    </div>
  );
}
