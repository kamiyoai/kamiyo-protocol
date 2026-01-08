import { Keypair } from '@solana/web3.js';
import { CredentialManager, serializeSigned, deserializeSigned } from './credential';
import { Credential } from './index';

describe('CredentialManager', () => {
  let cm: CredentialManager;
  const issuer = Keypair.generate();
  const agent = Keypair.generate();

  const baseCred: Credential = {
    agentPk: BigInt('0x' + Buffer.from(agent.publicKey.toBytes()).toString('hex')),
    repCommitment: 123456n,
    blacklistRoot: 789n,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => { cm = new CredentialManager(issuer); });

  test('issue', () => {
    const signed = cm.issue(baseCred);
    expect(signed.signature).toHaveLength(64);
    expect(signed.issuer.equals(issuer.publicKey)).toBe(true);
    expect(signed.nonce).toBeTruthy();
  });

  test('verify valid', () => {
    const signed = cm.issue(baseCred);
    const r = cm.verify(signed);
    expect(r.valid).toBe(true);
  });

  test('verify expired', () => {
    const expired: Credential = { ...baseCred, expiresAt: Math.floor(Date.now() / 1000) - 100 };
    const signed = cm.issue(expired);
    const r = cm.verify(signed);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('expired');
  });

  test('verify tampered sig fails', () => {
    const signed = cm.issue(baseCred);
    signed.signature[0] ^= 0xff;
    const r = cm.verify(signed);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('invalid signature');
  });

  test('revoke', () => {
    const signed = cm.issue(baseCred);
    expect(cm.revoke(signed)).toBe(true);
    expect(cm.isRevoked(signed)).toBe(true);
    const r = cm.verify(signed);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('revoked');
  });

  test('revoke nonexistent', () => {
    const signed = new CredentialManager(Keypair.generate()).issue(baseCred);
    expect(cm.revoke(signed)).toBe(false);
  });

  test('refresh', () => {
    const signed = cm.issue(baseCred);
    const refreshed = cm.refresh(signed, 7200);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.expiresAt - refreshed!.issuedAt).toBe(7200);
    expect(refreshed!.nonce).not.toBe(signed.nonce);
  });

  test('refresh expired ok', () => {
    const expired: Credential = { ...baseCred, expiresAt: Math.floor(Date.now() / 1000) - 100 };
    const signed = cm.issue(expired);
    const refreshed = cm.refresh(signed);
    expect(refreshed).not.toBeNull();
    expect(cm.verify(refreshed!).valid).toBe(true);
  });

  test('refresh revoked fails', () => {
    const signed = cm.issue(baseCred);
    cm.revoke(signed);
    expect(cm.refresh(signed)).toBeNull();
  });

  test('getIssued excludes revoked', () => {
    const s1 = cm.issue(baseCred);
    const s2 = cm.issue({ ...baseCred, repCommitment: 999n });
    cm.revoke(s1);
    const issued = cm.getIssued();
    expect(issued).toHaveLength(1);
    expect(issued[0].repCommitment).toBe(999n);
  });
});

describe('serializeSigned/deserializeSigned', () => {
  test('roundtrip', () => {
    const cm = new CredentialManager(Keypair.generate());
    const cred: Credential = {
      agentPk: 12345n,
      repCommitment: 67890n,
      blacklistRoot: 11111n,
      issuedAt: 1700000000,
      expiresAt: 1700003600,
    };
    const signed = cm.issue(cred);
    const bytes = serializeSigned(signed);
    expect(bytes.length).toBe(232);
    const restored = deserializeSigned(bytes);
    expect(restored.agentPk).toBe(signed.agentPk);
    expect(restored.nonce).toBe(signed.nonce);
    expect(restored.issuer.equals(signed.issuer)).toBe(true);
  });

  test('invalid length', () => {
    expect(() => deserializeSigned(new Uint8Array(100))).toThrow('invalid signed credential length');
  });
});
