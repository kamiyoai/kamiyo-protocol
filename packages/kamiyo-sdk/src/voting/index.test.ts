import { PublicKey } from '@solana/web3.js';
import { Voting, Vote, serializeVote, deserializeVote, voteInstruction } from './index';

describe('Voting', () => {
  let voting: Voting;
  const voter = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

  beforeEach(() => {
    voting = new Voting();
  });

  describe('create', () => {
    it('creates proposal with correct timing', () => {
      const before = Math.floor(Date.now() / 1000);
      const p = voting.create(1n, ['Yes', 'No'], 300, 300);
      const after = Math.floor(Date.now() / 1000);

      expect(p.id).toBe(1n);
      expect(p.options).toEqual(['Yes', 'No']);
      expect(p.commitEnd).toBeGreaterThanOrEqual(before + 300);
      expect(p.commitEnd).toBeLessThanOrEqual(after + 300);
      expect(p.revealEnd).toBe(p.commitEnd + 300);
      expect(p.commitments.size).toBe(0);
      expect(p.votes.length).toBe(0);
    });
  });

  describe('get', () => {
    it('returns undefined for nonexistent proposal', () => {
      expect(voting.get(999n)).toBeUndefined();
    });

    it('returns created proposal', () => {
      const p = voting.create(1n, ['A', 'B'], 300, 300);
      expect(voting.get(1n)).toBe(p);
    });
  });

  describe('phase', () => {
    it('returns commit during commit phase', () => {
      const p = voting.create(1n, ['A', 'B'], 300, 300);
      expect(voting.phase(p)).toBe('commit');
    });

    it('returns reveal after commit ends', () => {
      const now = Math.floor(Date.now() / 1000);
      const p = voting.create(1n, ['A', 'B'], -100, 300); // commit already ended
      expect(voting.phase(p)).toBe('reveal');
    });

    it('returns tally after reveal ends', () => {
      const p = voting.create(1n, ['A', 'B'], -200, -100); // both ended
      expect(voting.phase(p)).toBe('tally');
    });
  });

  describe('vote', () => {
    it('creates vote with commitment', () => {
      const { vote, commitment } = voting.vote(1n, 0, voter);
      expect(vote.choice).toBe(0);
      expect(vote.proposal).toBe(1n);
      expect(typeof vote.blinding).toBe('bigint');
      expect(vote.blinding).toBeGreaterThan(0n);
      expect(typeof commitment).toBe('bigint');
    });

    it('produces different blindings each time', () => {
      const v1 = voting.vote(1n, 0, voter);
      const v2 = voting.vote(1n, 0, voter);
      expect(v1.vote.blinding).not.toBe(v2.vote.blinding);
    });
  });

  describe('commit', () => {
    it('accepts commitment during commit phase', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      const { vote, commitment } = voting.vote(1n, 0, voter);
      expect(voting.commit(1n, vote.voter, commitment)).toBe(true);
    });

    it('rejects commitment for nonexistent proposal', () => {
      const { vote, commitment } = voting.vote(999n, 0, voter);
      expect(voting.commit(999n, vote.voter, commitment)).toBe(false);
    });

    it('rejects duplicate commitment from same voter', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      const { vote, commitment } = voting.vote(1n, 0, voter);
      voting.commit(1n, vote.voter, commitment);
      expect(voting.commit(1n, vote.voter, commitment)).toBe(false);
    });

    it('rejects commitment after commit phase', () => {
      voting.create(1n, ['A', 'B'], -100, 300); // commit ended
      const { vote, commitment } = voting.vote(1n, 0, voter);
      expect(voting.commit(1n, vote.voter, commitment)).toBe(false);
    });
  });

  describe('reveal', () => {
    it('accepts valid reveal during reveal phase', () => {
      voting.create(1n, ['A', 'B'], -100, 300); // in reveal phase
      const { vote, commitment } = voting.vote(1n, 0, voter);
      const p = voting.get(1n)!;
      p.commitments.set(vote.voter.toString(), commitment);

      expect(voting.reveal(1n, vote)).toBe(true);
      expect(p.votes.length).toBe(1);
    });

    it('rejects reveal with wrong commitment', () => {
      voting.create(1n, ['A', 'B'], -100, 300);
      const { vote } = voting.vote(1n, 0, voter);
      const p = voting.get(1n)!;
      p.commitments.set(vote.voter.toString(), 12345n); // wrong commitment

      expect(voting.reveal(1n, vote)).toBe(false);
    });

    it('rejects reveal without prior commitment', () => {
      voting.create(1n, ['A', 'B'], -100, 300);
      const { vote } = voting.vote(1n, 0, voter);
      expect(voting.reveal(1n, vote)).toBe(false);
    });

    it('rejects duplicate reveal from same voter', () => {
      voting.create(1n, ['A', 'B'], -100, 300);
      const { vote, commitment } = voting.vote(1n, 0, voter);
      const p = voting.get(1n)!;
      p.commitments.set(vote.voter.toString(), commitment);
      voting.reveal(1n, vote);

      expect(voting.reveal(1n, vote)).toBe(false);
    });

    it('rejects reveal during commit phase', () => {
      voting.create(1n, ['A', 'B'], 300, 300); // still in commit
      const { vote, commitment } = voting.vote(1n, 0, voter);
      const p = voting.get(1n)!;
      p.commitments.set(vote.voter.toString(), commitment);

      expect(voting.reveal(1n, vote)).toBe(false);
    });
  });

  describe('tally', () => {
    it('returns null before tally phase', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      expect(voting.tally(1n)).toBeNull();
    });

    it('returns null for nonexistent proposal', () => {
      expect(voting.tally(999n)).toBeNull();
    });

    it('counts votes correctly', () => {
      voting.create(1n, ['A', 'B', 'C'], -200, -100); // in tally
      const p = voting.get(1n)!;
      p.votes.push(
        { choice: 0, blinding: 1n, voter: 1n, proposal: 1n },
        { choice: 0, blinding: 2n, voter: 2n, proposal: 1n },
        { choice: 1, blinding: 3n, voter: 3n, proposal: 1n },
        { choice: 2, blinding: 4n, voter: 4n, proposal: 1n },
      );

      const result = voting.tally(1n);
      expect(result).not.toBeNull();
      expect(result!.counts).toEqual([2, 1, 1]);
      expect(result!.winner).toBe(0);
      expect(result!.total).toBe(4);
    });

    it('ignores out-of-range choices', () => {
      voting.create(1n, ['A', 'B'], -200, -100);
      const p = voting.get(1n)!;
      p.votes.push(
        { choice: 0, blinding: 1n, voter: 1n, proposal: 1n },
        { choice: 99, blinding: 2n, voter: 2n, proposal: 1n }, // invalid
      );

      const result = voting.tally(1n);
      expect(result!.counts).toEqual([1, 0]);
      expect(result!.total).toBe(2);
    });
  });

  describe('proverInput', () => {
    it('returns null for nonexistent proposal', () => {
      expect(voting.proverInput(999n)).toBeNull();
    });

    it('returns null for empty votes', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      expect(voting.proverInput(1n)).toBeNull();
    });

    it('returns null for too many votes', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      const p = voting.get(1n)!;
      for (let i = 0; i < 17; i++) {
        p.votes.push({ choice: 0, blinding: BigInt(i), voter: BigInt(i), proposal: 1n });
      }
      expect(voting.proverInput(1n)).toBeNull();
    });

    it('returns padded arrays for prover', () => {
      voting.create(1n, ['A', 'B'], 300, 300);
      const p = voting.get(1n)!;
      p.votes.push(
        { choice: 80, blinding: 111n, voter: 1n, proposal: 1n },
        { choice: 90, blinding: 222n, voter: 2n, proposal: 1n },
      );

      const input = voting.proverInput(1n);
      expect(input).not.toBeNull();
      expect(input!.scores.length).toBe(16);
      expect(input!.scores[0]).toBe(80);
      expect(input!.scores[1]).toBe(90);
      expect(input!.scores[2]).toBe(0); // padded
      expect(input!.numVotes).toBe(2);
      expect(input!.sum).toBe(170);
      expect(typeof input!.root).toBe('bigint');
    });
  });
});

