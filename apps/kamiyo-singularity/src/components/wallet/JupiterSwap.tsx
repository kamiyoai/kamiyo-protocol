'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { logger } from '@/lib/logger';

// Jupiter Terminal global type
declare global {
  interface Window {
    Jupiter?: {
      init: (config: JupiterConfig) => Promise<void>;
      close: () => void;
      syncProps: (props: { passthroughWalletContextState: unknown }) => void;
    };
  }
}

interface JupiterConfig {
  displayMode: 'integrated' | 'widget' | 'modal';
  integratedTargetId?: string;
  endpoint?: string;
  enableWalletPassthrough?: boolean;
  strictTokenList?: boolean;
  defaultExplorer?: 'Solana Explorer' | 'Solscan' | 'Solana FM';
  formProps?: {
    fixedOutputMint?: boolean;
    initialOutputMint?: string;
    swapMode?: 'ExactIn' | 'ExactOut';
  };
  containerClassName?: string;
  onSuccess?: (data: { txid: string }) => void;
  onSwapError?: (error: { error: unknown }) => void;
}

// USDC mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface JupiterSwapProps {
  onSuccess?: (txid: string) => void;
  onError?: (error: unknown) => void;
}

export function JupiterSwap({ onSuccess, onError }: JupiterSwapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wallet = useWallet();
  const initialized = useRef(false);

  // Load Jupiter Terminal script
  useEffect(() => {
    const scriptId = 'jupiter-terminal-script';

    // Check if script already exists
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://terminal.jup.ag/main-v3.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Initialize Jupiter Terminal
  useEffect(() => {
    if (!containerRef.current || initialized.current) return;

    const initJupiter = async () => {
      // Wait for Jupiter to load
      let attempts = 0;
      while (!window.Jupiter && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.Jupiter) {
        logger.error('Failed to load Jupiter Terminal');
        return;
      }

      await window.Jupiter.init({
        displayMode: 'integrated',
        integratedTargetId: 'jupiter-swap-container',
        enableWalletPassthrough: true,
        defaultExplorer: 'Solscan',
        formProps: {
          fixedOutputMint: true,
          initialOutputMint: USDC_MINT,
          swapMode: 'ExactOut',
        },
        containerClassName: 'w-full',
        onSuccess: (data) => {
          onSuccess?.(data.txid);
        },
        onSwapError: (data) => {
          onError?.(data.error);
        },
      });

      initialized.current = true;
    };

    initJupiter();

    return () => {
      if (window.Jupiter && initialized.current) {
        window.Jupiter.close();
        initialized.current = false;
      }
    };
  }, [onSuccess, onError]);

  // Sync wallet state with Jupiter
  useEffect(() => {
    if (window.Jupiter && initialized.current) {
      window.Jupiter.syncProps({
        passthroughWalletContextState: wallet,
      });
    }
  }, [wallet]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg bg-bg-secondary">
        <p className="text-sm text-text-secondary mb-2">
          Swap any token to USDC using Jupiter
        </p>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>Best rates across all Solana DEXs</li>
          <li>USDC will be deposited to your account</li>
          <li>Powered by Jupiter Aggregator</li>
        </ul>
      </div>

      <div
        ref={containerRef}
        id="jupiter-swap-container"
        className="min-h-[400px] rounded-lg overflow-hidden"
      />
    </div>
  );
}
