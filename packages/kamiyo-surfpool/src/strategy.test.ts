import { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { StrategySimulator, Strategy, createTransferStrategy } from './strategy';
import { SurfpoolClient } from './client';

// Mock the SurfpoolClient
jest.mock('./client');

describe('StrategySimulator', () => {
  let simulator: StrategySimulator;
  let mockClient: jest.Mocked<SurfpoolClient>;
  let agentKeypair: Keypair;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      getConnection: jest.fn().mockReturnValue({
        getLatestBlockhash: jest.fn().mockResolvedValue({
          blockhash: 'test-blockhash',
          lastValidBlockHeight: 1000,
        }),
      }),
      getBalance: jest.fn(),
      getSlot: jest.fn(),
      setBalanceSol: jest.fn().mockResolvedValue(true),
      cloneAccounts: jest.fn().mockResolvedValue(true),
      advanceSlots: jest.fn().mockResolvedValue({ previousSlot: 0, currentSlot: 10, slotsAdvanced: 10 }),
      snapshot: jest.fn().mockResolvedValue('snapshot-1'),
      executeTransaction: jest.fn(),
    } as any;

    simulator = new StrategySimulator(mockClient);
    agentKeypair = Keypair.generate();
  });

  describe('runStrategy', () => {
    it('should execute a simple strategy successfully', async () => {
      const initialBalance = 10 * LAMPORTS_PER_SOL;
      const finalBalance = 10 * LAMPORTS_PER_SOL;

      mockClient.getBalance
        .mockResolvedValueOnce(initialBalance) // Initial balance check
        .mockResolvedValueOnce(finalBalance); // Final balance check

      mockClient.getSlot
        .mockResolvedValueOnce(1000) // Initial slot
        .mockResolvedValueOnce(1000); // Final slot

      const noopStrategy: Strategy = {
        name: 'noop',
        buildTransactions: async () => [],
      };

      const result = await simulator.runStrategy(noopStrategy, agentKeypair, {
        initialBalanceSol: 10,
      });

      expect(result.success).toBe(true);
      expect(result.pnl).toBe(0);
      expect(result.transactionCount).toBe(0);
      expect(mockClient.setBalanceSol).toHaveBeenCalledWith(agentKeypair.publicKey, 10);
    });

    it('should execute transactions and track results', async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(9 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(9 * LAMPORTS_PER_SOL);

      mockClient.getSlot
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1010);

      mockClient.executeTransaction.mockResolvedValue({
        success: true,
        logs: ['Program invoked'],
        unitsConsumed: 5000,
      });

      const strategy: Strategy = {
        name: 'transfer',
        buildTransactions: async (ctx) => {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: ctx.agent,
              toPubkey: Keypair.generate().publicKey,
              lamports: LAMPORTS_PER_SOL,
            })
          );
          tx.feePayer = ctx.agent;
          return [tx];
        },
      };

      const result = await simulator.runStrategy(strategy, agentKeypair);

      expect(result.success).toBe(true);
      expect(result.transactionCount).toBe(1);
      expect(result.gasUsed).toBe(5000);
      expect(result.pnl).toBe(-1 * LAMPORTS_PER_SOL);
    });

    it('should stop on transaction failure', async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL);

      mockClient.getSlot
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000);

      mockClient.executeTransaction.mockResolvedValue({
        success: false,
        error: 'InsufficientFunds',
        logs: [],
        unitsConsumed: 1000,
      });

      const strategy: Strategy = {
        name: 'failing',
        buildTransactions: async (ctx) => {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: ctx.agent,
              toPubkey: Keypair.generate().publicKey,
              lamports: 100 * LAMPORTS_PER_SOL,
            })
          );
          return [tx];
        },
      };

      const result = await simulator.runStrategy(strategy, agentKeypair);

      expect(result.success).toBe(false);
      expect(result.transactionCount).toBe(1);
    });

    it('should handle buildTransactions errors', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);

      const strategy: Strategy = {
        name: 'error',
        buildTransactions: async () => {
          throw new Error('Failed to build');
        },
      };

      const result = await simulator.runStrategy(strategy, agentKeypair);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to build');
    });

    it('should respect maxTransactions limit', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.executeTransaction.mockResolvedValue({
        success: true,
        logs: [],
        unitsConsumed: 1000,
      });

      const strategy: Strategy = {
        name: 'many-tx',
        buildTransactions: async () => {
          return Array(10).fill(null).map(() => new Transaction());
        },
      };

      const result = await simulator.runStrategy(strategy, agentKeypair, {
        maxTransactions: 3,
      });

      expect(result.transactionCount).toBe(3);
    });

    it('should take snapshots when configured', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.executeTransaction.mockResolvedValue({
        success: true,
        logs: [],
        unitsConsumed: 1000,
      });

      const strategy: Strategy = {
        name: 'snapshot-test',
        buildTransactions: async () => [new Transaction(), new Transaction()],
      };

      await simulator.runStrategy(strategy, agentKeypair, {
        snapshotBeforeTx: true,
      });

      expect(mockClient.snapshot).toHaveBeenCalledTimes(2);
    });

    it('should advance slots between transactions', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.executeTransaction.mockResolvedValue({
        success: true,
        logs: [],
        unitsConsumed: 1000,
      });

      const strategy: Strategy = {
        name: 'slot-advance',
        buildTransactions: async () => [new Transaction(), new Transaction()],
      };

      await simulator.runStrategy(strategy, agentKeypair, {
        slotsBetweenTx: 5,
      });

      expect(mockClient.advanceSlots).toHaveBeenCalledWith(5);
    });

    it('should run custom validation', async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(8 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);

      const strategy: Strategy = {
        name: 'validate',
        buildTransactions: async () => [],
        validateResults: (result) => result.pnl >= 0,
      };

      const result = await simulator.runStrategy(strategy, agentKeypair);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Strategy validation failed');
    });

    it('should clone accounts when specified', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);

      const accounts = [Keypair.generate().publicKey, Keypair.generate().publicKey];

      const strategy: Strategy = {
        name: 'clone',
        buildTransactions: async () => [],
      };

      await simulator.runStrategy(strategy, agentKeypair, {
        cloneAccounts: accounts,
      });

      expect(mockClient.cloneAccounts).toHaveBeenCalledWith(accounts);
    });
  });

  describe('compareStrategies', () => {
    it('should run and compare multiple strategies', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.reset = jest.fn().mockResolvedValue(true);

      const strategyA: Strategy = {
        name: 'A',
        buildTransactions: async () => [],
      };

      const strategyB: Strategy = {
        name: 'B',
        buildTransactions: async () => [],
      };

      const results = await simulator.compareStrategies(
        [strategyA, strategyB],
        agentKeypair
      );

      expect(results.size).toBe(2);
      expect(results.has('A')).toBe(true);
      expect(results.has('B')).toBe(true);
      expect(mockClient.reset).toHaveBeenCalledTimes(2);
    });
  });

  describe('optimizeStrategy', () => {
    it('should find best parameters', async () => {
      mockClient.getBalance
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(11 * LAMPORTS_PER_SOL) // First param combo
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(12 * LAMPORTS_PER_SOL) // Second param combo - winner
        .mockResolvedValueOnce(10 * LAMPORTS_PER_SOL)
        .mockResolvedValueOnce(10.5 * LAMPORTS_PER_SOL); // Third param combo

      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.reset = jest.fn().mockResolvedValue(true);

      const strategy: Strategy = {
        name: 'optimize',
        buildTransactions: async () => [],
      };

      const { bestParams, bestResult } = await simulator.optimizeStrategy(
        strategy,
        agentKeypair,
        {
          slippage: [0.5, 1.0, 2.0],
        }
      );

      expect(bestResult.pnl).toBe(2 * LAMPORTS_PER_SOL);
      expect(bestParams.slippage).toBe(1.0);
    });
  });

  describe('stressTest', () => {
    it('should run multiple iterations with varying conditions', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockClient.getSlot.mockResolvedValue(1000);
      mockClient.reset = jest.fn().mockResolvedValue(true);

      const strategy: Strategy = {
        name: 'stress',
        buildTransactions: async () => [],
      };

      const results = await simulator.stressTest(strategy, agentKeypair, {
        iterations: 5,
        varyBalance: { min: 1, max: 10 },
        varySlots: { min: 0, max: 100 },
      });

      expect(results.successRate).toBe(100);
      expect(mockClient.reset).toHaveBeenCalledTimes(5);
    });
  });
});

