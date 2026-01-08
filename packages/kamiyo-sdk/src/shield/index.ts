import { PublicKey, Connection } from '@solana/web3.js';
import { poseidon2Hash, generateBlinding, bytesToField, fieldToBytes } from '../utils';

const SMT_DEPTH = 256;

export interface Credential {
  agentPk: bigint;
  repCommitment: bigint;
  blacklistRoot: bigint;
  issuedAt: number;
  expiresAt: number;
}

export interface RepData {
  successful: number;
  total: number;
  disputesWon: number;
  disputesLost: number;
}

export interface SmtProof {
  root: bigint;
  key: bigint;
  siblings: bigint[];
}

export interface ShieldProof {
  reputation: {
    commitment: bigint;
    threshold: number;
    meets: boolean;
    proverInput: any;
  };
  exclusion: SmtProof | null;
}

export class Shield {
  private readonly agentPk: bigint;
  private readonly blinding: bigint;
  private rep: RepData | null = null;
  private cred: Credential | null = null;

  constructor(agent: PublicKey) {
    this.agentPk = bytesToField(agent.toBytes());
    this.blinding = generateBlinding();
  }

  setRep(data: RepData): void {
    this.rep = data;
  }

  successRate(): number {
    if (!this.rep || this.rep.total === 0) return 0;
    return Math.floor((this.rep.successful * 100) / this.rep.total);
  }

  meetsThreshold(t: number): boolean {
    return this.successRate() >= t;
  }

  commitment(): bigint {
    if (!this.rep) throw new Error('no rep data');
    return poseidon2Hash([
      this.agentPk,
      BigInt(this.rep.successful),
      BigInt(this.rep.total),
      BigInt(this.rep.disputesWon),
      BigInt(this.rep.disputesLost),
      this.blinding,
    ]);
  }

  issue(blacklistRoot: bigint, ttl = 86400): Credential {
    if (!this.rep) throw new Error('no rep data');
    const now = Math.floor(Date.now() / 1000);
    this.cred = {
      agentPk: this.agentPk,
      repCommitment: this.commitment(),
      blacklistRoot,
      issuedAt: now,
      expiresAt: now + ttl,
    };
    return this.cred;
  }

  credential(): Credential | null {
    return this.cred;
  }

  valid(): boolean {
    return !!this.cred && Math.floor(Date.now() / 1000) < this.cred.expiresAt;
  }

  proverInput(threshold: number) {
    if (!this.rep) return null;
    return { ...this.rep, blinding: this.blinding, agentPk: this.agentPk, threshold };
  }

  prove(threshold: number, smtProof?: SmtProof): ShieldProof {
    const meets = this.meetsThreshold(threshold);
    return {
      reputation: {
        commitment: this.rep ? this.commitment() : 0n,
        threshold,
        meets,
        proverInput: this.proverInput(threshold),
      },
      exclusion: smtProof || null,
    };
  }

  static emptySmtSiblings(): bigint[] {
    const siblings: bigint[] = [];
    let hash = 0n;
    for (let i = 0; i < SMT_DEPTH; i++) {
      siblings.push(hash);
      hash = poseidon2Hash([hash, hash]);
    }
    return siblings;
  }

  static emptySmtRoot(): bigint {
    let hash = 0n;
    for (let i = 0; i < SMT_DEPTH; i++) {
      hash = poseidon2Hash([hash, hash]);
    }
    return hash;
  }

  static exclusionProof(root: bigint, agentPk: bigint, siblings: bigint[]): SmtProof {
    return { root, key: agentPk, siblings };
  }

  static async fetch(connection: Connection, agent: PublicKey, programId: PublicKey): Promise<Shield> {
    const shield = new Shield(agent);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('reputation'), agent.toBytes()], programId);
    const info = await connection.getAccountInfo(pda);
    if (info?.data) {
      const d = info.data;
      shield.setRep({
        successful: Number(d.readBigUInt64LE(0)),
        total: Number(d.readBigUInt64LE(8)),
        disputesWon: Number(d.readBigUInt64LE(16)),
        disputesLost: Number(d.readBigUInt64LE(24)),
      });
    }
    return shield;
  }
}

export function verifyCredential(c: Credential, expectedRoot: bigint): boolean {
  return Math.floor(Date.now() / 1000) < c.expiresAt && c.blacklistRoot === expectedRoot;
}

export function serialize(c: Credential): Uint8Array {
  const buf = Buffer.alloc(104);
  buf.set(fieldToBytes(c.agentPk), 0);
  buf.set(fieldToBytes(c.repCommitment), 32);
  buf.set(fieldToBytes(c.blacklistRoot), 64);
  buf.writeUInt32LE(c.issuedAt, 96);
  buf.writeUInt32LE(c.expiresAt, 100);
  return new Uint8Array(buf);
}

export function deserialize(data: Uint8Array): Credential {
  if (data.length !== 104) throw new Error('invalid length');
  const buf = Buffer.from(data);
  return {
    agentPk: bytesToField(new Uint8Array(buf.subarray(0, 32))),
    repCommitment: bytesToField(new Uint8Array(buf.subarray(32, 64))),
    blacklistRoot: bytesToField(new Uint8Array(buf.subarray(64, 96))),
    issuedAt: buf.readUInt32LE(96),
    expiresAt: buf.readUInt32LE(100),
  };
}
