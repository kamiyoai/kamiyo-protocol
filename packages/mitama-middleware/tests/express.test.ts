import { Request, Response } from 'express';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { MitamaPaymentMiddleware, getEscrowInfo } from '../src/express';

describe('MitamaPaymentMiddleware', () => {
  const mockProgramId = Keypair.generate().publicKey;
  const mockConnection = {
    getAccountInfo: jest.fn()
  } as any as Connection;

  const createMockRequest = (paymentProof?: string): any => ({
    headers: paymentProof ? { 'x-payment-proof': paymentProof } : {}
  });

  const createMockResponse = (): any => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Payment Required (402)', () => {
    it('returns 402 when no payment proof provided', async () => {
      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001,
        qualityGuarantee: true
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'WWW-Authenticate': 'Solana realm="test-api"',
        'X-Price': '0.001 SOL',
        'X-Quality-Guarantee': 'true'
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Payment Required',
        amount: 0.001,
        currency: 'SOL',
        quality_guarantee: true
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('includes payment flow instructions in response', async () => {
      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        payment_flow: expect.objectContaining({
          step_1: expect.stringContaining('Create escrow'),
          step_2: expect.stringContaining('X-Payment-Proof'),
          step_3: expect.stringContaining('quality score'),
          step_4: expect.stringContaining('dispute')
        })
      }));
    });
  });

  describe('Payment Verification', () => {
    it('accepts valid escrow proof', async () => {
      const validEscrow = Keypair.generate().publicKey;
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        owner: mockProgramId,
        lamports: 1000000,
        data: Buffer.from([]),
        executable: false,
        rentEpoch: 0
      });

      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest(validEscrow.toString());
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(validEscrow);
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('attaches escrow info to request', async () => {
      const validEscrow = Keypair.generate().publicKey;
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        owner: mockProgramId,
        lamports: 1000000,
        data: Buffer.from([]),
        executable: false,
        rentEpoch: 0
      });

      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest(validEscrow.toString());
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(req.escrow).toBeDefined();
      expect(req.escrow.pubkey.toString()).toBe(validEscrow.toString());
      expect(req.escrow.amount).toBe(0.001);
    });

    it('rejects non-existent escrow account', async () => {
      const invalidEscrow = Keypair.generate().publicKey;
      mockConnection.getAccountInfo.mockResolvedValueOnce(null);

      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest(invalidEscrow.toString());
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid Payment',
        message: 'Escrow account not found'
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects escrow owned by wrong program', async () => {
      const validEscrow = Keypair.generate().publicKey;
      const wrongOwner = Keypair.generate().publicKey;

      mockConnection.getAccountInfo.mockResolvedValueOnce({
        owner: wrongOwner,
        lamports: 1000000,
        data: Buffer.from([]),
        executable: false,
        rentEpoch: 0
      });

      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest(validEscrow.toString());
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid Payment',
        message: 'Escrow not owned by expected program',
        expected_program: mockProgramId.toString(),
        actual_owner: wrongOwner.toString()
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects invalid public key format', async () => {
      const middleware = MitamaPaymentMiddleware({
        realm: 'test-api',
        programId: mockProgramId,
        connection: mockConnection,
        price: 0.001
      });

      const req = createMockRequest('invalid-pubkey');
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Payment Verification Failed'
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('getEscrowInfo', () => {
    it('returns escrow info from request', () => {
      const escrowPubkey = Keypair.generate().publicKey;
      const req: any = {
        escrow: {
          pubkey: escrowPubkey,
          amount: 0.001,
          provider: mockProgramId,
          consumer: escrowPubkey
        }
      };

      const info = getEscrowInfo(req);

      expect(info).toBeDefined();
      expect(info?.pubkey).toBe(escrowPubkey);
      expect(info?.amount).toBe(0.001);
    });

    it('returns undefined when no escrow attached', () => {
      const req: any = {};
      const info = getEscrowInfo(req);
      expect(info).toBeUndefined();
    });
  });
});
