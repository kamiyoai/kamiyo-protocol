import { Keypair, PublicKey } from '@solana/web3.js';
import { createHash, randomBytes } from 'crypto';
import { Credential, serialize, deserialize } from './index';
import { bytesToField, fieldToBytes } from '../utils';

export interface SignedCredential extends Credential {
  signature: Uint8Array;
  issuer: PublicKey;
  nonce: bigint;
}

export class CredentialManager {
  private issued = new Map<string, SignedCredential>();
  private revoked = new Set<string>();

  constructor(private issuer: Keypair) {}

  issue(cred: Credential): SignedCredential {
    const nonce = BigInt('0x' + randomBytes(16).toString('hex'));
    const data = this.credData(cred, nonce);
    const signed: SignedCredential = { ...cred, signature: this.sign(data), issuer: this.issuer.publicKey, nonce };
    this.issued.set(this.id(signed), signed);
    return signed;
  }

  revoke(cred: SignedCredential): boolean {
    const id = this.id(cred);
    if (!this.issued.has(id)) return false;
    this.revoked.add(id);
    return true;
  }

  isRevoked(cred: SignedCredential): boolean {
    return this.revoked.has(this.id(cred));
  }

  verify(cred: SignedCredential): { valid: boolean; reason?: string } {
    if (this.revoked.has(this.id(cred))) return { valid: false, reason: 'revoked' };
    if (Math.floor(Date.now() / 1000) >= cred.expiresAt) return { valid: false, reason: 'expired' };
    if (!this.verifySig(this.credData(cred, cred.nonce), cred.signature, cred.issuer)) return { valid: false, reason: 'invalid signature' };
    return { valid: true };
  }

  refresh(cred: SignedCredential, newTtl?: number): SignedCredential | null {
    const v = this.verify(cred);
    if (!v.valid && v.reason !== 'expired') return null;
    const origTtl = cred.expiresAt - cred.issuedAt;
    const ttl = newTtl || (origTtl > 0 ? origTtl : 86400);
    const now = Math.floor(Date.now() / 1000);
    return this.issue({ agentPk: cred.agentPk, repCommitment: cred.repCommitment, blacklistRoot: cred.blacklistRoot, issuedAt: now, expiresAt: now + ttl });
  }

  getIssued(): SignedCredential[] {
    return Array.from(this.issued.values()).filter(c => !this.isRevoked(c));
  }

  getRevoked(): string[] {
    return Array.from(this.revoked);
  }

  private credData(cred: Credential, nonce: bigint): Buffer {
    return Buffer.concat([Buffer.from(serialize(cred)), Buffer.from(fieldToBytes(nonce))]);
  }

  private id(cred: SignedCredential): string {
    return createHash('sha256').update(fieldToBytes(cred.agentPk)).update(fieldToBytes(cred.nonce)).digest('hex');
  }

  private sign(data: Buffer): Uint8Array {
    const { sign } = require('tweetnacl');
    return sign.detached(createHash('sha256').update(data).digest(), this.issuer.secretKey);
  }

  private verifySig(data: Buffer, sig: Uint8Array, pk: PublicKey): boolean {
    const { sign } = require('tweetnacl');
    return sign.detached.verify(createHash('sha256').update(data).digest(), sig, pk.toBytes());
  }
}

export function serializeSigned(cred: SignedCredential): Uint8Array {
  const buf = Buffer.alloc(232);
  buf.set(serialize(cred), 0);
  buf.set(cred.signature, 104);
  buf.set(cred.issuer.toBytes(), 168);
  buf.set(fieldToBytes(cred.nonce), 200);
  return new Uint8Array(buf);
}

export function deserializeSigned(data: Uint8Array): SignedCredential {
  if (data.length !== 232) throw new Error('invalid signed credential length');
  return {
    ...deserialize(data.slice(0, 104)),
    signature: data.slice(104, 168),
    issuer: new PublicKey(data.slice(168, 200)),
    nonce: bytesToField(data.slice(200, 232)),
  };
}
