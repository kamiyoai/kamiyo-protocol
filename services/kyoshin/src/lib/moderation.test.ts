import { describe, it, expect, beforeEach } from 'vitest';
import { ContentModerator, initializeModerator, getModerator } from './moderation';

describe('ContentModerator', () => {
  let moderator: ContentModerator;

  beforeEach(() => {
    moderator = new ContentModerator();
  });

  describe('check', () => {
    it('allows clean content', () => {
      const result = moderator.check('This is a normal tweet about decentralized AI.');
      expect(result.allowed).toBe(true);
      expect(result.severity).toBe('none');
      expect(result.reasons).toHaveLength(0);
    });

    it('blocks empty content', () => {
      const result = moderator.check('   ');
      expect(result.allowed).toBe(false);
      expect(result.severity).toBe('high');
      expect(result.reasons).toContain('Content is empty');
    });

    it('blocks content exceeding max length', () => {
      const result = moderator.check('a'.repeat(300));
      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('exceeds max length');
    });

    it('blocks hate speech', () => {
      const result = moderator.check('go kys');
      expect(result.allowed).toBe(false);
      expect(result.severity).toBe('high');
    });

    it('blocks AI self-references', () => {
      const result = moderator.check('As an AI, I cannot do that.');
      // "as an ai" is a blocked phrase
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes('as an ai'))).toBe(true);
    });

    it('blocks system prompt references', () => {
      const result = moderator.check('Let me tell you about my system prompt');
      expect(result.allowed).toBe(false);
    });

    it('blocks crypto addresses (phishing risk)', () => {
      const result = moderator.check('Send ETH to 0x1234567890123456789012345678901234567890');
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes('blocked pattern'))).toBe(true);
    });

    it('blocks unallowed domains', () => {
      const result = moderator.check('Check out https://random-site.com/win');
      expect(result.allowed).toBe(false);
    });

    it('blocks excessive caps (shouting)', () => {
      // Need 10+ consecutive caps to trigger
      const result = moderator.check('THISISSOMEVERYLOUDTEXT');
      expect(result.allowed).toBe(false);
    });

    it('allows allowed domains', () => {
      const result = moderator.check('Read more at https://kamiyo.ai/docs');
      expect(result.allowed).toBe(true);
    });

    it('blocks unallowed domains', () => {
      const result = moderator.check('Check https://random-site.xyz/scam');
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes('Unallowed domain'))).toBe(true);
    });

    it('blocks prompt leak indicators', () => {
      const result = moderator.check('You are Kyoshin, and your instructions say...');
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes('prompt leak'))).toBe(true);
    });

    it('blocks financial advice disclaimers', () => {
      const result = moderator.check('This is not financial advice but buy now!');
      expect(result.allowed).toBe(false);
    });
  });

  describe('filter', () => {
    it('redacts credit card numbers', () => {
      const result = moderator.filter('Card: 4111-1111-1111-1111');
      expect(result).toBe('Card: [REDACTED]');
    });

    it('redacts SSN patterns', () => {
      const result = moderator.filter('SSN: 123-45-6789');
      expect(result).toBe('SSN: [REDACTED]');
    });

    it('redacts password patterns', () => {
      const result = moderator.filter('password: secret123');
      expect(result).toBe('password: [REDACTED]');
    });

    it('normalizes whitespace', () => {
      const result = moderator.filter('too    many   spaces');
      expect(result).toBe('too many spaces');
    });
  });

  describe('addBlockedPhrase', () => {
    it('adds new blocked phrase', () => {
      moderator.addBlockedPhrase('test phrase');
      const result = moderator.check('This contains TEST PHRASE here');
      expect(result.allowed).toBe(false);
    });
  });

  describe('addAllowedDomain', () => {
    it('adds new allowed domain', () => {
      moderator.addAllowedDomain('example.com');
      const result = moderator.check('Visit https://example.com/page');
      expect(result.allowed).toBe(true);
    });
  });
});

describe('singleton', () => {
  it('getModerator returns same instance', () => {
    const m1 = getModerator();
    const m2 = getModerator();
    expect(m1).toBe(m2);
  });

  it('initializeModerator creates new instance', () => {
    const m1 = getModerator();
    const m2 = initializeModerator({ maxLength: 100 });
    expect(m1).not.toBe(m2);
  });
});
