/**
 * Surfpool Client - Solana simulation environment integration
 *
 * Surfpool provides a fork of Solana devnet/mainnet for safe strategy testing
 * without risking real funds. This client wraps Surfpool's JSON-RPC methods.
 *
 * @see https://github.com/txtx/surfpool
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SimulatedTransactionResponse,
  Commitment,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export interface SurfpoolConfig {
  /** Surfpool RPC endpoint URL */
  endpoint: string;
  /** Optional commitment level */
  commitment?: Commitment;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface AccountSnapshot {
  pubkey: PublicKey;
  lamports: number;
  data: Buffer;
  owner: PublicKey;
  executable: boolean;
  rentEpoch: number;
}

export interface SimulationResult {
  success: boolean;
  error?: string;
  logs: string[];
  unitsConsumed: number;
  returnData?: {
    programId: PublicKey;
    data: Buffer;
  };
  accounts?: AccountSnapshot[];
}

export interface ForkConfig {
  /** Source cluster to fork from */
  sourceCluster: "mainnet-beta" | "devnet" | "testnet";
  /** Optional slot to fork from (latest if not specified) */
  slot?: number;
  /** Accounts to prefetch into fork */
  prefetchAccounts?: PublicKey[];
}

export interface TimeWarpResult {
  previousSlot: number;
  currentSlot: number;
  slotsAdvanced: number;
}

export interface BlockhashOverride {
  blockhash: string;
  lastValidBlockHeight: number;
}

/**
 * Surfpool Client for Solana simulation
 */
export class SurfpoolClient {
  private endpoint: string;
  private timeout: number;
  private commitment: Commitment;
  private connection: Connection;
  private requestId: number = 0;

  constructor(config: SurfpoolConfig) {
    this.endpoint = config.endpoint;
    this.timeout = config.timeout ?? 30000;
    this.commitment = config.commitment ?? "confirmed";
    this.connection = new Connection(this.endpoint, {
      commitment: this.commitment,
    });
  }

  /**
   * Get the underlying Solana connection for standard RPC calls
   */
  getConnection(): Connection {
    return this.connection;
  }

  // ==========================================================================
  // Surfpool-specific RPC Methods
  // ==========================================================================

  /**
   * Set account balance in simulation
   */
  async setBalance(account: PublicKey, lamports: number): Promise<boolean> {
    const result = await this.rpcCall<boolean>("surfnet_setBalance", [
      account.toBase58(),
      lamports,
    ]);
    return result;
  }

  /**
   * Set account balance in SOL (convenience method)
   */
  async setBalanceSol(account: PublicKey, sol: number): Promise<boolean> {
    return this.setBalance(account, Math.floor(sol * LAMPORTS_PER_SOL));
  }

  /**
   * Warp to a specific slot (time travel)
   */
  async warpToSlot(slot: number): Promise<TimeWarpResult> {
    const previousSlot = await this.connection.getSlot();
    await this.rpcCall<boolean>("surfnet_warpToSlot", [slot]);
    const currentSlot = await this.connection.getSlot();

    return {
      previousSlot,
      currentSlot,
      slotsAdvanced: currentSlot - previousSlot,
    };
  }

  /**
   * Advance simulation by N slots
   */
  async advanceSlots(slots: number): Promise<TimeWarpResult> {
    const currentSlot = await this.connection.getSlot();
    return this.warpToSlot(currentSlot + slots);
  }

  /**
   * Advance simulation by approximate time duration
   * (Solana averages ~400ms per slot)
   */
  async advanceTime(seconds: number): Promise<TimeWarpResult> {
    const slotsToAdvance = Math.ceil(seconds / 0.4);
    return this.advanceSlots(slotsToAdvance);
  }

  /**
   * Create a fork from mainnet/devnet at specific slot
   */
  async createFork(config: ForkConfig): Promise<boolean> {
    const params: Record<string, unknown> = {
      cluster: config.sourceCluster,
    };

    if (config.slot !== undefined) {
      params.slot = config.slot;
    }

    if (config.prefetchAccounts && config.prefetchAccounts.length > 0) {
      params.prefetchAccounts = config.prefetchAccounts.map((pk) =>
        pk.toBase58()
      );
    }

    return this.rpcCall<boolean>("surfnet_createFork", [params]);
  }

  /**
   * Reset simulation to clean state
   */
  async reset(): Promise<boolean> {
    return this.rpcCall<boolean>("surfnet_reset", []);
  }

  /**
   * Set custom blockhash for transaction simulation
   */
  async setBlockhash(override: BlockhashOverride): Promise<boolean> {
    return this.rpcCall<boolean>("surfnet_setBlockhash", [
      override.blockhash,
      override.lastValidBlockHeight,
    ]);
  }

  /**
   * Snapshot current state for later restore
   */
  async snapshot(): Promise<string> {
    return this.rpcCall<string>("surfnet_snapshot", []);
  }

  /**
   * Restore to a previous snapshot
   */
  async restore(snapshotId: string): Promise<boolean> {
    return this.rpcCall<boolean>("surfnet_restore", [snapshotId]);
  }

  /**
   * Set account data directly
   */
  async setAccountData(
    account: PublicKey,
    data: Buffer,
    owner?: PublicKey
  ): Promise<boolean> {
    const params: unknown[] = [account.toBase58(), data.toString("base64")];
    if (owner) {
      params.push(owner.toBase58());
    }
    return this.rpcCall<boolean>("surfnet_setAccountData", params);
  }

