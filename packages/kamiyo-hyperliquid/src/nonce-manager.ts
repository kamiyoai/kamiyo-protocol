import { Signer, Provider } from 'ethers';

/**
 * Manages transaction nonces to prevent conflicts during concurrent submissions.
 * Tracks pending transactions and ensures each uses the next available nonce.
 */
export class NonceManager {
  private pendingNonce: number | null = null;
  private readonly provider: Provider;
  private readonly address: string;
  private mutex: Promise<void> = Promise.resolve();

  constructor(provider: Provider, address: string) {
    this.provider = provider;
    this.address = address;
  }

  /**
   * Get the next available nonce for a transaction.
   * Thread-safe - multiple concurrent calls will get sequential nonces.
   */
  async getNextNonce(): Promise<number> {
    let resolveNext: () => void;
    const nextMutex = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    // Wait for any pending nonce acquisition
    await this.mutex;
    this.mutex = nextMutex;

    try {
      if (this.pendingNonce === null) {
        // First transaction - get nonce from chain
        this.pendingNonce = await this.provider.getTransactionCount(this.address, 'pending');
      } else {
        // Increment for next transaction
        this.pendingNonce++;
      }

      return this.pendingNonce;
    } finally {
      resolveNext!();
    }
  }

  /**
   * Mark a nonce as confirmed (transaction mined).
   * Resets tracking if the confirmed nonce matches expected.
   */
  confirmNonce(nonce: number): void {
    // If confirmed nonce is at or past our tracking, reset
    if (this.pendingNonce !== null && nonce >= this.pendingNonce) {
      this.pendingNonce = null;
    }
  }

  /**
   * Mark a nonce as failed. Decrements the pending nonce to allow retry.
   */
  revertNonce(nonce: number): void {
    if (this.pendingNonce !== null && nonce === this.pendingNonce) {
      this.pendingNonce--;
    }
  }

  /**
   * Reset nonce tracking. Use after errors or long periods of inactivity.
   */
  reset(): void {
    this.pendingNonce = null;
  }

  /**
   * Get current pending nonce without incrementing.
   * Returns null if no transactions have been sent.
   */
  getCurrentNonce(): number | null {
    return this.pendingNonce;
  }
}

/**
 * Creates a NonceManager for a signer.
 */
export async function createNonceManager(signer: Signer): Promise<NonceManager> {
  const provider = signer.provider;
  if (!provider) {
    throw new Error('Signer must have a provider');
  }
  const address = await signer.getAddress();
  return new NonceManager(provider, address);
}
