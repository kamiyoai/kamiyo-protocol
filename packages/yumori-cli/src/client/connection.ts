import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEVNET_URL = 'https://api.devnet.solana.com';
const MAINNET_URL = 'https://api.mainnet-beta.solana.com';

export const PROGRAM_ID = new PublicKey('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26');

export type Network = 'devnet' | 'mainnet';

export interface WalletState {
  keypair: Keypair;
  balance: number;
}

export class SolanaClient {
  connection: Connection;
  keypair: Keypair | null = null;
  network: Network;

  constructor(network: Network = 'devnet') {
    this.network = network;
    const url = network === 'mainnet' ? MAINNET_URL : DEVNET_URL;
    this.connection = new Connection(url, 'confirmed');
  }

  async loadWallet(): Promise<boolean> {
    // Try default Solana CLI path
    const defaultPath = join(homedir(), '.config', 'solana', 'id.json');

    // Try Mitama-specific path
    const mitamaPath = join(homedir(), '.yumori', 'wallet.json');

    const paths = [defaultPath, mitamaPath];

    for (const path of paths) {
      if (existsSync(path)) {
        try {
          const data = JSON.parse(readFileSync(path, 'utf8'));
          this.keypair = Keypair.fromSecretKey(new Uint8Array(data));
          return true;
        } catch {
          continue;
        }
      }
    }

    return false;
  }

  async createWallet(): Promise<Keypair> {
    this.keypair = Keypair.generate();

    // Save to Mitama directory
    const mitamaDir = join(homedir(), '.yumori');
    if (!existsSync(mitamaDir)) {
      mkdirSync(mitamaDir, { recursive: true });
    }

    const walletPath = join(mitamaDir, 'wallet.json');
    writeFileSync(walletPath, JSON.stringify(Array.from(this.keypair.secretKey)));

    return this.keypair;
  }

  async getBalance(): Promise<number> {
    if (!this.keypair) return 0;
    return this.connection.getBalance(this.keypair.publicKey);
  }

  async requestAirdrop(amount: number = 1): Promise<string> {
    if (!this.keypair) throw new Error('No wallet loaded');
    if (this.network !== 'devnet') throw new Error('Airdrop only available on devnet');

    const sig = await this.connection.requestAirdrop(
      this.keypair.publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await this.connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }

  getPublicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  getProvider(): AnchorProvider | null {
    if (!this.keypair) return null;

    const wallet = {
      publicKey: this.keypair.publicKey,
      signTransaction: async <T extends import('@solana/web3.js').Transaction>(tx: T): Promise<T> => {
        if ('sign' in tx && typeof tx.sign === 'function') {
          (tx as any).sign(this.keypair!);
        }
        return tx;
      },
      signAllTransactions: async <T extends import('@solana/web3.js').Transaction>(txs: T[]): Promise<T[]> => {
        for (const tx of txs) {
          if ('sign' in tx && typeof tx.sign === 'function') {
            (tx as any).sign(this.keypair!);
          }
        }
        return txs;
      },
    };

    return new AnchorProvider(this.connection, wallet as any, { commitment: 'confirmed' });
  }
}
