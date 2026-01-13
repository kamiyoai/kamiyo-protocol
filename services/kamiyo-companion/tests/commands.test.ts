import { describe, it, expect, vi, beforeEach } from 'vitest';

// Command regex patterns (mirrors src/index.ts)
const COMMANDS = {
  WALLET: /^!wallet\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/,
  UPGRADE: /^!upgrade\s+(companion|pro)$/,
  VERIFY: /^!verify\s+([1-9A-HJ-NP-Za-km-z]{64,})$/,
  RATE: /^!rate\s+([1-5])$/,
  PROOF: /^!proof(?:\s+(\d+))?$/,
  STATUS: /^!status$/,
  CLEAR: /^!clear$/,
  HELP: /^!help$/,
};

function parseCommand(text: string): { command: string; args: string[] } | null {
  const trimmed = text.trim();

  if (COMMANDS.WALLET.test(trimmed)) {
    const match = trimmed.match(COMMANDS.WALLET);
    return { command: 'wallet', args: [match![1]] };
  }

  if (COMMANDS.UPGRADE.test(trimmed)) {
    const match = trimmed.match(COMMANDS.UPGRADE);
    return { command: 'upgrade', args: [match![1]] };
  }

  if (COMMANDS.VERIFY.test(trimmed)) {
    const match = trimmed.match(COMMANDS.VERIFY);
    return { command: 'verify', args: [match![1]] };
  }

  if (COMMANDS.RATE.test(trimmed)) {
    const match = trimmed.match(COMMANDS.RATE);
    return { command: 'rate', args: [match![1]] };
  }

  if (COMMANDS.PROOF.test(trimmed)) {
    const match = trimmed.match(COMMANDS.PROOF);
    return { command: 'proof', args: match![1] ? [match![1]] : ['60'] };
  }

  if (COMMANDS.STATUS.test(trimmed)) {
    return { command: 'status', args: [] };
  }

  if (COMMANDS.CLEAR.test(trimmed)) {
    return { command: 'clear', args: [] };
  }

  if (COMMANDS.HELP.test(trimmed)) {
    return { command: 'help', args: [] };
  }

  return null;
}

describe('Command Parsing', () => {
  describe('!wallet', () => {
    it('should parse valid wallet address', () => {
      const result = parseCommand('!wallet Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
      expect(result).toEqual({
        command: 'wallet',
        args: ['Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump'],
      });
    });

    it('should reject wallet without address', () => {
      expect(parseCommand('!wallet')).toBeNull();
    });

    it('should reject wallet with invalid address', () => {
      expect(parseCommand('!wallet invalid')).toBeNull();
      expect(parseCommand('!wallet 123')).toBeNull();
    });
  });

  describe('!upgrade', () => {
    it('should parse upgrade companion', () => {
      const result = parseCommand('!upgrade companion');
      expect(result).toEqual({ command: 'upgrade', args: ['companion'] });
    });

    it('should parse upgrade pro', () => {
      const result = parseCommand('!upgrade pro');
      expect(result).toEqual({ command: 'upgrade', args: ['pro'] });
    });

    it('should reject invalid tier', () => {
      expect(parseCommand('!upgrade free')).toBeNull();
      expect(parseCommand('!upgrade premium')).toBeNull();
    });
  });

  describe('!rate', () => {
    it('should parse valid ratings 1-5', () => {
      expect(parseCommand('!rate 1')).toEqual({ command: 'rate', args: ['1'] });
      expect(parseCommand('!rate 3')).toEqual({ command: 'rate', args: ['3'] });
      expect(parseCommand('!rate 5')).toEqual({ command: 'rate', args: ['5'] });
    });

    it('should reject invalid ratings', () => {
      expect(parseCommand('!rate 0')).toBeNull();
      expect(parseCommand('!rate 6')).toBeNull();
      expect(parseCommand('!rate abc')).toBeNull();
    });
  });

  describe('!proof', () => {
    it('should parse proof without threshold', () => {
      const result = parseCommand('!proof');
      expect(result).toEqual({ command: 'proof', args: ['60'] });
    });

    it('should parse proof with threshold', () => {
      const result = parseCommand('!proof 80');
      expect(result).toEqual({ command: 'proof', args: ['80'] });
    });
  });

  describe('simple commands', () => {
    it('should parse !status', () => {
      expect(parseCommand('!status')).toEqual({ command: 'status', args: [] });
    });

    it('should parse !clear', () => {
      expect(parseCommand('!clear')).toEqual({ command: 'clear', args: [] });
    });

    it('should parse !help', () => {
      expect(parseCommand('!help')).toEqual({ command: 'help', args: [] });
    });
  });

  describe('non-commands', () => {
    it('should return null for regular text', () => {
      expect(parseCommand('Hello world')).toBeNull();
      expect(parseCommand('How are you?')).toBeNull();
    });

    it('should return null for partial commands', () => {
      expect(parseCommand('!wall')).toBeNull();
      expect(parseCommand('!upgrad')).toBeNull();
    });

    it('should handle whitespace', () => {
      expect(parseCommand('  !status  ')).toEqual({ command: 'status', args: [] });
    });
  });
});

describe('Crisis Keywords Detection', () => {
  const CRISIS_KEYWORDS = [
    'kill myself', 'suicide', 'end it all', 'want to die',
    'self harm', 'cutting myself', 'hurt myself',
    'no reason to live', 'better off dead'
  ];

  function containsCrisisKeywords(text: string): boolean {
    const lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
  }

  it('should detect crisis keywords', () => {
    expect(containsCrisisKeywords('I want to kill myself')).toBe(true);
    expect(containsCrisisKeywords('thinking about suicide')).toBe(true);
    expect(containsCrisisKeywords('I want to end it all')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(containsCrisisKeywords('I WANT TO KILL MYSELF')).toBe(true);
    expect(containsCrisisKeywords('Thinking About Suicide')).toBe(true);
  });

  it('should not flag normal messages', () => {
    expect(containsCrisisKeywords('I need help with my project')).toBe(false);
    expect(containsCrisisKeywords('Can you help me focus?')).toBe(false);
    expect(containsCrisisKeywords('I want to finish this task')).toBe(false);
  });
});
