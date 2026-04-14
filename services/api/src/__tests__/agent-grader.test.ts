import { describe, expect, it } from 'vitest';
import { parseScore } from '../agent-grader';

describe('agent-grader.parseScore', () => {
  it('parses well-formed JSON response', () => {
    const result = parseScore('{"score": 0.8, "rationale": "solid work"}');
    expect(result).toEqual({ score: 0.8, rationale: 'solid work' });
  });

  it('extracts JSON embedded in prose', () => {
    const result = parseScore('Analysis complete.\n\n{"score": 0.42, "rationale": "partial"}\n\nDone.');
    expect(result?.score).toBeCloseTo(0.42);
  });

  it('clamps score to [0, 1]', () => {
    expect(parseScore('{"score": 1.7}')?.score).toBe(1);
    expect(parseScore('{"score": -0.3}')?.score).toBe(0);
  });

  it('returns null on malformed output', () => {
    expect(parseScore('not json')).toBeNull();
    expect(parseScore('{"score": "high"}')).toBeNull();
  });

  it('accepts quality_score alias', () => {
    expect(parseScore('{"quality_score": 0.55}')?.score).toBeCloseTo(0.55);
  });
});
