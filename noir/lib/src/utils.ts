import * as crypto from 'crypto';

// Placeholder - replace with actual Poseidon2 from @aztec/bb.js in production
export function poseidon2Hash(inputs: bigint[]): bigint {
  const buffer = Buffer.alloc(inputs.length * 32);
  inputs.forEach((input, i) => {
    const hex = input.toString(16).padStart(64, '0');
    Buffer.from(hex, 'hex').copy(buffer, i * 32);
  });

  const hash = crypto.createHash('sha256').update(buffer).digest();
  return BigInt('0x' + hash.toString('hex'));
}

export function generateBlinding(): bigint {
  const bytes = crypto.randomBytes(32);
  return BigInt('0x' + bytes.toString('hex'));
}

export function fieldToHex(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

export function fieldToBytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, '0');
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

export function bytesToField(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error('Expected 32 bytes');
  }
  return BigInt('0x' + Buffer.from(bytes).toString('hex'));
}

export function pubkeyToField(pubkey: Uint8Array): bigint {
  if (pubkey.length !== 32) {
    throw new Error('Invalid pubkey length');
  }
  return bytesToField(pubkey);
}

export function fieldToPubkeyBytes(field: bigint): Uint8Array {
  return fieldToBytes(field);
}
