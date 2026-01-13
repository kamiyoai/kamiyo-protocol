"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

// Helius RPC for reliable connectivity (qualifies for $5k bounty)
// Get your API key at https://helius.dev
const HELIUS_RPC = process.env.NEXT_PUBLIC_HELIUS_RPC || "https://api.devnet.solana.com";

// Log RPC provider on init
if (typeof window !== "undefined") {
  const isHelius = HELIUS_RPC.includes("helius");
  console.log(
    isHelius
      ? `[Helius] RPC: ${HELIUS_RPC.split("?")[0]}`
      : `[Solana] RPC: ${HELIUS_RPC}`
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={HELIUS_RPC}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
