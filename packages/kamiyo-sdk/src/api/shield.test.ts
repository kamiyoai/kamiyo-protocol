import { PublicKey } from '@solana/web3.js';
import { ShieldAPI, shieldAPI } from './shield';

const AGENT = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const stats = { successful: 85, total: 100, disputesWon: 5, disputesLost: 2 };

describe('ShieldAPI', () => {
  let api: ShieldAPI;
  beforeEach(() => { api = new ShieldAPI(); });

  test('verifyAgent eligible', () => {
    const r = api.verifyAgent({ agentPubkey: AGENT, stats, threshold: 80 });
    expect(r.eligible).toBe(true);
    expect(r.meetsThreshold).toBe(true);
    expect(r.successRate).toBe(85);
    expect(r.proof.reputation.commitment).toMatch(/^[0-9a-f]+$/);
  });

  test('verifyAgent below threshold', () => {
    const r = api.verifyAgent({ agentPubkey: AGENT, stats, threshold: 90 });
    expect(r.eligible).toBe(false);
    expect(r.meetsThreshold).toBe(false);
  });

  test('verifyAgent with blacklist', () => {
    const empty = api.getEmptyBlacklist();
    const r = api.verifyAgent({
      agentPubkey: AGENT, stats, threshold: 80,
      blacklistRoot: empty.root,
      smtSiblings: empty.siblings,
    });
    expect(r.eligible).toBe(true);
    expect(r.proof.exclusion).not.toBeNull();
    expect(r.proof.exclusion!.root).toBe(empty.root);
  });

  test('issueCredential', () => {
    const r = api.issueCredential({
      agentPubkey: AGENT, stats,
      blacklistRoot: 'abc123',
      ttl: 3600,
    });
    expect(r.credential.blacklistRoot).toBe('abc123');
    expect(r.credential.expiresAt - r.credential.issuedAt).toBe(3600);
    expect(r.serialized).toMatch(/^[0-9a-f]+$/);
  });

  test('getEmptyBlacklist', () => {
    const b = api.getEmptyBlacklist();
    expect(b.root).toMatch(/^[0-9a-f]+$/);
    expect(b.siblings).toHaveLength(256);
  });
});

describe('shieldAPI singleton', () => {
  test('works', () => {
    const r = shieldAPI.verifyAgent({ agentPubkey: AGENT, stats, threshold: 80 });
    expect(r.eligible).toBe(true);
  });
});
