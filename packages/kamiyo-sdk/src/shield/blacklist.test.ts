import { Keypair, PublicKey } from '@solana/web3.js';
import { Blacklist } from './blacklist';

describe('Blacklist', () => {
  let bl: Blacklist;
  const agent1 = Keypair.generate().publicKey;
  const agent2 = Keypair.generate().publicKey;

  beforeEach(() => { bl = new Blacklist(); });

  test('empty', () => {
    expect(bl.size()).toBe(0);
    expect(bl.getRoot()).toBeTruthy();
    expect(bl.contains(agent1)).toBe(false);
  });

  test('add', () => {
    bl.add(agent1, 'spam');
    expect(bl.size()).toBe(1);
    expect(bl.contains(agent1)).toBe(true);
    expect(bl.contains(agent2)).toBe(false);
  });

  test('add duplicate noop', () => {
    bl.add(agent1);
    bl.add(agent1);
    expect(bl.size()).toBe(1);
  });

  test('remove', () => {
    bl.add(agent1);
    expect(bl.remove(agent1)).toBe(true);
    expect(bl.size()).toBe(0);
    expect(bl.contains(agent1)).toBe(false);
  });

  test('remove nonexistent', () => {
    expect(bl.remove(agent1)).toBe(false);
  });

  test('root changes on modify', () => {
    const r1 = bl.getRoot();
    bl.add(agent1);
    const r2 = bl.getRoot();
    expect(r1).not.toBe(r2);
    bl.remove(agent1);
    expect(bl.getRoot()).toBe(r1);
  });

  test('list entries', () => {
    bl.add(agent1, 'reason1');
    bl.add(agent2);
    const list = bl.list();
    expect(list).toHaveLength(2);
    expect(list.some(e => e.reason === 'reason1')).toBe(true);
  });

  test('proof for non-member', () => {
    const p = bl.proof(agent1);
    expect(p.exists).toBe(false);
    expect(p.siblings).toHaveLength(256);
  });

  test('proof for member', () => {
    bl.add(agent1);
    const p = bl.proof(agent1);
    expect(p.exists).toBe(true);
  });

  test('exclusionProof throws for member', () => {
    bl.add(agent1);
    expect(() => bl.exclusionProof(agent1)).toThrow('blacklisted');
  });

  test('exclusionProof ok for non-member', () => {
    bl.add(agent1);
    const p = bl.exclusionProof(agent2);
    expect(p.exists).toBe(false);
  });

  test('verify exclusion', () => {
    const p = bl.exclusionProof(agent1);
    expect(Blacklist.verify(p, false)).toBe(true);
    expect(Blacklist.verify(p, true)).toBe(false);
  });

  test('verify inclusion', () => {
    bl.add(agent1);
    const p = bl.proof(agent1);
    expect(Blacklist.verify(p, true)).toBe(true);
    expect(Blacklist.verify(p, false)).toBe(false);
  });

  test('export/import', () => {
    bl.add(agent1, 'test');
    bl.add(agent2);
    const data = bl.export();
    const bl2 = Blacklist.import(data);
    expect(bl2.size()).toBe(2);
    expect(bl2.getRoot()).toBe(bl.getRoot());
    expect(bl2.contains(agent1)).toBe(true);
  });
});
