import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { KamiyoClient } from './client';
import { AgentManager } from './agent';
import { AgreementManager } from './agreement';
import { AgentType, AgreementStatus, QUALITY_REFUND_SCALE } from './types';

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

function mockWallet(kp: Keypair): any {
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T>(tx: T) => { (tx as any).sign(kp); return tx; },
    signAllTransactions: async <T>(txs: T[]) => { txs.forEach(t => (t as any).sign(kp)); return txs; },
  };
}

describe('e2e', () => {
  const agent = Keypair.generate();
  const provider = Keypair.generate();
  const conn = { getLatestBlockhash: jest.fn() } as unknown as Connection;
  let client: KamiyoClient;
  let agents: AgentManager;
  let agreements: AgreementManager;

  beforeAll(() => {
    client = new KamiyoClient({ connection: conn, wallet: mockWallet(agent) });
    agents = new AgentManager(client);
    agreements = new AgreementManager(client);
  });

  describe('PDAs', () => {
    test('agent deterministic', () => {
      const [a, b1] = client.getAgentPDA(agent.publicKey);
      const [c, b2] = client.getAgentPDA(agent.publicKey);
      expect(a.equals(c)).toBe(true);
      expect(b1).toBe(b2);
    });

    test('agreement includes txId', () => {
      const [a] = client.getAgreementPDA(agent.publicKey, 'tx-001');
      const [b] = client.getAgreementPDA(agent.publicKey, 'tx-002');
      expect(a.equals(b)).toBe(false);
    });

    test('different agents', () => {
      const [a] = client.getAgentPDA(agent.publicKey);
      const [b] = client.getAgentPDA(provider.publicKey);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('instructions', () => {
    test('createAgent', () => {
      const ix = client.buildCreateAgentInstruction(agent.publicKey, {
        name: 'Bot', agentType: AgentType.Trading, stakeAmount: new BN(5e8),
      });
      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect(ix.keys[1].pubkey.equals(agent.publicKey)).toBe(true);
      expect(ix.keys[1].isSigner).toBe(true);
    });

    test('createAgreement', () => {
      const ix = client.buildCreateAgreementInstruction(agent.publicKey, {
        provider: provider.publicKey, amount: new BN(1e8), timeLockSeconds: new BN(86400), transactionId: 'ord-1',
      });
      expect(ix.keys[2].pubkey.equals(provider.publicKey)).toBe(true);
    });

    test('releaseFunds', () => {
      const ix = client.buildReleaseFundsInstruction(agent.publicKey, 'ord-1', provider.publicKey);
      expect(ix.keys[2].pubkey.equals(provider.publicKey)).toBe(true);
      expect(ix.keys[2].isWritable).toBe(true);
    });

    test('markDisputed', () => {
      const ix = client.buildMarkDisputedInstruction(agent.publicKey, 'ord-1');
      expect(ix.keys[0].isWritable).toBe(true);
      expect(ix.keys[2].isSigner).toBe(true);
    });
  });

  describe('AgreementManager', () => {
    test('resolution tiers', () => {
      const amt = new BN(1e9);
      expect(agreements.calculateResolution(amt, 30).refundPercentage).toBe(100);
      expect(agreements.calculateResolution(amt, 55).refundPercentage).toBe(75);
      expect(agreements.calculateResolution(amt, 70).refundPercentage).toBe(35);
      expect(agreements.calculateResolution(amt, 85).refundPercentage).toBe(0);
    });

    test('generateTransactionId unique', () => {
      const ids = new Set([...Array(100)].map(() => agreements.generateTransactionId()));
      expect(ids.size).toBe(100);
    });

    test('formatTimeRemaining', () => {
      expect(agreements.formatTimeRemaining(0)).toBe('Expired');
      expect(agreements.formatTimeRemaining(300)).toBe('5m');
      expect(agreements.formatTimeRemaining(3700)).toBe('1h 1m');
      expect(agreements.formatTimeRemaining(90000)).toBe('1d 1h');
    });

    test('getStatusLabel', () => {
      expect(agreements.getStatusLabel(AgreementStatus.Active)).toBe('Active');
      expect(agreements.getStatusLabel(AgreementStatus.Disputed)).toBe('Disputed');
      expect(agreements.getStatusLabel(AgreementStatus.Resolved)).toBe('Resolved');
    });
  });

  describe('AgentManager', () => {
    const base = {
      owner: agent.publicKey, name: 'Test', agentType: AgentType.Trading,
      isActive: true, createdAt: new BN(0), lastActive: new BN(0),
      totalEscrows: new BN(10), successfulEscrows: new BN(8), disputedEscrows: new BN(2), bump: 255,
    };

    test('trustLevel', () => {
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(300), stakeAmount: new BN(0.1e9) })).toBe('low');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(500), stakeAmount: new BN(0.5e9) })).toBe('medium');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(700), stakeAmount: new BN(2e9) })).toBe('high');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(900), stakeAmount: new BN(15e9) })).toBe('trusted');
    });

    test('getStats', () => {
      const a = { ...base, reputation: new BN(500), stakeAmount: new BN(1e9), totalEscrows: new BN(100), successfulEscrows: new BN(90), disputedEscrows: new BN(10) };
      const s = agents.getStats(a);
      expect(s.totalEscrows).toBe(100);
      expect(s.successRate).toBe(90);
      expect(s.disputeRate).toBe(10);
    });
  });

  describe('quality scale', () => {
    test('boundaries', () => {
      expect(QUALITY_REFUND_SCALE.POOR.maxQuality).toBe(49);
      expect(QUALITY_REFUND_SCALE.BELOW_AVERAGE.minQuality).toBe(50);
      expect(QUALITY_REFUND_SCALE.AVERAGE.minQuality).toBe(65);
      expect(QUALITY_REFUND_SCALE.GOOD.minQuality).toBe(80);
    });

    test('no gaps', () => {
      expect(QUALITY_REFUND_SCALE.POOR.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.BELOW_AVERAGE.minQuality);
      expect(QUALITY_REFUND_SCALE.BELOW_AVERAGE.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.AVERAGE.minQuality);
      expect(QUALITY_REFUND_SCALE.AVERAGE.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.GOOD.minQuality);
    });
  });
});

