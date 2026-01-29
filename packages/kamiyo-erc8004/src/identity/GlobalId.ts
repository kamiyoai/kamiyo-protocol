import { GlobalAgentId, CHAIN_CONFIGS } from '../types';

/**
 * Utilities for working with ERC-8004 global agent identifiers
 */

/**
 * Parse a global ID string into its components
 * @param globalId Format: eip155:{chainId}:{registry}:{agentId}
 */
export function parseGlobalId(globalId: string): GlobalAgentId {
  const parts = globalId.split(':');

  if (parts.length !== 4) {
    throw new Error(
      `Invalid global ID format. Expected 4 parts, got ${parts.length}: ${globalId}`
    );
  }

  if (parts[0] !== 'eip155') {
    throw new Error(
      `Invalid namespace. Expected "eip155", got "${parts[0]}": ${globalId}`
    );
  }

  const chainId = parseInt(parts[1], 10);
  if (isNaN(chainId)) {
    throw new Error(`Invalid chain ID: ${parts[1]}`);
  }

  const registry = parts[2];
  if (!registry.startsWith('0x') || registry.length !== 42) {
    throw new Error(`Invalid registry address: ${registry}`);
  }

  let agentId: bigint;
  try {
    agentId = BigInt(parts[3]);
  } catch {
    throw new Error(`Invalid agent ID: ${parts[3]}`);
  }

  return {
    namespace: 'eip155',
    chainId,
    registry,
    agentId,
    raw: globalId,
  };
}

/**
 * Format a global ID from components
 */
export function formatGlobalId(
  chainId: number,
  registry: string,
  agentId: bigint
): string {
  return `eip155:${chainId}:${registry.toLowerCase()}:${agentId.toString()}`;
}

/**
 * Validate a global ID string
 */
export function isValidGlobalId(globalId: string): boolean {
  try {
    parseGlobalId(globalId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get chain name from global ID
 */
export function getChainFromGlobalId(globalId: string): string | undefined {
  const parsed = parseGlobalId(globalId);

  for (const [name, config] of Object.entries(CHAIN_CONFIGS)) {
    if (config.chainId === parsed.chainId) {
      return name;
    }
  }

  return undefined;
}

/**
 * Check if global ID is from canonical registry (Base)
 */
export function isCanonicalGlobalId(globalId: string): boolean {
  const parsed = parseGlobalId(globalId);
  // Base mainnet or Base Sepolia
  return parsed.chainId === 8453 || parsed.chainId === 84532;
}

/**
 * Hash a global ID for use as mapping key
 */
export function hashGlobalId(globalId: string): string {
  const { keccak256, toUtf8Bytes } = require('ethers');
  return keccak256(toUtf8Bytes(globalId));
}

/**
 * Compare two global IDs for equality
 */
export function globalIdsEqual(a: string, b: string): boolean {
  try {
    const parsedA = parseGlobalId(a);
    const parsedB = parseGlobalId(b);

    return (
      parsedA.chainId === parsedB.chainId &&
      parsedA.registry.toLowerCase() === parsedB.registry.toLowerCase() &&
      parsedA.agentId === parsedB.agentId
    );
  } catch {
    return false;
  }
}

/**
 * Extract agent ID from global ID
 */
export function extractAgentId(globalId: string): bigint {
  return parseGlobalId(globalId).agentId;
}

/**
 * Extract registry address from global ID
 */
export function extractRegistry(globalId: string): string {
  return parseGlobalId(globalId).registry;
}

/**
 * Extract chain ID from global ID
 */
export function extractChainId(globalId: string): number {
  return parseGlobalId(globalId).chainId;
}
