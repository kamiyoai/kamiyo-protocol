/*
 * KAMIYO Agent Collaboration SDK
 *
 * ZK-private coordination for AI agent swarms.
 */

export * from './types';
export * from './client';
export {
  MitamaProver,
  generateRandomSalt,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
} from './prover';
export { MerkleTree, createMerkleTree } from './merkle';
