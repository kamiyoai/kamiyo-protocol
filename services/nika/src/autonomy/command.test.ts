import { describe, expect, it } from 'vitest';
import { parseAutonomyCommand } from './command';

describe('parseAutonomyCommand', () => {
  it('matches command with mention prefix', () => {
    const parsed = parseAutonomyCommand('@nika_entity /autonomy summarize this thread', 'nika_entity', '/autonomy');
    expect(parsed).toEqual({
      matched: true,
      objective: 'summarize this thread',
    });
  });

  it('does not match non-command mentions', () => {
    const parsed = parseAutonomyCommand('@nika_entity what do you think?', 'nika_entity', '/autonomy');
    expect(parsed).toEqual({
      matched: false,
      objective: '',
    });
  });

  it('matches command case-insensitively', () => {
    const parsed = parseAutonomyCommand('@Nika_Entity /AUTONOMY audit last 10 posts', 'nika_entity', '/autonomy');
    expect(parsed).toEqual({
      matched: true,
      objective: 'audit last 10 posts',
    });
  });
});

