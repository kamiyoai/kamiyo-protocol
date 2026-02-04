import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Platform } from 'react-native';
import bs58 from 'bs58';
import { SOLANA_RPC_URL, SOLANA_NETWORK, APP_NAME } from '../lib/constants';

interface WalletState {
  publicKey: PublicKey | null;
  publicKeyBase58: string | null;
  connected: boolean;
  connecting: boolean;
  balance: number;
  authToken: string | null;

  connect: () => Promise<boolean>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction | null>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array | null>;
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      publicKey: null,
      publicKeyBase58: null,
      connected: false,
      connecting: false,
      balance: 0,
      authToken: null,

      connect: async () => {
        if (Platform.OS === 'web') {
          console.log('Web wallet connection not implemented');
          return false;
        }

        set({ connecting: true });

        try {
          const result = await transact(async (wallet: Web3MobileWallet) => {
            // Authorize with the wallet
            const authResult = await wallet.authorize({
              cluster: SOLANA_NETWORK as 'devnet' | 'mainnet-beta' | 'testnet',
              identity: {
                name: APP_NAME,
                uri: 'https://keiro.kamiyo.ai',
                icon: 'favicon.ico',
              },
            });

            // Get the first account
            const account = authResult.accounts[0];
            if (!account) {
              throw new Error('No accounts returned from wallet');
            }

            return {
              publicKey: account.address,
              authToken: authResult.auth_token,
            };
          });

          const publicKey = new PublicKey(result.publicKey);

          set({
            publicKey,
            publicKeyBase58: result.publicKey,
            connected: true,
            connecting: false,
            authToken: result.authToken,
          });

          get().refreshBalance();

          return true;
        } catch (error) {
          console.error('Wallet connection failed:', error);
          set({
            connecting: false,
            connected: false,
            publicKey: null,
            publicKeyBase58: null,
          });
          return false;
        }
      },

      disconnect: () => {
        set({
          publicKey: null,
          publicKeyBase58: null,
          connected: false,
          balance: 0,
          authToken: null,
        });
      },

      refreshBalance: async () => {
        const { publicKeyBase58 } = get();
        if (!publicKeyBase58) return;

        try {
          const publicKey = new PublicKey(publicKeyBase58);
          const balance = await connection.getBalance(publicKey);
          set({ balance: balance / LAMPORTS_PER_SOL });
        } catch (error) {
          console.error('Failed to fetch balance:', error);
        }
      },

      signTransaction: async (transaction: Transaction) => {
        const { publicKeyBase58, authToken } = get();
        if (!publicKeyBase58) return null;

        if (Platform.OS === 'web') {
          console.log('Web transaction signing not implemented');
          return null;
        }

        try {
          const signedTransaction = await transact(async (wallet: Web3MobileWallet) => {
            if (authToken) {
              try {
                await wallet.reauthorize({
                  auth_token: authToken,
                  identity: {
                    name: APP_NAME,
                    uri: 'https://keiro.kamiyo.ai',
                    icon: 'favicon.ico',
                  },
                });
              } catch {
                await wallet.authorize({
                  cluster: SOLANA_NETWORK as 'devnet' | 'mainnet-beta' | 'testnet',
                  identity: {
                    name: APP_NAME,
                    uri: 'https://keiro.kamiyo.ai',
                    icon: 'favicon.ico',
                  },
                });
              }
            }

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new PublicKey(publicKeyBase58);

            const signedTransactions = await wallet.signTransactions({
              transactions: [transaction],
            });

            return signedTransactions[0];
          });

          return signedTransaction;
        } catch (error) {
          console.error('Transaction signing failed:', error);
          return null;
        }
      },

      signMessage: async (message: Uint8Array) => {
        const { authToken } = get();

        if (Platform.OS === 'web') {
          console.log('Web message signing not implemented');
          return null;
        }

        try {
          const signature = await transact(async (wallet: Web3MobileWallet) => {
            if (authToken) {
              try {
                await wallet.reauthorize({
                  auth_token: authToken,
                  identity: {
                    name: APP_NAME,
                    uri: 'https://keiro.kamiyo.ai',
                    icon: 'favicon.ico',
                  },
                });
              } catch {
                await wallet.authorize({
                  cluster: SOLANA_NETWORK as 'devnet' | 'mainnet-beta' | 'testnet',
                  identity: {
                    name: APP_NAME,
                    uri: 'https://keiro.kamiyo.ai',
                    icon: 'favicon.ico',
                  },
                });
              }
            }

            const signedMessages = await wallet.signMessages({
              addresses: [get().publicKeyBase58!],
              payloads: [message],
            });

            return signedMessages[0];
          });

          return signature;
        } catch (error) {
          console.error('Message signing failed:', error);
          return null;
        }
      },
    }),
    {
      name: 'keiro-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        publicKeyBase58: state.publicKeyBase58,
        connected: state.connected,
        authToken: state.authToken,
      }),
      onRehydrateStorage: () => state => {
        if (state?.publicKeyBase58) {
          try {
            state.publicKey = new PublicKey(state.publicKeyBase58);
            state.refreshBalance();
          } catch {
            state.publicKey = null;
            state.connected = false;
          }
        }
      },
    }
  )
);

// Helper to get short address for display
export function getShortAddress(publicKey: PublicKey | string | null): string {
  if (!publicKey) return '';
  const address = typeof publicKey === 'string' ? publicKey : publicKey.toBase58();
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
