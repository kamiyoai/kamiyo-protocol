import { create } from 'zustand';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '../lib/constants';

interface WalletState {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  balance: number;

  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  setPublicKey: (publicKey: PublicKey | null) => void;
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

export const useWalletStore = create<WalletState>((set, get) => ({
  publicKey: null,
  connected: false,
  connecting: false,
  balance: 0,

  connect: async () => {
    set({ connecting: true });
    try {
      // For now, this is a placeholder for Solana Mobile Wallet Adapter
      // In a real implementation, we would use:
      // import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
      //
      // await transact(async (wallet) => {
      //   const authResult = await wallet.authorize({
      //     cluster: 'devnet',
      //     identity: {
      //       name: 'KEIRO',
      //       uri: 'https://keiro.kamiyo.ai',
      //       icon: 'favicon.ico',
      //     },
      //   });
      //   const publicKey = new PublicKey(authResult.accounts[0].address);
      //   set({ publicKey, connected: true });
      //   get().refreshBalance();
      // });

      // Placeholder: simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For development, we can use a mock public key
      // In production, this would come from the wallet adapter
      console.log('Wallet connection not yet implemented');
      set({ connecting: false });
    } catch (error) {
      console.error('Wallet connection failed:', error);
      set({ connecting: false });
    }
  },

  disconnect: () => {
    set({
      publicKey: null,
      connected: false,
      balance: 0,
    });
  },

  refreshBalance: async () => {
    const { publicKey } = get();
    if (!publicKey) return;

    try {
      const balance = await connection.getBalance(publicKey);
      set({ balance: balance / LAMPORTS_PER_SOL });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  },

  setPublicKey: (publicKey: PublicKey | null) => {
    if (publicKey) {
      set({ publicKey, connected: true });
      get().refreshBalance();
    } else {
      set({ publicKey: null, connected: false, balance: 0 });
    }
  },
}));