describe('createTransferStrategy', () => {
  it('should create a valid transfer strategy', () => {
    const recipient = Keypair.generate().publicKey;
    const strategy = createTransferStrategy(recipient, 1);

    expect(strategy.name).toBe('simple-transfer');
    expect(strategy.description).toContain('Transfer 1 SOL');
  });

  it('should build correct transaction', async () => {
    const recipient = Keypair.generate().publicKey;
    const agent = Keypair.generate();
    const strategy = createTransferStrategy(recipient, 1);

    // Use a valid base58 blockhash format
    const mockConnection = {
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
        lastValidBlockHeight: 1000,
      }),
    };

    const mockSurfpool = {
      getConnection: () => mockConnection,
    } as any;

    const context = {
      agent: agent.publicKey,
      agentKeypair: agent,
      surfpool: mockSurfpool,
      initialBalance: 10 * LAMPORTS_PER_SOL,
      params: {},
    };

    const txs = await strategy.buildTransactions(context);

    expect(txs).toHaveLength(1);
    expect(txs[0].instructions).toHaveLength(1);
  });

  it('should validate positive PnL correctly', () => {
    const strategy = createTransferStrategy(Keypair.generate().publicKey, 1);

    const successResult = {
      success: true,
      pnl: -0.5 * LAMPORTS_PER_SOL,
    } as any;

    const failResult = {
      success: true,
      pnl: -2 * LAMPORTS_PER_SOL,
    } as any;

    expect(strategy.validateResults!(successResult)).toBe(true);
    expect(strategy.validateResults!(failResult)).toBe(false);
  });
});
