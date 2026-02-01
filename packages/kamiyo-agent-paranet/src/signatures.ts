// EIP-712 signature verification for attestations
// Ensures only the declared attestor can publish attestations

import { verifyTypedData, hashTypedData, type TypedDataDomain, type Address } from 'viem';
import { isValidGlobalId } from './shared';

// EIP-712 domain for KAMIYO Paranet attestations
export const EIP712_DOMAIN: TypedDataDomain = {
  name: 'KAMIYO Paranet',
  version: '1',
  chainId: 8453, // Base mainnet default
};

// Type definitions for EIP-712 typed data
export const EIP712_TYPES = {
  TaskCompletion: [
    { name: 'providerGlobalId', type: 'string' },
    { name: 'clientGlobalId', type: 'string' },
    { name: 'taskType', type: 'string' },
    { name: 'qualityScore', type: 'uint8' },
    { name: 'paymentAmount', type: 'uint256' },
    { name: 'paymentCurrency', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
  CapabilityAttestation: [
    { name: 'agentGlobalId', type: 'string' },
    { name: 'capability', type: 'string' },
    { name: 'attestorGlobalId', type: 'string' },
    { name: 'confidence', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
  ],
  TrustRelationship: [
    { name: 'trustorGlobalId', type: 'string' },
    { name: 'trusteeGlobalId', type: 'string' },
    { name: 'trustLevel', type: 'uint8' },
    { name: 'trustType', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

// Task completion with signature fields
export interface SignedTaskCompletion {
  providerGlobalId: string;
  clientGlobalId: string;
  taskType: string;
  qualityScore: number;
  paymentAmount: number;
  paymentCurrency: string;
  timestamp: number;
  signature: `0x${string}`;
}

// Capability attestation with signature fields
export interface SignedCapabilityAttestation {
  agentGlobalId: string;
  capability: string;
  attestorGlobalId: string;
  confidence: number;
  timestamp: number;
  signature: `0x${string}`;
}

// Trust relationship with signature fields
export interface SignedTrustRelationship {
  trustorGlobalId: string;
  trusteeGlobalId: string;
  trustLevel: number;
  trustType: string;
  timestamp: number;
  signature: `0x${string}`;
}

// Extract address from ERC-8004 global ID
export function extractAddressFromGlobalId(globalId: string): Address | null {
  if (!isValidGlobalId(globalId)) return null;
  // Format: eip155:chainId:0xAddress:agentId
  const parts = globalId.split(':');
  if (parts.length !== 4) return null;
  const addr = parts[2];
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return addr.toLowerCase() as Address;
}

// Verify signature matches the declared attestor's address
export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
  expectedAddress?: string;
}

// Default max timestamp drift (5 minutes - tighter for security)
const DEFAULT_MAX_DRIFT_MS = 300000;

// Verify a task completion signature
export async function verifyTaskCompletionSignature(
  task: SignedTaskCompletion,
  options: { maxDriftMs?: number; chainId?: number } = {}
): Promise<SignatureVerificationResult> {
  // Extract expected address from client global ID
  const clientAddress = extractAddressFromGlobalId(task.clientGlobalId);

  if (!clientAddress) {
    return { valid: false, error: 'Cannot extract address from clientGlobalId' };
  }

  if (!task.signature || !task.signature.startsWith('0x')) {
    return { valid: false, error: 'Missing or invalid signature' };
  }

  // Verify timestamp is recent
  const maxDrift = options.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  const now = Date.now();
  if (task.timestamp < now - maxDrift || task.timestamp > now + 60000) {
    return { valid: false, error: 'Signature timestamp out of range' };
  }

  try {
    const domain = options.chainId ? { ...EIP712_DOMAIN, chainId: options.chainId } : EIP712_DOMAIN;

    const isValid = await verifyTypedData({
      address: clientAddress,
      domain,
      types: EIP712_TYPES,
      primaryType: 'TaskCompletion',
      message: {
        providerGlobalId: task.providerGlobalId,
        clientGlobalId: task.clientGlobalId,
        taskType: task.taskType,
        qualityScore: task.qualityScore,
        paymentAmount: BigInt(Math.floor(task.paymentAmount * 1e6)), // Convert to micro units
        paymentCurrency: task.paymentCurrency,
        timestamp: BigInt(task.timestamp),
      },
      signature: task.signature,
    });

    return {
      valid: isValid,
      expectedAddress: clientAddress,
      error: isValid ? undefined : 'Signature does not match client address',
    };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      expectedAddress: clientAddress,
    };
  }
}

// Verify a capability attestation signature
export async function verifyCapabilityAttestationSignature(
  attestation: SignedCapabilityAttestation,
  options: { maxDriftMs?: number; chainId?: number } = {}
): Promise<SignatureVerificationResult> {
  // Extract expected address from attestor global ID
  const attestorAddress = extractAddressFromGlobalId(attestation.attestorGlobalId);

  if (!attestorAddress) {
    return { valid: false, error: 'Cannot extract address from attestorGlobalId' };
  }

  if (!attestation.signature || !attestation.signature.startsWith('0x')) {
    return { valid: false, error: 'Missing or invalid signature' };
  }

  // Verify timestamp is recent
  const maxDrift = options.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  const now = Date.now();
  if (attestation.timestamp < now - maxDrift || attestation.timestamp > now + 60000) {
    return { valid: false, error: 'Signature timestamp out of range' };
  }

  try {
    const domain = options.chainId ? { ...EIP712_DOMAIN, chainId: options.chainId } : EIP712_DOMAIN;

    const isValid = await verifyTypedData({
      address: attestorAddress,
      domain,
      types: EIP712_TYPES,
      primaryType: 'CapabilityAttestation',
      message: {
        agentGlobalId: attestation.agentGlobalId,
        capability: attestation.capability,
        attestorGlobalId: attestation.attestorGlobalId,
        confidence: attestation.confidence,
        timestamp: BigInt(attestation.timestamp),
      },
      signature: attestation.signature,
    });

    return {
      valid: isValid,
      expectedAddress: attestorAddress,
      error: isValid ? undefined : 'Signature does not match attestor address',
    };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      expectedAddress: attestorAddress,
    };
  }
}

// Verify a trust relationship signature
export async function verifyTrustRelationshipSignature(
  trust: SignedTrustRelationship,
  options: { maxDriftMs?: number; chainId?: number } = {}
): Promise<SignatureVerificationResult> {
  // Extract expected address from trustor global ID
  const trustorAddress = extractAddressFromGlobalId(trust.trustorGlobalId);

  if (!trustorAddress) {
    return { valid: false, error: 'Cannot extract address from trustorGlobalId' };
  }

  if (!trust.signature || !trust.signature.startsWith('0x')) {
    return { valid: false, error: 'Missing or invalid signature' };
  }

  // Verify timestamp is recent
  const maxDrift = options.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  const now = Date.now();
  if (trust.timestamp < now - maxDrift || trust.timestamp > now + 60000) {
    return { valid: false, error: 'Signature timestamp out of range' };
  }

  try {
    const domain = options.chainId ? { ...EIP712_DOMAIN, chainId: options.chainId } : EIP712_DOMAIN;

    const isValid = await verifyTypedData({
      address: trustorAddress,
      domain,
      types: EIP712_TYPES,
      primaryType: 'TrustRelationship',
      message: {
        trustorGlobalId: trust.trustorGlobalId,
        trusteeGlobalId: trust.trusteeGlobalId,
        trustLevel: trust.trustLevel,
        trustType: trust.trustType,
        timestamp: BigInt(trust.timestamp),
      },
      signature: trust.signature,
    });

    return {
      valid: isValid,
      expectedAddress: trustorAddress,
      error: isValid ? undefined : 'Signature does not match trustor address',
    };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      expectedAddress: trustorAddress,
    };
  }
}

// Configuration for signature verification
export interface SignatureConfig {
  requireSignatures: boolean;
  allowedSigners?: string[]; // Whitelist of addresses
  maxTimestampDriftMs?: number;
  chainId?: number;
}

// Create signature verification middleware
export function createSignatureVerifier(config: SignatureConfig = { requireSignatures: false }) {
  const options = {
    maxDriftMs: config.maxTimestampDriftMs,
    chainId: config.chainId,
  };

  const checkAllowlist = (address?: string): boolean => {
    if (!config.allowedSigners?.length) return true;
    if (!address) return false;
    return config.allowedSigners.some(
      addr => addr.toLowerCase() === address.toLowerCase()
    );
  };

  return {
    config,

    async verifyTaskCompletion(task: SignedTaskCompletion): Promise<SignatureVerificationResult> {
      if (!config.requireSignatures) {
        return { valid: true };
      }
      const result = await verifyTaskCompletionSignature(task, options);
      if (result.valid && !checkAllowlist(result.expectedAddress)) {
        return { ...result, valid: false, error: 'Signer not in allowlist' };
      }
      return result;
    },

    async verifyCapabilityAttestation(attestation: SignedCapabilityAttestation): Promise<SignatureVerificationResult> {
      if (!config.requireSignatures) {
        return { valid: true };
      }
      const result = await verifyCapabilityAttestationSignature(attestation, options);
      if (result.valid && !checkAllowlist(result.expectedAddress)) {
        return { ...result, valid: false, error: 'Signer not in allowlist' };
      }
      return result;
    },

    async verifyTrustRelationship(trust: SignedTrustRelationship): Promise<SignatureVerificationResult> {
      if (!config.requireSignatures) {
        return { valid: true };
      }
      const result = await verifyTrustRelationshipSignature(trust, options);
      if (result.valid && !checkAllowlist(result.expectedAddress)) {
        return { ...result, valid: false, error: 'Signer not in allowlist' };
      }
      return result;
    },
  };
}

// Helper to create typed data for signing (client-side use)
export function createTaskCompletionTypedData(
  task: Omit<SignedTaskCompletion, 'signature'>,
  chainId?: number
) {
  return {
    domain: chainId ? { ...EIP712_DOMAIN, chainId } : EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'TaskCompletion' as const,
    message: {
      providerGlobalId: task.providerGlobalId,
      clientGlobalId: task.clientGlobalId,
      taskType: task.taskType,
      qualityScore: task.qualityScore,
      paymentAmount: BigInt(Math.floor(task.paymentAmount * 1e6)),
      paymentCurrency: task.paymentCurrency,
      timestamp: BigInt(task.timestamp),
    },
  };
}

export function createCapabilityAttestationTypedData(
  attestation: Omit<SignedCapabilityAttestation, 'signature'>,
  chainId?: number
) {
  return {
    domain: chainId ? { ...EIP712_DOMAIN, chainId } : EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'CapabilityAttestation' as const,
    message: {
      agentGlobalId: attestation.agentGlobalId,
      capability: attestation.capability,
      attestorGlobalId: attestation.attestorGlobalId,
      confidence: attestation.confidence,
      timestamp: BigInt(attestation.timestamp),
    },
  };
}

export function createTrustRelationshipTypedData(
  trust: Omit<SignedTrustRelationship, 'signature'>,
  chainId?: number
) {
  return {
    domain: chainId ? { ...EIP712_DOMAIN, chainId } : EIP712_DOMAIN,
    types: EIP712_TYPES,
    primaryType: 'TrustRelationship' as const,
    message: {
      trustorGlobalId: trust.trustorGlobalId,
      trusteeGlobalId: trust.trusteeGlobalId,
      trustLevel: trust.trustLevel,
      trustType: trust.trustType,
      timestamp: BigInt(trust.timestamp),
    },
  };
}

// Hash typed data for use in comparison or logging
export function hashTaskCompletion(task: Omit<SignedTaskCompletion, 'signature'>, chainId?: number): `0x${string}` {
  const typedData = createTaskCompletionTypedData(task, chainId);
  return hashTypedData(typedData);
}

export function hashCapabilityAttestation(
  attestation: Omit<SignedCapabilityAttestation, 'signature'>,
  chainId?: number
): `0x${string}` {
  const typedData = createCapabilityAttestationTypedData(attestation, chainId);
  return hashTypedData(typedData);
}

export function hashTrustRelationship(
  trust: Omit<SignedTrustRelationship, 'signature'>,
  chainId?: number
): `0x${string}` {
  const typedData = createTrustRelationshipTypedData(trust, chainId);
  return hashTypedData(typedData);
}
