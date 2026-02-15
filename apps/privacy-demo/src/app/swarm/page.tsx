"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ReputationProofGenerator } from "@/components/ReputationProofGenerator";
import { PaymentTierUnlock } from "@/components/PaymentTierUnlock";

export default function SwarmPage() {
  const { connected } = useWallet();
  const [proof, setProof] = useState<any>(null);
  const [publicInputs, setPublicInputs] = useState<any>(null);

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto bg-black text-white">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-2 text-cyan-400">SWARMTEAMS</h1>
        <p className="text-gray-400">
          Private Reputation Proofs for AI Agents
        </p>
        <p className="text-gray-500 text-sm mt-2">
          Prove you&apos;re trustworthy without revealing who you are
        </p>
      </header>

      <section className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <WalletMultiButton />
          {connected && (
            <span className="text-green-400 text-sm">Connected</span>
          )}
        </div>
      </section>

      {connected ? (
        <div className="space-y-8">
          {/* Step 1: Generate Proof */}
          <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">
              1. Generate Reputation Proof
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Enter your reputation data. The ZK proof will verify you meet the
              threshold without revealing your actual score or transaction count.
            </p>
            <ReputationProofGenerator
              onProofGenerated={(p, inputs) => {
                setProof(p);
                setPublicInputs(inputs);
              }}
            />
          </section>

          {/* Step 2: Unlock Payment Rails */}
          {proof && publicInputs && (
            <section className="bg-gray-900 rounded-lg p-6 border border-cyan-800">
              <h2 className="text-xl font-semibold mb-4 text-green-400">
                2. Payment Rail Unlocked
              </h2>
              <PaymentTierUnlock
                proof={proof}
                publicInputs={publicInputs}
              />
            </section>
          )}

          {/* Privacy Guarantees */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Privacy Guarantees</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-cyan-400 font-medium mb-2">
                  What stays private:
                </h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>- Agent identity (wallet, owner)</li>
                  <li>- Actual reputation score</li>
                  <li>- Transaction count</li>
                  <li>- Transaction history</li>
                </ul>
              </div>
              <div>
                <h3 className="text-green-400 font-medium mb-2">
                  What verifier learns:
                </h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>- Agent is registered</li>
                  <li>- Reputation &gt;= threshold</li>
                  <li>- TX count &gt;= minimum</li>
                  <li>- Proof is valid this epoch</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Payment Tiers */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Payment Tiers</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-gray-700/50 p-3 rounded border border-gray-600">
                <div className="font-medium text-gray-300">Standard</div>
                <div className="text-gray-500">Any registered</div>
                <div className="text-cyan-400">$100/day</div>
              </div>
              <div className="bg-blue-900/30 p-3 rounded border border-blue-800">
                <div className="font-medium text-blue-400">Basic</div>
                <div className="text-gray-500">&gt;= 70% rep</div>
                <div className="text-cyan-400">$500/day</div>
              </div>
              <div className="bg-purple-900/30 p-3 rounded border border-purple-800">
                <div className="font-medium text-purple-400">Premium</div>
                <div className="text-gray-500">&gt;= 85% rep</div>
                <div className="text-cyan-400">$2,000/day</div>
              </div>
              <div className="bg-yellow-900/30 p-3 rounded border border-yellow-700">
                <div className="font-medium text-yellow-400">Elite</div>
                <div className="text-gray-500">&gt;= 95% rep</div>
                <div className="text-cyan-400">$10,000/day</div>
              </div>
            </div>
          </section>

          {/* Integration Partners */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Private Payment Rails</h2>
            <div className="flex gap-6 items-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center text-2xl mb-2">
                  S
                </div>
                <span className="text-sm text-gray-400">ShadowWire</span>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-green-500 rounded-lg flex items-center justify-center text-2xl mb-2">
                  T
                </div>
                <span className="text-sm text-gray-400">Standard</span>
              </div>
              <div className="flex-1 text-gray-500 text-sm">
                Reputation proofs unlock ShadowWire private transfers with tier-based daily limits.
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-lg p-8 text-center border border-gray-800">
          <p className="text-gray-400 mb-4">
            Connect your wallet to generate a reputation proof
          </p>
          <p className="text-gray-600 text-sm">
            Agents prove reputation thresholds without revealing identity or
            transaction history
          </p>
        </div>
      )}

      <footer className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
        <p>Solana Privacy Hack 2026</p>
        <p className="mt-1">
          <a
            href="https://github.com/kamiyo-ai/kamiyo-protocol"
            className="text-cyan-400 hover:underline"
          >
            View Source
          </a>
          {" | "}
          <a
            href="https://kamiyo.ai"
            className="text-cyan-400 hover:underline"
          >
            KAMIYO Protocol
          </a>
        </p>
      </footer>
    </main>
  );
}
