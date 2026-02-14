import { describe, it, expect } from 'vitest';
import { parseSkillsListIntent, parseSkillInvokeIntent } from './intents';

describe('parseSkillsListIntent', () => {
  it('parses /skills without page', () => {
    expect(parseSkillsListIntent('/skills')).toEqual({ page: 1 });
  });

  it('parses /skills with page', () => {
    expect(parseSkillsListIntent('/skills 2')).toEqual({ page: 2 });
  });

  it('parses natural language triggers', () => {
    expect(parseSkillsListIntent('What skills do you have?')).toEqual({ page: 1 });
    expect(parseSkillsListIntent('what can you do')).toEqual({ page: 1 });
  });
});

describe('parseSkillInvokeIntent', () => {
  it('parses /skill with args', () => {
    expect(parseSkillInvokeIntent('/skill summarize hello')).toEqual({ skillId: 'summarize', args: 'hello' });
  });

  it('allows hyphenated skill ids', () => {
    expect(parseSkillInvokeIntent('/skill agent-skills-audit abc')).toEqual({ skillId: 'agent-skills-audit', args: 'abc' });
  });

  it('returns empty args when omitted', () => {
    expect(parseSkillInvokeIntent('/skill summarize')).toEqual({ skillId: 'summarize', args: '' });
  });
});

