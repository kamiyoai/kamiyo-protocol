import { PublicKey } from '@solana/web3.js';

/**
 * Utility class for deriving Program Derived Addresses (PDAs)
 * for the Kamiyo escrow program
 */
export class PDADeriver {
  constructor(private programId: PublicKey) {}

  /**
   * Derive escrow PDA from transaction ID
   * Seeds: ['escrow', transaction_id]
   *
   * @param transactionId - Unique transaction identifier
   * @returns [PDA PublicKey, bump seed]
   */
  deriveEscrowPDA(transactionId: string, agent?: PublicKey): [PublicKey, number] {
    const seeds: Uint8Array[] = [Buffer.from('escrow')];
    if (agent) {
      seeds.push(agent.toBytes());
    }
    seeds.push(Buffer.from(transactionId));
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Derive escrow PDAs across supported seed layouts.
   * Newer programs use ['escrow', agent, transaction_id].
   * Legacy programs use ['escrow', transaction_id].
   */
  deriveEscrowPDAs(transactionId: string, agent?: PublicKey): [PublicKey, number][] {
    const pdas: [PublicKey, number][] = [];
    const seen = new Set<string>();

    if (agent) {
      const derived = this.deriveEscrowPDA(transactionId, agent);
      pdas.push(derived);
      seen.add(derived[0].toBase58());
    }

    const legacy = this.deriveEscrowPDA(transactionId);
    if (!seen.has(legacy[0].toBase58())) {
      pdas.push(legacy);
    }

    return pdas;
  }

  /**
   * Derive reputation PDA for an entity (agent or API provider)
   * Seeds: ['reputation', entity_pubkey]
   *
   * @param entity - Entity public key
   * @returns [PDA PublicKey, bump seed]
   */
  deriveReputationPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), entity.toBytes()],
      this.programId
    );
  }

  /**
   * Derive rate limiter PDA for an entity
   * Seeds: ['rate_limit', entity_pubkey]
   *
   * @param entity - Entity public key
   * @returns [PDA PublicKey, bump seed]
   */
  deriveRateLimiterPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('rate_limit'), entity.toBytes()],
      this.programId
    );
  }

  /**
   * Derive protocol config PDA
   * Seeds: ['protocol_config']
   */
  deriveProtocolConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('protocol_config')], this.programId);
  }

  /**
   * Derive treasury PDA
   * Seeds: ['treasury']
   */
  deriveTreasuryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('treasury')], this.programId);
  }

  /**
   * Derive oracle registry PDA
   * Seeds: ['oracle_registry']
   */
  deriveOracleRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('oracle_registry')], this.programId);
  }
}
