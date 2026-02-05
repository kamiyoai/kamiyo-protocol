import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// --------------------------------------------------------------------------
// Types for lazy-loaded Solana modules.  We define narrow interfaces instead
// of importing the libraries directly so the web bundle never pulls them in.
// --------------------------------------------------------------------------

/** Minimal subset of @solana/web3.js PublicKey we rely on. */
interface SolanaPublicKey {
  toBase58(): string;
  toBuffer(): Buffer;
  toString(): string;
}

/** Constructor type returned by dynamic import of @solana/web3.js */
type PublicKeyConstructor = new (value: string | Uint8Array) => SolanaPublicKey;

/** MWA wallet handle passed into `transact()` callback. */
interface MobileWalletHandle {
  authorize(params: {
    cluster: 'devnet' | 'mainnet-beta' | 'testnet';
    identity: { name: string; uri: string; icon: string };
  }): Promise<{
    accounts: Array<{ address: string }>;
    auth_token: string;
  }>;
  reauthorize(params: {
    auth_token: string;
    identity: { name: string; uri: string; icon: string };
  }): Promise<unknown>;
  signTransactions(params: { transactions: unknown[] }): Promise<unknown[]>;
  signMessages(params: {
    addresses: string[];
    payloads: Uint8Array[];
  }): Promise<Uint8Array[]>;
}

type TransactFn = <T>(callback: (wallet: MobileWalletHandle) => Promise<T>) => Promise<T>;

interface SolanaConnection {
  getBalance(publicKey: SolanaPublicKey): Promise<number>;
  getLatestBlockhash(): Promise<{ blockhash: string }>;
}

// --------------------------------------------------------------------------
// Store interface
// --------------------------------------------------------------------------

interface WalletState {
  publicKey: SolanaPublicKey | null;
  publicKeyBase58: string | null;
  connected: boolean;
  connecting: boolean;
  balance: number;
  authToken: string | null;

  connect: () => Promise<boolean>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  signTransaction: (transaction: unknown) => Promise<unknown | null>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array | null>;
}

// --------------------------------------------------------------------------
// Lazy-loaded module references (native only)
// --------------------------------------------------------------------------

let PublicKey: PublicKeyConstructor | null = null;
let LAMPORTS_PER_SOL = 1_000_000_000;
let transact: TransactFn | null = null;
let getConnection: (() => SolanaConnection) | null = null;
let APP_NAME = 'KAMIYO';
let SOLANA_NETWORK: 'devnet' | 'mainnet-beta' | 'testnet' = 'devnet';

const MWA_IDENTITY = { name: 'KAMIYO', uri: 'https://keiro.kamiyo.ai', icon: 'favicon.ico' };

async function loadSolanaModules(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const web3 = await import('@solana/web3.js');
    PublicKey = web3.PublicKey as unknown as PublicKeyConstructor;
    LAMPORTS_PER_SOL = web3.LAMPORTS_PER_SOL;

    const mwa = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
    transact = mwa.transact as TransactFn;

    const constants = await import('../lib/constants');
    APP_NAME = constants.APP_NAME;
    SOLANA_NETWORK = constants.SOLANA_NETWORK as typeof SOLANA_NETWORK;

    const solana = await import('../lib/solana');
    getConnection = solana.getConnection as () => SolanaConnection;

    return true;
  } catch (e) {
    console.error('Failed to load Solana modules:', e);
    return false;
  }
}

// --------------------------------------------------------------------------
// MWA auth helper – reauthorize with fallback to full authorize
// --------------------------------------------------------------------------

async function authorizeWallet(
  wallet: MobileWalletHandle,
  authToken: string | null
): Promise<void> {
  if (authToken) {
    try {
      await wallet.reauthorize({ auth_token: authToken, identity: MWA_IDENTITY });
      return;
    } catch {
      // Token expired — fall through to full authorize
    }
  }
  await wallet.authorize({ cluster: SOLANA_NETWORK, identity: MWA_IDENTITY });
}

