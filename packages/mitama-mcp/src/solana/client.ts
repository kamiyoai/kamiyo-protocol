import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionSignature,
  Commitment,
  ConfirmOptions,
} from '@solana/web3.js';
import * as fs from 'fs';
import bs58 from 'bs58';

/**
 * Load keypair from file path or base58 string
 *
 * @param pathOrBase58 - File path to JSON keypair or base58 encoded private key
 * @returns Keypair instance
 */
export function loadKeypair(pathOrBase58: string): Keypair {
  if (pathOrBase58.includes('/') || pathOrBase58.includes('\\')) {
    // Load from file (JSON array format)
    const data = JSON.parse(fs.readFileSync(pathOrBase58, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(data));
  } else {
    // Load from base58 string
    return Keypair.fromSecretKey(bs58.decode(pathOrBase58));
  }
}

/**
 * Solana RPC client wrapper with connection management
 * and transaction utilities
 */
export class SolanaClient {
  public connection: Connection;
  public wallet: Keypair;

  constructor(rpcUrl: string, wallet: Keypair, commitment: Commitment = 'confirmed') {
    this.connection = new Connection(rpcUrl, commitment);
    this.wallet = wallet;
  }

  /**
   * Get wallet public key
   */
  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  /**
   * Get SOL balance for an address
   *
   * @param address - Public key to check balance for (defaults to wallet)
   * @returns Balance in lamports
   */
  async getBalance(address?: PublicKey): Promise<number> {
    const pubkey = address || this.publicKey;
    return await this.connection.getBalance(pubkey);
  }

  /**
   * Get SOL balance in SOL (not lamports)
   *
   * @param address - Public key to check balance for (defaults to wallet)
   * @returns Balance in SOL
   */
  async getBalanceInSol(address?: PublicKey): Promise<number> {
    const lamports = await this.getBalance(address);
    return lamports / 1_000_000_000;
  }

  /**
   * Send and confirm a transaction
   *
   * @param transaction - Transaction to send
   * @param options - Confirmation options
   * @returns Transaction signature
   */
  async sendAndConfirmTransaction(
    transaction: Transaction,
    options?: ConfirmOptions
  ): Promise<TransactionSignature> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.publicKey;

    // Sign transaction
    transaction.sign(this.wallet);

    // Send transaction
    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      ...options,
    });

    // Confirm transaction
    await this.connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      options?.commitment || 'confirmed'
    );

    return signature;
  }

  /**
   * Check if an account exists
   *
   * @param address - Account address to check
   * @returns True if account exists
   */
  async accountExists(address: PublicKey): Promise<boolean> {
    const accountInfo = await this.connection.getAccountInfo(address);
    return accountInfo !== null;
  }

  /**
   * Request airdrop (devnet/testnet only)
   *
   * @param amount - Amount in SOL
   * @param address - Address to airdrop to (defaults to wallet)
   * @returns Transaction signature
   */
  async requestAirdrop(amount: number, address?: PublicKey): Promise<TransactionSignature> {
    const pubkey = address || this.publicKey;
    const lamports = amount * 1_000_000_000;

    const signature = await this.connection.requestAirdrop(pubkey, lamports);

    // Wait for confirmation
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return signature;
  }
}
