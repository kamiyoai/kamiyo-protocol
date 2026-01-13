"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ProofGenerator } from "@/components/ProofGenerator";
import { TierDisplay } from "@/components/TierDisplay";

export default function Home() {
  const { connected } = useWallet();
  const [proof, setProof] = useState<any>(null);
  const [commitment, setCommitment] = useState<string>("");

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-2">DARK FOREST</h1>
        <p className="text-gray-400">
          Privacy-preserving reputation verification on Solana
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
          <section className="bg-gray-900 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">1. Generate Proof</h2>
            <p className="text-gray-400 text-sm mb-4">
              Enter your reputation score (0-100). The proof will verify you
              meet a tier threshold without revealing your actual score.
            </p>
            <ProofGenerator
              onProofGenerated={(p, c) => {
                setProof(p);
                setCommitment(c);
              }}
            />
          </section>

          {proof && (
            <section className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">2. Proof Generated</h2>
              <TierDisplay proof={proof} commitment={commitment} />
            </section>
          )}

          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">How It Works</h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-400 text-sm">
              <li>You enter your reputation score (kept private)</li>
              <li>
                A Poseidon commitment is created: <code>H(score, secret)</code>
              </li>
              <li>
                A Groth16 proof is generated proving{" "}
                <code>score &gt;= threshold</code>
              </li>
              <li>The proof can be verified on-chain without revealing the score</li>
              <li>Verifiers only learn: &quot;This user qualifies for tier X&quot;</li>
            </ol>
          </section>

          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-3">Tier System</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-amber-900/30 p-3 rounded">
                <div className="font-medium text-amber-400">Bronze</div>
                <div className="text-gray-400">Score &gt;= 25</div>
              </div>
              <div className="bg-gray-500/30 p-3 rounded">
                <div className="font-medium text-gray-300">Silver</div>
                <div className="text-gray-400">Score &gt;= 50</div>
              </div>
              <div className="bg-yellow-600/30 p-3 rounded">
                <div className="font-medium text-yellow-400">Gold</div>
                <div className="text-gray-400">Score &gt;= 75</div>
              </div>
              <div className="bg-purple-900/30 p-3 rounded">
                <div className="font-medium text-purple-400">Platinum</div>
                <div className="text-gray-400">Score &gt;= 90</div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            Connect your wallet to generate a reputation proof
          </p>
        </div>
      )}

      <footer className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
        <p>Built for Solana Privacy Hack 2026</p>
        <p className="mt-1">
          <a
            href="https://github.com/kamiyo-ai/kamiyo-protocol"
            className="text-purple-400 hover:underline"
          >
            View Source
          </a>
        </p>
      </footer>
    </main>
  );
}
