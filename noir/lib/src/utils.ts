import * as crypto from 'crypto';

/**
 * Poseidon2 hash implementation
 * Note: This is a placeholder. In production, use a proper Poseidon2 implementation
 * that matches the Noir circuit's hash function.
 */
export function poseidon2Hash(inputs: bigint[]): bigint {
  // Placeholder using SHA256 - replace with actual Poseidon2
  // In production, use @aztec/bb.js or similar for Poseidon2
  const buffer = Buffer.alloc(inputs.length * 32);
  inputs.forEach((input, i) => {
    const hex = input.toString(16).padStart(64, '0');
    Buffer.from(hex, 'hex').copy(buffer, i * 32);
  });

  const hash = crypto.createHash('sha256').update(buffer).digest();
  return BigInt('0x' + hash.toString('hex'));
}

/**
 * Generate a cryptographically secure random blinding factor
 */
export function generateBlinding(): bigint {
  const bytes = crypto.randomBytes(32);
  return BigInt('0x' + bytes.toString('hex'));
}

/**
 * Convert a bigint field element to hex string for Noir TOML
 */
export function fieldToHex(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

/**
 * Convert a bigint to 32-byte array
 */
export function fieldToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

/**
 * Convert 32-byte array to bigint
 */
export function bytesToField(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error('Expected 32 bytes');
  }
  return BigInt('0x' + Buffer.from(bytes).toString('hex'));
}

/**
 * Convert Solana PublicKey to field element
 */
export function pubkeyToField(pubkey: Uint8Array): bigint {
  if (pubkey.length !== 32) {
    throw new Error('Invalid pubkey length');
  }
  return bytesToField(pubkey);
}

/**
 * Convert field element to Solana-compatible bytes
 */
export function fieldToPubkeyBytes(field: bigint): Uint8Array {
  return fieldToBytes(field);
}
