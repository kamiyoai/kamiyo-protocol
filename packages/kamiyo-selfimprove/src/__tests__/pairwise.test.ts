import { describe, expect, it } from 'vitest';
import { fitBradleyTerry, updateElo } from '../pairwise';

describe('variants/pairwise/elo', () => {
  it('winner gains rating, loser loses equal amount', () => {
    const { newA, newB } = updateElo(1500, 1500, 1, 32);
    expect(newA).toBeCloseTo(1516, 2);
    expect(newB).toBeCloseTo(1484, 2);
    expect(newA + newB).toBeCloseTo(3000, 2);
  });

  it('expected winner beating underdog gets small delta', () => {
    const { newA: highWins } = updateElo(1800, 1200, 1, 32);
    const { newA: highLoses } = updateElo(1800, 1200, 0, 32);
    expect(highWins - 1800).toBeLessThan(5);
    expect(1800 - highLoses).toBeGreaterThan(27);
  });

  it('tie adjusts rating toward expected', () => {
    const { newA, newB } = updateElo(1600, 1400, 0.5, 32);
    expect(newA).toBeLessThan(1600);
    expect(newB).toBeGreaterThan(1400);
  });
});

describe('variants/pairwise/bradley-terry', () => {
  it('dominant winner ranks highest', () => {
    const matches = [
      { a: 'x', b: 'y', winner: 'a' as const },
      { a: 'x', b: 'y', winner: 'a' as const },
      { a: 'x', b: 'y', winner: 'a' as const },
      { a: 'x', b: 'y', winner: 'a' as const },
      { a: 'x', b: 'z', winner: 'a' as const },
      { a: 'x', b: 'z', winner: 'a' as const },
      { a: 'y', b: 'z', winner: 'a' as const },
    ];
    const skill = fitBradleyTerry(matches, { iterations: 500 });
    expect(skill.x).toBeGreaterThan(skill.y);
    expect(skill.y).toBeGreaterThan(skill.z);
  });

  it('returns unit skill when insufficient matches', () => {
    const skill = fitBradleyTerry([]);
    expect(skill).toEqual({});
  });

  it('treats tie as half-win each', () => {
    const matches = [
      { a: 'p', b: 'q', winner: 'tie' as const },
      { a: 'p', b: 'q', winner: 'tie' as const },
    ];
    const skill = fitBradleyTerry(matches, { iterations: 500 });
    expect(skill.p).toBeCloseTo(skill.q, 3);
  });
});
