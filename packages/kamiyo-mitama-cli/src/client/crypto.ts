import { buildPoseidon } from 'circomlibjs';
import { randomBytes } from 'crypto';

// BN254 field modulus
const FIELD_MODULUS = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon(inputs.map((i) => i % FIELD_MODULUS));
  return poseidon.F.toObject(hash);
}

export function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

export function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

export function generateRandomBytes(length: number = 32): Uint8Array {
  return new Uint8Array(randomBytes(length));
}

export async function generateIdentityCommitment(
  ownerSecret: Uint8Array,
  agentId: Uint8Array,
  registrationSecret: Uint8Array
): Promise<Uint8Array> {
  const hash = await poseidonHash([
    bytesToBigint(ownerSecret),
    bytesToBigint(agentId),
    bytesToBigint(registrationSecret),
  ]);
  return bigintToBytes32(hash);
}

export async function generateNullifier(
  agentId: Uint8Array,
  registrationSecret: Uint8Array,
  epoch: bigint
): Promise<Uint8Array> {
  const hash = await poseidonHash([
    bytesToBigint(agentId),
    bytesToBigint(registrationSecret),
    epoch,
  ]);
  return bigintToBytes32(hash);
}

export async function generateActionHash(
  actionType: number,
  actionData: string
): Promise<Uint8Array> {
  const dataBytes = new TextEncoder().encode(actionData);
  const paddedData = new Uint8Array(32);
  paddedData.set(dataBytes.slice(0, 31));

  const dataHash = await poseidonHash([bytesToBigint(paddedData)]);
  const hash = await poseidonHash([BigInt(actionType), dataHash]);
  return bigintToBytes32(hash);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
