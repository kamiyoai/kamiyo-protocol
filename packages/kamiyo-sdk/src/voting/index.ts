import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { poseidon2Hash, generateBlinding, bytesToField, fieldToBytes } from '../utils';

const MAX_VOTES = 16;

export interface Vote {
  choice: number;
  blinding: bigint;
  voter: bigint;
  proposal: bigint;
}

export interface Proposal {
  id: bigint;
  options: string[];
  commitEnd: number;
  revealEnd: number;
  commitments: Map<string, bigint>; // voter -> commitment
  votes: Vote[];
}

export class Voting {
  private proposals = new Map<string, Proposal>();

  create(id: bigint, options: string[], commitSec: number, revealSec: number): Proposal {
    const now = Math.floor(Date.now() / 1000);
    const p: Proposal = {
      id,
      options,
      commitEnd: now + commitSec,
      revealEnd: now + commitSec + revealSec,
      commitments: new Map(),
      votes: [],
    };
    this.proposals.set(id.toString(), p);
    return p;
  }

  get(id: bigint): Proposal | undefined {
    return this.proposals.get(id.toString());
  }

  phase(p: Proposal): 'commit' | 'reveal' | 'tally' {
    const now = Math.floor(Date.now() / 1000);
    if (now < p.commitEnd) return 'commit';
    if (now < p.revealEnd) return 'reveal';
    return 'tally';
  }

  vote(proposalId: bigint, choice: number, voter: PublicKey): { vote: Vote; commitment: bigint } {
    const v: Vote = {
      choice,
      blinding: generateBlinding(),
      voter: bytesToField(voter.toBytes()),
      proposal: proposalId,
    };
    return { vote: v, commitment: this.hash(v) };
  }

  commit(proposalId: bigint, voter: bigint, commitment: bigint): boolean {
    const p = this.get(proposalId);
    if (!p || this.phase(p) !== 'commit') return false;
    if (p.commitments.has(voter.toString())) return false;
    p.commitments.set(voter.toString(), commitment);
    return true;
  }

  reveal(proposalId: bigint, vote: Vote): boolean {
    const p = this.get(proposalId);
    if (!p || this.phase(p) !== 'reveal') return false;

    const expected = p.commitments.get(vote.voter.toString());
    if (!expected || expected !== this.hash(vote)) return false;
    if (p.votes.some(v => v.voter === vote.voter)) return false;

    p.votes.push(vote);
    return true;
  }

  tally(proposalId: bigint): { counts: number[]; winner: number; total: number } | null {
    const p = this.get(proposalId);
    if (!p || this.phase(p) !== 'tally') return null;

    const counts = new Array(p.options.length).fill(0);
    for (const v of p.votes) {
      if (v.choice >= 0 && v.choice < counts.length) counts[v.choice]++;
    }
    return { counts, winner: counts.indexOf(Math.max(...counts)), total: p.votes.length };
  }

  proverInput(proposalId: bigint) {
    const p = this.get(proposalId);
    if (!p || p.votes.length === 0 || p.votes.length > MAX_VOTES) return null;

    const scores = new Array(MAX_VOTES).fill(0);
    const blindings = new Array<bigint>(MAX_VOTES).fill(0n);
    const voters = new Array<bigint>(MAX_VOTES).fill(0n);
    let sum = 0;

    for (let i = 0; i < p.votes.length; i++) {
      scores[i] = p.votes[i].choice;
      blindings[i] = p.votes[i].blinding;
      voters[i] = p.votes[i].voter;
      sum += scores[i];
    }

    const root = this.merkleRoot(p.votes.map(v => this.hash(v)));
    return { scores, blindings, voters, numVotes: p.votes.length, proposalId, root, sum };
  }

  private hash(v: Vote): bigint {
    return poseidon2Hash([BigInt(v.choice), v.blinding, v.proposal, v.voter]);
  }

  private merkleRoot(leaves: bigint[]): bigint {
    const padded = [...leaves];
    while (padded.length < MAX_VOTES) padded.push(0n);

    let layer = padded;
    while (layer.length > 1) {
      const next: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(poseidon2Hash([layer[i], layer[i + 1] ?? 0n]));
      }
      layer = next;
    }
    return layer[0];
  }
}

export function serializeVote(v: Vote): Uint8Array {
  const buf = Buffer.alloc(97);
  buf.writeUInt8(v.choice, 0);
  buf.set(fieldToBytes(v.blinding), 1);
  buf.set(fieldToBytes(v.voter), 33);
  buf.set(fieldToBytes(v.proposal), 65);
  return new Uint8Array(buf);
}

export function deserializeVote(data: Uint8Array): Vote {
  const buf = Buffer.from(data);
  return {
    choice: buf.readUInt8(0),
    blinding: bytesToField(new Uint8Array(buf.subarray(1, 33))),
    voter: bytesToField(new Uint8Array(buf.subarray(33, 65))),
    proposal: bytesToField(new Uint8Array(buf.subarray(65, 97))),
  };
}

export function voteInstruction(programId: PublicKey, proposal: PublicKey, voter: PublicKey, commitment: bigint): TransactionInstruction {
  const data = Buffer.alloc(33);
  data.writeUInt8(0x01, 0);
  data.set(fieldToBytes(commitment), 1);
  return new TransactionInstruction({
    keys: [{ pubkey: proposal, isSigner: false, isWritable: true }, { pubkey: voter, isSigner: true, isWritable: false }],
    programId,
    data,
  });
}