  /**
   * Clone an account from mainnet/devnet into simulation
   */
  async cloneAccount(
    account: PublicKey,
    sourceCluster: "mainnet-beta" | "devnet" = "mainnet-beta"
  ): Promise<boolean> {
    return this.rpcCall<boolean>("surfnet_cloneAccount", [
      account.toBase58(),
      sourceCluster,
    ]);
  }

  /**
   * Clone multiple accounts in batch
   */
  async cloneAccounts(
    accounts: PublicKey[],
    sourceCluster: "mainnet-beta" | "devnet" = "mainnet-beta"
  ): Promise<boolean> {
    return this.rpcCall<boolean>("surfnet_cloneAccounts", [
      accounts.map((pk) => pk.toBase58()),
      sourceCluster,
    ]);
  }

  // ==========================================================================
  // Transaction Simulation
  // ==========================================================================

  /**
   * Simulate a transaction with detailed results
   */
  async simulateTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: {
      sigVerify?: boolean;
      replaceRecentBlockhash?: boolean;
      accounts?: PublicKey[];
    }
  ): Promise<SimulationResult> {
    const config: Record<string, unknown> = {
      commitment: this.commitment,
      encoding: "base64",
    };

    if (options?.sigVerify !== undefined) {
      config.sigVerify = options.sigVerify;
    }
    if (options?.replaceRecentBlockhash !== undefined) {
      config.replaceRecentBlockhash = options.replaceRecentBlockhash;
    }
    if (options?.accounts) {
      config.accounts = {
        encoding: "base64",
        addresses: options.accounts.map((pk) => pk.toBase58()),
      };
    }

    const serialized =
      transaction instanceof VersionedTransaction
        ? Buffer.from(transaction.serialize()).toString("base64")
        : transaction.serialize().toString("base64");

    const result = await this.connection.simulateTransaction(
      transaction as Transaction,
      undefined,
      options?.accounts
    );

    return this.parseSimulationResponse(result.value, options?.accounts);
  }

  /**
   * Execute transaction in simulation (stateful)
   */
  async executeTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<SimulationResult> {
    // Surfpool-specific: execute and commit to simulation state
    const serialized =
      transaction instanceof VersionedTransaction
        ? Buffer.from(transaction.serialize()).toString("base64")
        : transaction.serialize().toString("base64");

    const result = await this.rpcCall<{
      err: string | null;
      logs: string[];
      unitsConsumed: number;
    }>("surfnet_executeTransaction", [serialized]);

    return {
      success: result.err === null,
      error: result.err ?? undefined,
      logs: result.logs,
      unitsConsumed: result.unitsConsumed,
    };
  }

  // ==========================================================================
  // Account Queries
  // ==========================================================================

  /**
   * Get account balance in lamports
   */
  async getBalance(account: PublicKey): Promise<number> {
    return this.connection.getBalance(account);
  }

  /**
   * Get account balance in SOL
   */
  async getBalanceSol(account: PublicKey): Promise<number> {
    const lamports = await this.getBalance(account);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Get multiple account infos
   */
  async getMultipleAccounts(
    accounts: PublicKey[]
  ): Promise<(AccountSnapshot | null)[]> {
    const infos = await this.connection.getMultipleAccountsInfo(accounts);
    return infos.map((info, idx) => {
      if (!info) return null;
      return {
        pubkey: accounts[idx],
        lamports: info.lamports,
        data: Buffer.from(info.data),
        owner: info.owner,
        executable: info.executable,
        rentEpoch: info.rentEpoch ?? 0,
      };
    });
  }

  /**
   * Get current slot
   */
  async getSlot(): Promise<number> {
    return this.connection.getSlot();
  }

  /**
   * Get current block time
   */
  async getBlockTime(): Promise<number | null> {
    const slot = await this.getSlot();
    return this.connection.getBlockTime(slot);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.requestId,
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as {
        result?: T;
        error?: { message: string };
      };

      if (json.error) {
        throw new Error(`RPC Error: ${json.error.message}`);
      }

      return json.result as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseSimulationResponse(
    response: SimulatedTransactionResponse,
    accounts?: PublicKey[]
  ): SimulationResult {
    const result: SimulationResult = {
      success: response.err === null,
      error: response.err ? JSON.stringify(response.err) : undefined,
      logs: response.logs ?? [],
      unitsConsumed: response.unitsConsumed ?? 0,
    };

    if (response.returnData) {
      result.returnData = {
        programId: new PublicKey(response.returnData.programId),
        data: Buffer.from(response.returnData.data[0], "base64"),
      };
    }

    if (response.accounts && accounts) {
      result.accounts = response.accounts.map((acc, idx) => {
        if (!acc) {
          return {
            pubkey: accounts[idx],
            lamports: 0,
            data: Buffer.alloc(0),
            owner: PublicKey.default,
            executable: false,
            rentEpoch: 0,
          };
        }
        return {
          pubkey: accounts[idx],
          lamports: acc.lamports,
          data: Buffer.from(acc.data[0], "base64"),
          owner: new PublicKey(acc.owner),
          executable: acc.executable,
          rentEpoch: acc.rentEpoch ?? 0,
        };
      });
    }

    return result;
  }
}