// --------------------------------------------------------------------------
// Zustand store
// --------------------------------------------------------------------------

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
        if (Platform.OS === 'web') return false;

        const loaded = await loadSolanaModules();
        if (!loaded || !transact || !PublicKey) return false;

        set({ connecting: true });

        try {
          const result = await transact(async (wallet) => {
            const auth = await wallet.authorize({
              cluster: SOLANA_NETWORK,
              identity: MWA_IDENTITY,
            });

            const account = auth.accounts[0];
            if (!account) throw new Error('No accounts returned from wallet');

            return { publicKey: account.address, authToken: auth.auth_token };
          });

          const publicKey = new PublicKey(result.publicKey);

          set({
            publicKey,
            publicKeyBase58: result.publicKey,
            connected: true,
            connecting: false,
            authToken: result.authToken,
          });

          void get().refreshBalance();
          return true;
        } catch (error) {
          console.error('Wallet connection failed:', error);
          set({ connecting: false, connected: false, publicKey: null, publicKeyBase58: null });
          return false;
        }
      },

      disconnect: () => {
        set({
          publicKey: null,
          publicKeyBase58: null,
          connected: false,
          connecting: false,
          balance: 0,
          authToken: null,
        });
      },

      refreshBalance: async () => {
        if (Platform.OS === 'web') return;

        const { publicKeyBase58 } = get();
        if (!publicKeyBase58) return;

        const loaded = await loadSolanaModules();
        if (!loaded || !PublicKey || !getConnection) return;

        try {
          const publicKey = new PublicKey(publicKeyBase58);
          const lamports = await getConnection().getBalance(publicKey);
          set({ balance: lamports / LAMPORTS_PER_SOL });
        } catch (error) {
          console.error('Failed to fetch balance:', error);
        }
      },

      signTransaction: async (transaction: unknown) => {
        if (Platform.OS === 'web') return null;

        const { publicKeyBase58, authToken } = get();
        if (!publicKeyBase58) return null;

        const loaded = await loadSolanaModules();
        if (!loaded || !transact || !PublicKey || !getConnection) return null;

        try {
          const signedTransaction = await transact(async (wallet) => {
            await authorizeWallet(wallet, authToken);

            const { blockhash } = await getConnection!().getLatestBlockhash();
            const tx = transaction as { recentBlockhash: string; feePayer: SolanaPublicKey };
            tx.recentBlockhash = blockhash;
            tx.feePayer = new PublicKey!(publicKeyBase58);

            const signed = await wallet.signTransactions({ transactions: [transaction] });
            return signed[0];
          });

          return signedTransaction ?? null;
        } catch (error) {
          console.error('Transaction signing failed:', error);
          return null;
        }
      },

      signMessage: async (message: Uint8Array) => {
        if (Platform.OS === 'web') return null;

        const { authToken, publicKeyBase58 } = get();
        if (!publicKeyBase58) return null;

        const loaded = await loadSolanaModules();
        if (!loaded || !transact) return null;

        try {
          const signature = await transact(async (wallet) => {
            await authorizeWallet(wallet, authToken);

            const signed = await wallet.signMessages({
              addresses: [publicKeyBase58],
              payloads: [message],
            });

            return signed[0];
          });

          return signature ?? null;
        } catch (error) {
          console.error('Message signing failed:', error);
          return null;
        }
      },
    }),
    {
      name: 'keiro-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        publicKeyBase58: state.publicKeyBase58,
        connected: state.connected,
        authToken: state.authToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.publicKeyBase58 && Platform.OS !== 'web') {
          loadSolanaModules().then((loaded) => {
            if (loaded && PublicKey && state.publicKeyBase58) {
              try {
                state.publicKey = new PublicKey(state.publicKeyBase58);
                state.refreshBalance();
              } catch {
                state.publicKey = null;
                state.connected = false;
              }
            }
          }).catch(() => {});
        }
      },
    }
  )
);

export function getShortAddress(publicKey: SolanaPublicKey | string | null): string {
  if (!publicKey) return '';
  if (typeof publicKey === 'string') {
    return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
  }
  try {
    const address = publicKey.toBase58();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  } catch {
    return '';
  }
}
