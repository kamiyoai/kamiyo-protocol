import { PublicKey } from '@solana/web3.js';

/**
 * Utility class for deriving Program Derived Addresses (PDAs)
 * for the Mitama escrow program
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
  deriveEscrowPDA(transactionId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(transactionId)],
      this.programId
    );
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
      [Buffer.from('reputation'), entity.toBuffer()],
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
      [Buffer.from('rate_limit'), entity.toBuffer()],
      this.programId
    );
  }
}
