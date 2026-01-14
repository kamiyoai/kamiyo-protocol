/**
 * Protocol client - Unified interface to Kamiyo protocol
 * Handles agent identity, ZK proofs, and escrow management
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import { KamiyoClient, AgentManager, AgentIdentity, AgentType } from '@kamiyo/sdk';
import { DarkForestProver, GeneratedProof, TierLevel, getQualifyingTier, getTierThreshold } from '@kamiyo/dark-forest';
import { logger } from './logger';
import * as fs from 'fs';

// Re-export for convenience
export { AgentType, AgentIdentity, GeneratedProof, TierLevel };

export interface ProtocolConfig {
  rpcUrl?: string;
  keypairPath?: string;
}

// Wrapper wallet that implements Anchor's Wallet interface
class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  async signTransaction<T extends import('@solana/web3.js').Transaction | import('@solana/web3.js').VersionedTransaction>(tx: T): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signableTx = tx as any;
    if (typeof signableTx.sign === 'function') {
      signableTx.sign([this.payer]);
    } else if (typeof signableTx.partialSign === 'function') {
      signableTx.partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends import('@solana/web3.js').Transaction | import('@solana/web3.js').VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) {
      await this.signTransaction(tx);
    }
    return txs;
  }
}

export class ProtocolClient {
  private client: KamiyoClient | null = null;
  private agentManager: AgentManager | null = null;
  private prover: DarkForestProver | null = null;
  private keypair: Keypair | null = null;
  private connection: Connection | null = null;
  private initialized = false;

  async initialize(config: ProtocolConfig = {}): Promise<boolean> {
    if (this.initialized) return true;

    const rpcUrl = config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const keypairPath = config.keypairPath || process.env.SOLANA_KEYPAIR_PATH;
    const keypairJson = process.env.SOLANA_KEYPAIR;

    // Load keypair from env var (JSON array) or file path
    if (keypairJson) {
      try {
        const keypairData = JSON.parse(keypairJson);
        this.keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        logger.info('Protocol keypair loaded from env', { pubkey: this.keypair.publicKey.toBase58() });
      } catch (err) {
        logger.error('Failed to parse SOLANA_KEYPAIR', { error: err instanceof Error ? err.message : String(err) });
      }
    } else if (keypairPath && fs.existsSync(keypairPath)) {
      try {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
        this.keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        logger.info('Protocol keypair loaded from file', { pubkey: this.keypair.publicKey.toBase58() });
      } catch (err) {
        logger.error('Failed to load keypair', { error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      logger.warn('No keypair configured - protocol features requiring signing disabled');
    }

    // Initialize connection
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Initialize SDK client if keypair available
    if (this.keypair) {
      const wallet = new KeypairWallet(this.keypair);
      this.client = new KamiyoClient({
        connection: this.connection,
        wallet,
      });
      this.agentManager = new AgentManager(this.client);
    }

    // Initialize ZK prover if artifacts available
    if (DarkForestProver.isAvailable()) {
      try {
        this.prover = new DarkForestProver();
        await this.prover.init();
        logger.info('ZK prover initialized');
      } catch (err) {
        logger.error('ZK prover initialization failed', { error: err instanceof Error ? err.message : String(err) });
      }
    } else {
      logger.warn('ZK circuit artifacts not available - proof generation disabled');
    }

    this.initialized = true;
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasKeypair(): boolean {
    return this.keypair !== null;
  }

  hasProver(): boolean {
    return this.prover !== null;
  }

  getPublicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  getConnection(): Connection | null {
    return this.connection;
  }

  // Agent identity methods
  async getOrCreateAgent(name: string = 'KAMIYO Companion'): Promise<AgentIdentity | null> {
    if (!this.agentManager || !this.client) {
      logger.warn('Agent manager not available - keypair required');
      return null;
    }

    // Check if agent already exists
    const existing = await this.agentManager.getMine();
    if (existing) {
      logger.info('Agent identity found', {
        pda: this.client.getAgentPDA(this.keypair!.publicKey)[0].toBase58(),
        name: existing.name,
        reputation: existing.reputation.toNumber(),
      });
      return existing;
    }

    // Create new agent
    try {
      const { signature, pda } = await this.agentManager.create(
        name,
        AgentType.Service,
        0.1 // 0.1 SOL stake
      );
      logger.info('Agent identity created', { signature, pda: pda.toBase58() });

      return this.agentManager.getMine();
    } catch (err) {
      logger.error('Failed to create agent', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async getAgent(): Promise<AgentIdentity | null> {
    if (!this.agentManager) return null;
    return this.agentManager.getMine();
  }

  getAgentPDA(): PublicKey | null {
    if (!this.client || !this.keypair) return null;
    const [pda] = this.client.getAgentPDA(this.keypair.publicKey);
    return pda;
  }

  // ZK proof methods
  async generateReputationProof(
    score: number,
    threshold: number,
    secret?: bigint
  ): Promise<GeneratedProof | null> {
    if (!this.prover) {
      logger.warn('ZK prover not available');
      return null;
    }

    if (score < threshold) {
      logger.debug('Score below threshold, cannot generate proof', { score, threshold });
      return null;
    }

    try {
      const secretValue = secret ?? BigInt(Math.floor(Math.random() * 1e18));
      const proof = await this.prover.generateProof({
        score,
        threshold,
        secret: secretValue,
      });
      logger.info('ZK proof generated', { threshold, tier: getQualifyingTier(score) });
      return proof;
    } catch (err) {
      logger.error('Proof generation failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async generateTierProof(score: number, tier: TierLevel): Promise<GeneratedProof | null> {
    const threshold = getTierThreshold(tier);
    return this.generateReputationProof(score, threshold);
  }

  async verifyProof(proof: GeneratedProof): Promise<boolean> {
    if (!this.prover) return false;
    const result = await this.prover.verifyProof(proof);
    return result.valid;
  }

  // Escrow methods (via SDK)
  async createAgreement(
    provider: PublicKey,
    amountSol: number,
    timeLockSeconds: number,
    transactionId: string
  ): Promise<string | null> {
    if (!this.client) {
      logger.warn('SDK client not available');
      return null;
    }

    try {
      const signature = await this.client.createAgreement({
        provider,
        amount: new BN(amountSol * LAMPORTS_PER_SOL),
        timeLockSeconds: new BN(timeLockSeconds),
        transactionId,
      });
      logger.info('Agreement created', { signature, transactionId });
      return signature;
    } catch (err) {
      logger.error('Failed to create agreement', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async releaseFunds(transactionId: string, provider: PublicKey): Promise<string | null> {
    if (!this.client) return null;

    try {
      const signature = await this.client.releaseFunds(transactionId, provider);
      logger.info('Funds released', { signature, transactionId });
      return signature;
    } catch (err) {
      logger.error('Failed to release funds', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async markDisputed(transactionId: string): Promise<string | null> {
    if (!this.client) return null;

    try {
      const signature = await this.client.markDisputed(transactionId);
      logger.info('Agreement marked disputed', { signature, transactionId });
      return signature;
    } catch (err) {
      logger.error('Failed to mark disputed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // Reputation query
  async getReputation(entity?: PublicKey): Promise<number | null> {
    if (!this.client) return null;

    const target = entity ?? this.keypair?.publicKey;
    if (!target) return null;

    try {
      const rep = await this.client.getReputation(target);
      return rep?.reputationScore ?? null;
    } catch {
      return null;
    }
  }
}

// Singleton instance
let protocolInstance: ProtocolClient | null = null;

export function getProtocol(): ProtocolClient {
  if (!protocolInstance) {
    protocolInstance = new ProtocolClient();
  }
  return protocolInstance;
}

export async function initProtocol(config?: ProtocolConfig): Promise<ProtocolClient> {
  const protocol = getProtocol();
  await protocol.initialize(config);
  return protocol;
}
