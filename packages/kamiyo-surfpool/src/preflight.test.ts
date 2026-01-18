import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PreflightValidator } from './preflight';
import { SurfpoolClient } from './client';

jest.mock('./client');

describe('PreflightValidator', () => {
  let validator: PreflightValidator;
  let mockClient: jest.Mocked<SurfpoolClient>;
  let mockConnection: any;
  const programId = Keypair.generate().publicKey;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      getAccountInfo: jest.fn(),
      getSlot: jest.fn().mockResolvedValue(1000),
      getBlockTime: jest.fn().mockResolvedValue(Date.now() / 1000),
    };

    mockClient = {
      getConnection: jest.fn().mockReturnValue(mockConnection),
      getBalance: jest.fn(),
    } as any;

    validator = new PreflightValidator(mockClient, programId);
  });

  describe('validateAgentCreation', () => {
    const ownerKeypair = Keypair.generate();

    it('should pass validation with sufficient balance', async () => {
      mockClient.getBalance.mockResolvedValue(2 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );

      expect(result.valid).toBe(true);
      // Warning is only added for stake < 1 SOL, but we're staking 1 SOL
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should fail with insufficient balance', async () => {
      mockClient.getBalance.mockResolvedValue(0.05 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should fail with stake below minimum', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(0.01 * LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Stake amount too low');
    });

    it('should fail with invalid name length', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      // Empty name
      let result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: '',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid agent name');

      // Too long name
      result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'A'.repeat(33),
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid agent name');
    });

    it('should fail if agent already exists', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue({
        lamports: 1000000,
        data: Buffer.alloc(100),
        owner: programId,
      });

      const result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Agent already exists');
    });

    it('should include state changes in result', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateAgentCreation(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        ownerKeypair
      );

      expect(result.stateChanges.length).toBeGreaterThan(0);
      expect(result.stateChanges.some(c => c.field === 'created')).toBe(true);
      expect(result.stateChanges.some(c => c.field === 'balance')).toBe(true);
    });
  });

  describe('validateEscrowCreation', () => {
    const agentKeypair = Keypair.generate();
    const provider = Keypair.generate().publicKey;

    it('should pass validation with valid parameters', async () => {
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId }) // Agent exists
        .mockResolvedValueOnce(null) // Config doesn't exist
        .mockResolvedValueOnce(null); // Escrow doesn't exist

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('should fail if agent does not exist', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Agent does not exist');
    });

    it('should fail if protocol is paused', async () => {
      // Agent exists
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        lamports: 1000000,
        data: Buffer.alloc(100),
        owner: programId,
      });

      // Config with paused flag set
      const configData = Buffer.alloc(100);
      configData[8 + 32] = 1; // Paused flag
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        lamports: 1000000,
        data: configData,
        owner: programId,
      });

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol is paused');
    });

    it('should fail with insufficient agent balance', async () => {
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(0.1 * LAMPORTS_PER_SOL);

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(5 * LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient agent balance');
    });

    it('should fail with invalid amount', async () => {
      // Amount too low
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(10000 * LAMPORTS_PER_SOL);

      let result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(100),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid amount');

      // Amount too high - reset mocks
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);

      result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(2000 * LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    it('should fail with invalid time lock', async () => {
      // Time lock too short
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);

      let result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(60),
          transactionId: 'tx-123',
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid time lock');

      // Time lock too long - reset mocks
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);

      result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(60 * 24 * 60 * 60),
          transactionId: 'tx-123',
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid time lock');
    });

    it('should fail with invalid transaction ID', async () => {
      // Empty transaction ID
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);

      let result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: '',
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid transaction ID');

      // Too long transaction ID - reset mocks
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null);

      result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'x'.repeat(65),
        },
        agentKeypair
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid transaction ID');
    });

    it('should fail if escrow already exists', async () => {
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId }); // Escrow exists
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Escrow with this transaction ID already exists');
    });

    it('should warn for short time lock', async () => {
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(10 * LAMPORTS_PER_SOL);

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(3700), // Just over minimum
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Short time lock'))).toBe(true);
    });

    it('should warn for large escrow amount', async () => {
      mockConnection.getAccountInfo
        .mockResolvedValueOnce({ lamports: 1000000, data: Buffer.alloc(100), owner: programId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockClient.getBalance.mockResolvedValue(100 * LAMPORTS_PER_SOL);

      const result = await validator.validateEscrowCreation(
        {
          agent: agentKeypair.publicKey,
          provider,
          amount: new BN(50 * LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Large escrow amount'))).toBe(true);
    });
  });

  describe('validateDispute', () => {
    const agentKeypair = Keypair.generate();

    it('should pass for active escrow within window', async () => {
      const escrowData = Buffer.alloc(200);
      escrowData[8 + 32 + 32 + 8] = 0; // Active status
      const currentTime = Math.floor(Date.now() / 1000);
      const futureTime = BigInt(currentTime + 86400);
      escrowData.writeBigInt64LE(futureTime, 8 + 32 + 32 + 8 + 1 + 8);

      mockConnection.getAccountInfo.mockResolvedValue({
        lamports: 1000000,
        data: escrowData,
        owner: programId,
      });

      // Mock getBlockTime to return current time (before expiry)
      mockConnection.getBlockTime.mockResolvedValue(currentTime);

      const result = await validator.validateDispute(
        {
          agent: agentKeypair.publicKey,
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(true);
    });

    it('should fail if escrow not found', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateDispute(
        {
          agent: agentKeypair.publicKey,
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Escrow not found');
    });

    it('should fail if escrow not active', async () => {
      const escrowData = Buffer.alloc(200);
      escrowData[8 + 32 + 32 + 8] = 1; // Not active

      mockConnection.getAccountInfo.mockResolvedValue({
        lamports: 1000000,
        data: escrowData,
        owner: programId,
      });

      const result = await validator.validateDispute(
        {
          agent: agentKeypair.publicKey,
          transactionId: 'tx-123',
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in active status');
    });
  });

  describe('validateRelease', () => {
    const agentKeypair = Keypair.generate();
    const provider = Keypair.generate().publicKey;

    it('should pass for active escrow', async () => {
      const escrowData = Buffer.alloc(200);
      escrowData[8 + 32 + 32 + 8] = 0; // Active status
      escrowData.writeBigUInt64LE(BigInt(LAMPORTS_PER_SOL), 8 + 32 + 32);

      mockConnection.getAccountInfo.mockResolvedValue({
        lamports: 1000000,
        data: escrowData,
        owner: programId,
      });

      const result = await validator.validateRelease(
        {
          agent: agentKeypair.publicKey,
          transactionId: 'tx-123',
          provider,
        },
        agentKeypair
      );

      expect(result.valid).toBe(true);
      expect(result.stateChanges.length).toBeGreaterThan(0);
    });

    it('should fail if escrow not found', async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateRelease(
        {
          agent: agentKeypair.publicKey,
          transactionId: 'tx-123',
          provider,
        },
        agentKeypair
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Escrow not found');
    });
  });

  describe('validateFullFlow', () => {
    it('should validate complete flow', async () => {
      const ownerKeypair = Keypair.generate();
      const provider = Keypair.generate().publicKey;

      mockClient.getBalance.mockResolvedValue(100 * LAMPORTS_PER_SOL);
      mockConnection.getAccountInfo.mockResolvedValue(null);

      const result = await validator.validateFullFlow(
        {
          owner: ownerKeypair.publicKey,
          name: 'TestAgent',
          agentType: 1,
          stakeAmount: new BN(LAMPORTS_PER_SOL),
        },
        {
          provider,
          amount: new BN(LAMPORTS_PER_SOL),
          timeLockSeconds: new BN(86400),
          transactionId: 'tx-123',
        },
        ownerKeypair
      );

      expect(result.agentCreation.valid).toBe(true);
      expect(result.totalCost).toBeGreaterThan(0);
    });
  });
});
