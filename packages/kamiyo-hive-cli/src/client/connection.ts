import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { readFileSync, existsSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const DEVNET_URL = 'https://api.devnet.solana.com';
const MAINNET_URL = 'https://api.mainnet-beta.solana.com';

export const PROGRAM_ID = new PublicKey('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26');

export type Network = 'devnet' | 'mainnet';

export interface WalletState {
  keypair: Keypair;
  balance: number;
}

// Wallet encryption using AES-256-GCM
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface EncryptedWallet {
  version: number;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

function encryptSecretKey(secretKey: Uint8Array, password: string): EncryptedWallet {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

function decryptSecretKey(encrypted: EncryptedWallet, password: string): Uint8Array {
  const salt = Buffer.from(encrypted.salt, 'hex');
  const key = deriveKey(password, salt);
  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return new Uint8Array(decrypted);
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

  async loadWallet(password?: string): Promise<boolean> {
    // Try default Solana CLI path (unencrypted, for dev convenience)
    const defaultPath = join(homedir(), '.config', 'solana', 'id.json');
    if (existsSync(defaultPath)) {
      try {
        const data = JSON.parse(readFileSync(defaultPath, 'utf8'));
        this.keypair = Keypair.fromSecretKey(new Uint8Array(data));
        return true;
      } catch {
        // Continue to try encrypted wallet
      }
    }

    // Try Hive encrypted wallet
    const swarmteamsPath = join(homedir(), '.hive', 'wallet.enc.json');
    if (existsSync(swarmteamsPath) && password) {
      try {
        const encrypted: EncryptedWallet = JSON.parse(readFileSync(swarmteamsPath, 'utf8'));
        const secretKey = decryptSecretKey(encrypted, password);
        this.keypair = Keypair.fromSecretKey(secretKey);
        return true;
      } catch {
        return false;
      }
    }

    // Legacy unencrypted wallet (for migration)
    const legacyPath = join(homedir(), '.hive', 'wallet.json');
    if (existsSync(legacyPath)) {
      try {
        const data = JSON.parse(readFileSync(legacyPath, 'utf8'));
        this.keypair = Keypair.fromSecretKey(new Uint8Array(data));
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  async createWallet(password: string): Promise<Keypair> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    this.keypair = Keypair.generate();

    const swarmteamsDir = join(homedir(), '.hive');
    if (!existsSync(swarmteamsDir)) {
      mkdirSync(swarmteamsDir, { recursive: true, mode: 0o700 });
    }

    // Encrypt and save wallet
    const encrypted = encryptSecretKey(this.keypair.secretKey, password);
    const walletPath = join(swarmteamsDir, 'wallet.enc.json');
    writeFileSync(walletPath, JSON.stringify(encrypted, null, 2));
    chmodSync(walletPath, 0o600);

    return this.keypair;
  }

  async migrateUnencryptedWallet(password: string): Promise<boolean> {
    const legacyPath = join(homedir(), '.hive', 'wallet.json');
    if (!existsSync(legacyPath)) return false;

    try {
      const data = JSON.parse(readFileSync(legacyPath, 'utf8'));
      const secretKey = new Uint8Array(data);

      // Encrypt and save
      const encrypted = encryptSecretKey(secretKey, password);
      const newPath = join(homedir(), '.hive', 'wallet.enc.json');
      writeFileSync(newPath, JSON.stringify(encrypted, null, 2));
      chmodSync(newPath, 0o600);

      // Remove legacy file
      const { unlinkSync } = await import('fs');
      unlinkSync(legacyPath);

      return true;
    } catch {
      return false;
    }
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
