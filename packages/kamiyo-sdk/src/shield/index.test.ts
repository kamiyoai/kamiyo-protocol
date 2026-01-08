import { PublicKey } from '@solana/web3.js';
import { Shield, Credential, serialize, deserialize, verifyCredential } from './index';

const AGENT = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const rep = { successful: 80, total: 100, disputesWon: 5, disputesLost: 2 };

describe('Shield', () => {
  let s: Shield;
  beforeEach(() => { s = new Shield(AGENT); });

  test('init state', () => {
    expect(s.successRate()).toBe(0);
    expect(s.credential()).toBeNull();
  });

  test('setRep', () => {
    s.setRep(rep);
    expect(s.successRate()).toBe(80);
  });

  test('zero total', () => {
    s.setRep({ successful: 0, total: 0, disputesWon: 0, disputesLost: 0 });
    expect(s.successRate()).toBe(0);
  });

  test('floors decimals', () => {
    s.setRep({ successful: 2, total: 3, disputesWon: 0, disputesLost: 0 });
    expect(s.successRate()).toBe(66);
  });

  test('meetsThreshold', () => {
    s.setRep(rep);
    expect(s.meetsThreshold(80)).toBe(true);
    expect(s.meetsThreshold(70)).toBe(true);
    expect(s.meetsThreshold(90)).toBe(false);
  });

  test('commitment throws without rep', () => {
    expect(() => s.commitment()).toThrow('no rep data');
  });

  test('commitment', () => {
    s.setRep(rep);
    const c = s.commitment();
    expect(typeof c).toBe('bigint');
    expect(c).toBeGreaterThan(0n);
    expect(s.commitment()).toBe(c); // deterministic
  });

  test('different agents different commitments', () => {
    const s2 = new Shield(PublicKey.unique());
    s.setRep(rep);
    s2.setRep(rep);
    expect(s.commitment()).not.toBe(s2.commitment());
  });

  test('issue throws without rep', () => {
    expect(() => s.issue(123n)).toThrow('no rep data');
  });

  test('issue credential', () => {
    s.setRep(rep);
    const cred = s.issue(123n);
    expect(cred.blacklistRoot).toBe(123n);
    expect(cred.expiresAt - cred.issuedAt).toBe(86400);
    expect(s.credential()).toBe(cred);
  });

  test('issue with custom TTL', () => {
    s.setRep(rep);
    const cred = s.issue(123n, 3600);
    expect(cred.expiresAt - cred.issuedAt).toBe(3600);
  });

  test('valid', () => {
    expect(s.valid()).toBe(false);
    s.setRep(rep);
    s.issue(123n);
    expect(s.valid()).toBe(true);
  });

  test('proverInput', () => {
    expect(s.proverInput(80)).toBeNull();
    s.setRep(rep);
    const input = s.proverInput(70)!;
    expect(input.successful).toBe(80);
    expect(input.threshold).toBe(70);
    expect(typeof input.blinding).toBe('bigint');
  });

  test('prove without exclusion', () => {
    s.setRep(rep);
    const p = s.prove(80);
    expect(p.reputation.meets).toBe(true);
    expect(p.reputation.threshold).toBe(80);
    expect(p.exclusion).toBeNull();
  });

  test('prove with exclusion', () => {
    s.setRep(rep);
    const siblings = Shield.emptySmtSiblings();
    const root = Shield.emptySmtRoot();
    const proof = Shield.exclusionProof(root, 123n, siblings);
    const p = s.prove(80, proof);
    expect(p.exclusion).not.toBeNull();
    expect(p.exclusion!.root).toBe(root);
  });

  test('emptySmtRoot deterministic', () => {
    expect(Shield.emptySmtRoot()).toBe(Shield.emptySmtRoot());
  });

  test('emptySmtSiblings length', () => {
    expect(Shield.emptySmtSiblings()).toHaveLength(256);
  });

  test('exclusionProof', () => {
    const p = Shield.exclusionProof(1n, 2n, [3n, 4n]);
    expect(p.root).toBe(1n);
    expect(p.key).toBe(2n);
    expect(p.siblings).toEqual([3n, 4n]);
  });
});

describe('verifyCredential', () => {
  const now = Math.floor(Date.now() / 1000);
  const makeCred = (offset: number): Credential => ({
    agentPk: 1n, repCommitment: 2n, blacklistRoot: 3n,
    issuedAt: now + offset, expiresAt: now + offset + 3600,
  });

  test('valid', () => expect(verifyCredential(makeCred(0), 3n)).toBe(true));
  test('expired', () => expect(verifyCredential(makeCred(-7200), 3n)).toBe(false));
  test('wrong root', () => expect(verifyCredential(makeCred(0), 999n)).toBe(false));
});

describe('serialize/deserialize', () => {
  test('roundtrip', () => {
    const cred: Credential = {
      agentPk: 12345678901234567890n,
      repCommitment: 98765432109876543210n,
      blacklistRoot: 11111111111111111111n,
      issuedAt: 1700000000,
      expiresAt: 1700086400,
    };
    const bytes = serialize(cred);
    expect(bytes.length).toBe(104);
    const r = deserialize(bytes);
    expect(r).toEqual(cred);
  });

  test('invalid length', () => {
    expect(() => deserialize(new Uint8Array(50))).toThrow('invalid length');
  });
});
