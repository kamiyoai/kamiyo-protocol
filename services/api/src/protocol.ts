// Protocol client stub - ZK proofs disabled until @kamiyo packages are published
import { logger } from './logger';

export interface GeneratedProof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  publicInputs: bigint[];
  commitment: string;
}

export class ProtocolClient {
  private initialized = false;

  async initialize(): Promise<boolean> {
    this.initialized = true;
    logger.warn('Protocol client running in stub mode - ZK proofs disabled');
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasKeypair(): boolean {
    return false;
  }

  hasProver(): boolean {
    return false;
  }

  async generateReputationProof(
    _score: number,
    _threshold: number
  ): Promise<GeneratedProof | null> {
    logger.warn('ZK prover not available - @kamiyo/kamiyo-mitama not installed');
    return null;
  }

  async verifyProof(_proof: GeneratedProof): Promise<boolean> {
    logger.warn('ZK prover not available - @kamiyo/kamiyo-mitama not installed');
    return false;
  }

  async getReputation(): Promise<number | null> {
    return null;
  }

  async getOrCreateAgent(_name: string): Promise<{ reputation: { toNumber: () => number }; isActive: boolean } | null> {
    return null;
  }

  getAgentPDA(): { toBase58: () => string } | null {
    return null;
  }
}

let protocolInstance: ProtocolClient | null = null;

export function getProtocol(): ProtocolClient {
  if (!protocolInstance) {
    protocolInstance = new ProtocolClient();
  }
  return protocolInstance;
}

export async function initProtocol(): Promise<ProtocolClient> {
  const protocol = getProtocol();
  await protocol.initialize();
  return protocol;
}