// Run with: npm test -- --testPathPattern=e2e --runInBand
describe.skip('devnet', () => {
  const RPC = 'https://api.devnet.solana.com';
  let client: KamiyoClient;
  let agents: AgentManager;
  let agreements: AgreementManager;
  const wallet = Keypair.generate();

  beforeAll(async () => {
    const conn = new Connection(RPC, 'confirmed');
    client = new KamiyoClient({ connection: conn, wallet: mockWallet(wallet) });
    agents = new AgentManager(client);
    agreements = new AgreementManager(client);
    try {
      const sig = await conn.requestAirdrop(wallet.publicKey, 2e9);
      await conn.confirmTransaction(sig);
    } catch { console.log('Airdrop failed:', wallet.publicKey.toBase58()); }
  });

  test('create agent', async () => {
    const { signature, pda } = await agents.create('E2EBot', AgentType.Service, 0.1);
    expect(signature).toBeTruthy();
    expect(pda).toBeTruthy();
    expect((await agents.getMine())?.name).toBe('E2EBot');
  }, 30000);

  test('create + dispute agreement', async () => {
    const prov = Keypair.generate().publicKey;
    const txId = agreements.generateTransactionId();
    await agreements.create(prov, 0.01, 1, txId);
    expect((await agreements.getByTransactionId(txId))?.status).toBe(AgreementStatus.Active);
    await agreements.dispute(txId);
    expect((await agreements.getByTransactionId(txId))?.status).toBe(AgreementStatus.Disputed);
  }, 30000);
});
