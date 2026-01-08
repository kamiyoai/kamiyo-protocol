import { PublicKey } from '@solana/web3.js';
import { Voting, Vote, serializeVote, deserializeVote, voteInstruction } from './index';

const VOTER = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

describe('Voting', () => {
  let v: Voting;
  beforeEach(() => { v = new Voting(); });

  test('create proposal', () => {
    const before = Math.floor(Date.now() / 1000);
    const p = v.create(1n, ['Yes', 'No'], 300, 300);
    expect(p.id).toBe(1n);
    expect(p.options).toEqual(['Yes', 'No']);
    expect(p.commitEnd).toBeGreaterThanOrEqual(before + 300);
    expect(p.revealEnd).toBe(p.commitEnd + 300);
  });

  test('get', () => {
    expect(v.get(999n)).toBeUndefined();
    const p = v.create(1n, ['A', 'B'], 300, 300);
    expect(v.get(1n)).toBe(p);
  });

  test('phase', () => {
    expect(v.phase(v.create(1n, ['A', 'B'], 300, 300))).toBe('commit');
    expect(v.phase(v.create(2n, ['A', 'B'], -100, 300))).toBe('reveal');
    expect(v.phase(v.create(3n, ['A', 'B'], -200, -100))).toBe('tally');
  });

  test('vote creates commitment', () => {
    const { vote, commitment } = v.vote(1n, 0, VOTER);
    expect(vote.choice).toBe(0);
    expect(vote.proposal).toBe(1n);
    expect(typeof commitment).toBe('bigint');
  });

  test('vote blindings differ', () => {
    const v1 = v.vote(1n, 0, VOTER);
    const v2 = v.vote(1n, 0, VOTER);
    expect(v1.vote.blinding).not.toBe(v2.vote.blinding);
  });

  describe('commit', () => {
    test('accepts during commit phase', () => {
      v.create(1n, ['A', 'B'], 300, 300);
      const { vote, commitment } = v.vote(1n, 0, VOTER);
      expect(v.commit(1n, vote.voter, commitment)).toBe(true);
    });

    test('rejects nonexistent', () => {
      const { vote, commitment } = v.vote(999n, 0, VOTER);
      expect(v.commit(999n, vote.voter, commitment)).toBe(false);
    });

    test('rejects duplicate', () => {
      v.create(1n, ['A', 'B'], 300, 300);
      const { vote, commitment } = v.vote(1n, 0, VOTER);
      v.commit(1n, vote.voter, commitment);
      expect(v.commit(1n, vote.voter, commitment)).toBe(false);
    });

    test('rejects after commit phase', () => {
      v.create(1n, ['A', 'B'], -100, 300);
      const { vote, commitment } = v.vote(1n, 0, VOTER);
      expect(v.commit(1n, vote.voter, commitment)).toBe(false);
    });
  });

  describe('reveal', () => {
    test('accepts valid', () => {
      v.create(1n, ['A', 'B'], -100, 300);
      const { vote, commitment } = v.vote(1n, 0, VOTER);
      v.get(1n)!.commitments.set(vote.voter.toString(), commitment);
      expect(v.reveal(1n, vote)).toBe(true);
    });

    test('rejects wrong commitment', () => {
      v.create(1n, ['A', 'B'], -100, 300);
      const { vote } = v.vote(1n, 0, VOTER);
      v.get(1n)!.commitments.set(vote.voter.toString(), 12345n);
      expect(v.reveal(1n, vote)).toBe(false);
    });

    test('rejects no prior commit', () => {
      v.create(1n, ['A', 'B'], -100, 300);
      expect(v.reveal(1n, v.vote(1n, 0, VOTER).vote)).toBe(false);
    });

    test('rejects during commit phase', () => {
      v.create(1n, ['A', 'B'], 300, 300);
      const { vote, commitment } = v.vote(1n, 0, VOTER);
      v.get(1n)!.commitments.set(vote.voter.toString(), commitment);
      expect(v.reveal(1n, vote)).toBe(false);
    });
  });

  describe('tally', () => {
    test('null before tally phase', () => {
      v.create(1n, ['A', 'B'], 300, 300);
      expect(v.tally(1n)).toBeNull();
    });

    test('counts votes', () => {
      v.create(1n, ['A', 'B', 'C'], -200, -100);
      const p = v.get(1n)!;
      p.votes.push(
        { choice: 0, blinding: 1n, voter: 1n, proposal: 1n },
        { choice: 0, blinding: 2n, voter: 2n, proposal: 1n },
        { choice: 1, blinding: 3n, voter: 3n, proposal: 1n },
      );
      const r = v.tally(1n)!;
      expect(r.counts).toEqual([2, 1, 0]);
      expect(r.winner).toBe(0);
    });

    test('ignores invalid choices', () => {
      v.create(1n, ['A', 'B'], -200, -100);
      v.get(1n)!.votes.push(
        { choice: 0, blinding: 1n, voter: 1n, proposal: 1n },
        { choice: 99, blinding: 2n, voter: 2n, proposal: 1n },
      );
      expect(v.tally(1n)!.counts).toEqual([1, 0]);
    });
  });

  describe('proverInput', () => {
    test('null for empty/invalid', () => {
      expect(v.proverInput(999n)).toBeNull();
      v.create(1n, ['A', 'B'], 300, 300);
      expect(v.proverInput(1n)).toBeNull();
    });

    test('null for >16 votes', () => {
      v.create(1n, ['A'], 300, 300);
      const p = v.get(1n)!;
      for (let i = 0; i < 17; i++) p.votes.push({ choice: 0, blinding: BigInt(i), voter: BigInt(i), proposal: 1n });
      expect(v.proverInput(1n)).toBeNull();
    });

    test('pads to 16', () => {
      v.create(1n, ['A', 'B'], 300, 300);
      v.get(1n)!.votes.push(
        { choice: 80, blinding: 1n, voter: 1n, proposal: 1n },
        { choice: 90, blinding: 2n, voter: 2n, proposal: 1n },
      );
      const input = v.proverInput(1n)!;
      expect(input.scores.length).toBe(16);
      expect(input.scores.slice(0, 3)).toEqual([80, 90, 0]);
      expect(input.sum).toBe(170);
    });
  });
});

describe('serializeVote/deserializeVote', () => {
  test('roundtrip', () => {
    const vote: Vote = { choice: 42, blinding: 123n, voter: 456n, proposal: 789n };
    const r = deserializeVote(serializeVote(vote));
    expect(r).toEqual(vote);
  });

  test('max choice', () => {
    const vote: Vote = { choice: 255, blinding: 1n, voter: 2n, proposal: 3n };
    expect(deserializeVote(serializeVote(vote)).choice).toBe(255);
  });
});

describe('voteInstruction', () => {
  test('builds ix', () => {
    const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
    const proposal = PublicKey.unique();
    const voter = PublicKey.unique();
    const ix = voteInstruction(programId, proposal, voter, 12345n);

    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys[0].pubkey.equals(proposal)).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[1].isSigner).toBe(true);
    expect(ix.data[0]).toBe(0x01);
  });
});
