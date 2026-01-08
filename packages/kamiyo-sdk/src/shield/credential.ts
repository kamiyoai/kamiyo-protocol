import { Keypair, PublicKey } from '@solana/web3.js';
import { createHash, randomBytes } from 'crypto';
import { Credential, serialize, deserialize } from './index';
import { bytesToField, fieldToBytes } from '../utils';

export interface SignedCredential extends Credential {
  signature: Uint8Array;
  issuer: PublicKey;
  nonce: bigint;
}

export interface CredentialRequest {
  agent: PublicKey;
  threshold: number;
  blacklistRoot: bigint;
  ttl?: number;
}

export class CredentialManager {
  private readonly issuer: Keypair;
  private issued = new Map<string, SignedCredential>();
  private revoked = new Set<string>();

  constructor(issuer: Keypair) {
    this.issuer = issuer;
  }

  issue(cred: Credential): SignedCredential {
    const nonce = BigInt('0x' + randomBytes(16).toString('hex'));
    const data = this.credentialData(cred, nonce);
    const signature = this.sign(data);

    const signed: SignedCredential = {
      ...cred,
      signature,
      issuer: this.issuer.publicKey,
      nonce,
    };

    const id = this.credentialId(signed);
    this.issued.set(id, signed);

    return signed;
  }

  revoke(cred: SignedCredential): boolean {
    const id = this.credentialId(cred);
    if (!this.issued.has(id)) return false;
    this.revoked.add(id);
    return true;
  }

  isRevoked(cred: SignedCredential): boolean {
    return this.revoked.has(this.credentialId(cred));
  }

  verify(cred: SignedCredential): { valid: boolean; reason?: string } {
    const id = this.credentialId(cred);

    if (this.revoked.has(id)) {
      return { valid: false, reason: 'revoked' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= cred.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    const data = this.credentialData(cred, cred.nonce);
    if (!this.verifySignature(data, cred.signature, cred.issuer)) {
      return { valid: false, reason: 'invalid signature' };
    }

    return { valid: true };
  }

  refresh(cred: SignedCredential, newTtl?: number): SignedCredential | null {
    const v = this.verify(cred);
    if (!v.valid && v.reason !== 'expired') return null;

    const originalTtl = cred.expiresAt - cred.issuedAt;
    const ttl = newTtl || (originalTtl > 0 ? originalTtl : 86400); // default 24h if original was invalid
    const now = Math.floor(Date.now() / 1000);

    return this.issue({
      agentPk: cred.agentPk,
      repCommitment: cred.repCommitment,
      blacklistRoot: cred.blacklistRoot,
      issuedAt: now,
      expiresAt: now + ttl,
    });
  }

  getIssued(): SignedCredential[] {
    return Array.from(this.issued.values()).filter(c => !this.isRevoked(c));
  }

  getRevoked(): string[] {
    return Array.from(this.revoked);
  }

  private credentialData(cred: Credential, nonce: bigint): Buffer {
    const base = serialize(cred);
    const nonceBuf = fieldToBytes(nonce);
    return Buffer.concat([Buffer.from(base), Buffer.from(nonceBuf)]);
  }

  private credentialId(cred: SignedCredential): string {
    return createHash('sha256')
      .update(fieldToBytes(cred.agentPk))
      .update(fieldToBytes(cred.nonce))
      .digest('hex');
  }

  private sign(data: Buffer): Uint8Array {
    const hash = createHash('sha256').update(data).digest();
    // Ed25519 sign via nacl (keypair.secretKey contains full 64-byte key)
    const { sign } = require('tweetnacl');
    return sign.detached(hash, this.issuer.secretKey);
  }

  private verifySignature(data: Buffer, signature: Uint8Array, issuer: PublicKey): boolean {
    const hash = createHash('sha256').update(data).digest();
    const { sign } = require('tweetnacl');
    return sign.detached.verify(hash, signature, issuer.toBytes());
  }
}

export function serializeSigned(cred: SignedCredential): Uint8Array {
  const base = serialize(cred);
  const buf = Buffer.alloc(base.length + 64 + 32 + 32); // base + sig + issuer + nonce
  buf.set(base, 0);
  buf.set(cred.signature, 104);
  buf.set(cred.issuer.toBytes(), 168);
  buf.set(fieldToBytes(cred.nonce), 200);
  return new Uint8Array(buf);
}

export function deserializeSigned(data: Uint8Array): SignedCredential {
  if (data.length !== 232) throw new Error('invalid signed credential length');
  const base = deserialize(data.slice(0, 104));
  return {
    ...base,
    signature: data.slice(104, 168),
    issuer: new PublicKey(data.slice(168, 200)),
    nonce: bytesToField(data.slice(200, 232)),
  };
}
