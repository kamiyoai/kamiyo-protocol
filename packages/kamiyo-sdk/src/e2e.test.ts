import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
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

describe('e2e: full flow', () => {
  const agent = Keypair.generate();
  const provider = Keypair.generate();

  describe('PDA derivation', () => {
    let client: KamiyoClient;

    beforeAll(() => {
      const conn = { getLatestBlockhash: jest.fn() } as unknown as Connection;
      client = new KamiyoClient({ connection: conn, wallet: mockWallet(agent) });
    });

    test('agent PDA is deterministic', () => {
      const [pda1, bump1] = client.getAgentPDA(agent.publicKey);
      const [pda2, bump2] = client.getAgentPDA(agent.publicKey);
      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    test('agreement PDA includes txId', () => {
      const [pda1] = client.getAgreementPDA(agent.publicKey, 'tx-001');
      const [pda2] = client.getAgreementPDA(agent.publicKey, 'tx-002');
      expect(pda1.equals(pda2)).toBe(false);
    });

    test('different agents different PDAs', () => {
      const [pda1] = client.getAgentPDA(agent.publicKey);
      const [pda2] = client.getAgentPDA(provider.publicKey);
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe('instruction building', () => {
    let client: KamiyoClient;

    beforeAll(() => {
      const conn = { getLatestBlockhash: jest.fn() } as unknown as Connection;
      client = new KamiyoClient({ connection: conn, wallet: mockWallet(agent) });
    });

    test('createAgent instruction', () => {
      const ix = client.buildCreateAgentInstruction(agent.publicKey, {
        name: 'TestBot',
        agentType: AgentType.Trading,
        stakeAmount: new BN(500_000_000),
      });
      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect(ix.keys.length).toBe(5);
      expect(ix.keys[1].pubkey.equals(agent.publicKey)).toBe(true);
      expect(ix.keys[1].isSigner).toBe(true);
    });

    test('createAgreement instruction', () => {
      const ix = client.buildCreateAgreementInstruction(agent.publicKey, {
        provider: provider.publicKey,
        amount: new BN(100_000_000),
        timeLockSeconds: new BN(86400),
        transactionId: 'order-123',
      });
      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect(ix.keys[2].pubkey.equals(provider.publicKey)).toBe(true);
    });

    test('releaseFunds instruction', () => {
      const ix = client.buildReleaseFundsInstruction(agent.publicKey, 'order-123', provider.publicKey);
      expect(ix.keys[2].pubkey.equals(provider.publicKey)).toBe(true);
      expect(ix.keys[2].isWritable).toBe(true);
    });

    test('markDisputed instruction', () => {
      const ix = client.buildMarkDisputedInstruction(agent.publicKey, 'order-123');
      expect(ix.keys[0].isWritable).toBe(true); // agreement PDA
      expect(ix.keys[2].isSigner).toBe(true); // agent
    });
  });

  describe('AgreementManager logic', () => {
    let client: KamiyoClient;
    let agreements: AgreementManager;

    beforeAll(() => {
      const conn = { getLatestBlockhash: jest.fn() } as unknown as Connection;
      client = new KamiyoClient({ connection: conn, wallet: mockWallet(agent) });
      agreements = new AgreementManager(client);
    });

    test('calculateResolution: poor quality', () => {
      const r = agreements.calculateResolution(new BN(1_000_000_000), 30);
      expect(r.refundPercentage).toBe(100);
      expect(r.refundAmount.toNumber()).toBe(1_000_000_000);
      expect(r.paymentAmount.toNumber()).toBe(0);
    });

    test('calculateResolution: below average', () => {
      const r = agreements.calculateResolution(new BN(1_000_000_000), 55);
      expect(r.refundPercentage).toBe(75);
      expect(r.refundAmount.toNumber()).toBe(750_000_000);
    });

    test('calculateResolution: average', () => {
      const r = agreements.calculateResolution(new BN(1_000_000_000), 70);
      expect(r.refundPercentage).toBe(35);
      expect(r.refundAmount.toNumber()).toBe(350_000_000);
    });

    test('calculateResolution: good quality', () => {
      const r = agreements.calculateResolution(new BN(1_000_000_000), 85);
      expect(r.refundPercentage).toBe(0);
      expect(r.paymentAmount.toNumber()).toBe(1_000_000_000);
    });

    test('generateTransactionId is unique', () => {
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

  describe('AgentManager logic', () => {
    let client: KamiyoClient;
    let agents: AgentManager;

    beforeAll(() => {
      const conn = { getLatestBlockhash: jest.fn() } as unknown as Connection;
      client = new KamiyoClient({ connection: conn, wallet: mockWallet(agent) });
      agents = new AgentManager(client);
    });

    test('calculateTrustLevel', () => {
      const base = {
        owner: agent.publicKey,
        name: 'Test',
        agentType: AgentType.Trading,
        isActive: true,
        createdAt: new BN(0),
        lastActive: new BN(0),
        totalEscrows: new BN(10),
        successfulEscrows: new BN(8),
        disputedEscrows: new BN(2),
        bump: 255,
      };

      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(300), stakeAmount: new BN(0.1e9) })).toBe('low');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(500), stakeAmount: new BN(0.5e9) })).toBe('medium');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(700), stakeAmount: new BN(2e9) })).toBe('high');
      expect(agents.calculateTrustLevel({ ...base, reputation: new BN(900), stakeAmount: new BN(15e9) })).toBe('trusted');
    });

    test('getStats', () => {
      const a = {
        owner: agent.publicKey,
        name: 'Test',
        agentType: AgentType.Trading,
        reputation: new BN(500),
        stakeAmount: new BN(1e9),
        isActive: true,
        createdAt: new BN(0),
        lastActive: new BN(0),
        totalEscrows: new BN(100),
        successfulEscrows: new BN(90),
        disputedEscrows: new BN(10),
        bump: 255,
      };
      const stats = agents.getStats(a);
      expect(stats.totalEscrows).toBe(100);
      expect(stats.successRate).toBe(90);
      expect(stats.disputeRate).toBe(10);
    });
  });
});

describe('e2e: quality refund scale', () => {
  test('scale boundaries', () => {
    expect(QUALITY_REFUND_SCALE.POOR.maxQuality).toBe(49);
    expect(QUALITY_REFUND_SCALE.BELOW_AVERAGE.minQuality).toBe(50);
    expect(QUALITY_REFUND_SCALE.BELOW_AVERAGE.maxQuality).toBe(64);
    expect(QUALITY_REFUND_SCALE.AVERAGE.minQuality).toBe(65);
    expect(QUALITY_REFUND_SCALE.AVERAGE.maxQuality).toBe(79);
    expect(QUALITY_REFUND_SCALE.GOOD.minQuality).toBe(80);
  });

  test('no gaps in scale', () => {
    expect(QUALITY_REFUND_SCALE.POOR.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.BELOW_AVERAGE.minQuality);
    expect(QUALITY_REFUND_SCALE.BELOW_AVERAGE.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.AVERAGE.minQuality);
    expect(QUALITY_REFUND_SCALE.AVERAGE.maxQuality + 1).toBe(QUALITY_REFUND_SCALE.GOOD.minQuality);
  });
});

// Skip devnet tests by default - run with: npm test -- --testPathPattern=e2e --runInBand
describe.skip('e2e: devnet integration', () => {
  const DEVNET_RPC = 'https://api.devnet.solana.com';
  let client: KamiyoClient;
  let agents: AgentManager;
  let agreements: AgreementManager;
  const wallet = Keypair.generate();

  beforeAll(async () => {
    const conn = new Connection(DEVNET_RPC, 'confirmed');
    client = new KamiyoClient({ connection: conn, wallet: mockWallet(wallet) });
    agents = new AgentManager(client);
    agreements = new AgreementManager(client);

    // Airdrop for testing (will fail if rate limited)
    try {
      const sig = await conn.requestAirdrop(wallet.publicKey, 2e9);
      await conn.confirmTransaction(sig);
    } catch (e) {
      console.log('Airdrop failed - fund wallet manually:', wallet.publicKey.toBase58());
    }
  });

  test('create agent', async () => {
    const { signature, pda } = await agents.create('E2ETestBot', AgentType.Service, 0.1);
    expect(signature).toBeTruthy();
    expect(pda).toBeTruthy();

    const agent = await agents.getMine();
    expect(agent?.name).toBe('E2ETestBot');
  }, 30000);

  test('create agreement', async () => {
    const provider = Keypair.generate().publicKey;
    const txId = agreements.generateTransactionId();

    const { signature } = await agreements.create(provider, 0.01, 1, txId);
    expect(signature).toBeTruthy();

    const agreement = await agreements.getByTransactionId(txId);
    expect(agreement?.status).toBe(AgreementStatus.Active);
  }, 30000);

  test('dispute agreement', async () => {
    const provider = Keypair.generate().publicKey;
    const txId = agreements.generateTransactionId();

    await agreements.create(provider, 0.01, 1, txId);
    const sig = await agreements.dispute(txId);
    expect(sig).toBeTruthy();

    const agreement = await agreements.getByTransactionId(txId);
    expect(agreement?.status).toBe(AgreementStatus.Disputed);
  }, 30000);
});