describe('serializeVote/deserializeVote', () => {
  it('roundtrips vote', () => {
    const vote: Vote = {
      choice: 42,
      blinding: 12345678901234567890n,
      voter: 98765432109876543210n,
      proposal: 11111111111111111111n,
    };

    const bytes = serializeVote(vote);
    expect(bytes.length).toBe(97);

    const restored = deserializeVote(bytes);
    expect(restored.choice).toBe(vote.choice);
    expect(restored.blinding).toBe(vote.blinding);
    expect(restored.voter).toBe(vote.voter);
    expect(restored.proposal).toBe(vote.proposal);
  });

  it('handles max choice value', () => {
    const vote: Vote = { choice: 255, blinding: 1n, voter: 2n, proposal: 3n };
    const restored = deserializeVote(serializeVote(vote));
    expect(restored.choice).toBe(255);
  });
});

describe('voteInstruction', () => {
  it('creates valid instruction', () => {
    const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
    const proposal = PublicKey.unique();
    const voter = PublicKey.unique();
    const commitment = 12345n;

    const ix = voteInstruction(programId, proposal, voter, commitment);

    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys.length).toBe(2);
    expect(ix.keys[0].pubkey.equals(proposal)).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[1].pubkey.equals(voter)).toBe(true);
    expect(ix.keys[1].isSigner).toBe(true);
    expect(ix.data[0]).toBe(0x01);
    expect(ix.data.length).toBe(33);
  });
});
