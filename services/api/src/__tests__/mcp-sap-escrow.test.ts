import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

const preparePayment = vi.hoisted(() => vi.fn());
const buildPaymentHeaders = vi.hoisted(() => vi.fn());
const fetchByPda = vi.hoisted(() => vi.fn());
const getBalance = vi.hoisted(() => vi.fn());
const loadSolanaKeypair = vi.hoisted(() => vi.fn());
const resolveSolanaRpcUrl = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock('@oobe-protocol-labs/synapse-sap-sdk', () => ({
  SapConnection: {
    detectCluster: vi.fn(() => 'mainnet-beta'),
    fromKeypair: vi.fn((_rpcUrl: string, _keypair: unknown, opts?: { cluster?: string }) => ({
      cluster: opts?.cluster ?? 'mainnet-beta',
      client: {
        x402: {
          preparePayment,
          buildPaymentHeaders,
          getBalance,
        },
        escrow: {
          fetchByPda,
        },
      },
    })),
  },
}));

vi.mock('../solana-keypair', () => ({
  loadSolanaKeypair,
}));

vi.mock('../solana', () => ({
  resolveSolanaRpcUrl,
}));

vi.mock('../logger', () => ({
  logger: {
    error: loggerError,
  },
}));

describe('SAP escrow MCP helpers', () => {
  const previousAgentKeypair = process.env.SAP_AGENT_KEYPAIR;
  const previousAllowedApis = process.env.SAP_ESCROW_ALLOWED_APIS;
  const previousMaxAmount = process.env.SAP_ESCROW_MAX_AMOUNT_SOL;

  beforeEach(() => {
    const keypair = Keypair.generate();
    process.env.SAP_AGENT_KEYPAIR = 'sap-secret';
    process.env.SAP_ESCROW_ALLOWED_APIS = keypair.publicKey.toBase58();
    process.env.SAP_ESCROW_MAX_AMOUNT_SOL = '0.25';

    loadSolanaKeypair.mockReturnValue({ publicKey: Keypair.generate().publicKey });
    resolveSolanaRpcUrl.mockReturnValue('https://rpc.example');
    preparePayment.mockReset();
    buildPaymentHeaders.mockReset();
    fetchByPda.mockReset();
    getBalance.mockReset();
    loggerError.mockReset();
  });

  afterEach(() => {
    vi.resetModules();

    if (previousAgentKeypair === undefined) {
      delete process.env.SAP_AGENT_KEYPAIR;
    } else {
      process.env.SAP_AGENT_KEYPAIR = previousAgentKeypair;
    }

    if (previousAllowedApis === undefined) {
      delete process.env.SAP_ESCROW_ALLOWED_APIS;
    } else {
      process.env.SAP_ESCROW_ALLOWED_APIS = previousAllowedApis;
    }

    if (previousMaxAmount === undefined) {
      delete process.env.SAP_ESCROW_MAX_AMOUNT_SOL;
    } else {
      process.env.SAP_ESCROW_MAX_AMOUNT_SOL = previousMaxAmount;
    }
  });

  it('creates SAP escrows with the server wallet as depositor', async () => {
    const apiWallet = Keypair.generate().publicKey;
    const escrowPda = Keypair.generate().publicKey;
    const agentPda = Keypair.generate().publicKey;
    const depositor = Keypair.generate().publicKey;

    process.env.SAP_ESCROW_ALLOWED_APIS = apiWallet.toBase58();

    preparePayment.mockResolvedValue({
      escrowPda,
      agentPda,
      agentWallet: apiWallet,
      depositorWallet: depositor,
      pricePerCall: new BN(1388),
      maxCalls: new BN(0),
      txSignature: 'sig-1',
    });
    buildPaymentHeaders.mockReturnValue({
      'X-Payment-Protocol': 'SAP-x402',
      'X-Payment-Escrow': escrowPda.toBase58(),
      'X-Payment-Agent': agentPda.toBase58(),
      'X-Payment-Depositor': depositor.toBase58(),
      'X-Payment-MaxCalls': '0',
      'X-Payment-PricePerCall': '1388',
      'X-Payment-Program': Keypair.generate().publicKey.toBase58(),
      'X-Payment-Network': 'mainnet-beta',
    });

    const { createSapEscrow } = await import('../mcp/sap-escrow');
    const result = await createSapEscrow({
      api: apiWallet.toBase58(),
      amount: 0.001,
      timeLock: 3600,
    });

    expect(result).toMatchObject({
      success: true,
      escrowAddress: escrowPda.toBase58(),
      transactionId: escrowPda.toBase58(),
      signature: 'sig-1',
      api: apiWallet.toBase58(),
      agent: agentPda.toBase58(),
      depositor: depositor.toBase58(),
      pricePerCall: '1388',
      maxCalls: '0',
    });
    expect(preparePayment).toHaveBeenCalledWith(
      apiWallet,
      expect.objectContaining({
        pricePerCall: 1388,
        maxCalls: 0,
        deposit: 1_000_000,
      })
    );
  });

  it('reads SAP escrow status by PDA', async () => {
    const escrowPda = Keypair.generate().publicKey;
    const agentPda = Keypair.generate().publicKey;
    const apiWallet = Keypair.generate().publicKey;
    const depositor = Keypair.generate().publicKey;

    fetchByPda.mockResolvedValue({
      bump: 255,
      agent: agentPda,
      depositor,
      agentWallet: apiWallet,
      balance: new BN(500_000),
      totalDeposited: new BN(1_000_000),
      totalSettled: new BN(500_000),
      totalCallsSettled: new BN(2),
      pricePerCall: new BN(1388),
      maxCalls: new BN(0),
      createdAt: new BN(100),
      lastSettledAt: new BN(101),
      expiresAt: new BN(200),
      volumeCurve: [],
      tokenMint: null,
      tokenDecimals: 9,
    });
    getBalance.mockResolvedValue({
      balance: new BN(500_000),
      totalDeposited: new BN(1_000_000),
      totalSettled: new BN(500_000),
      totalCallsSettled: new BN(2),
      callsRemaining: 360,
      isExpired: false,
      affordableCalls: 360,
    });

    const { checkSapEscrowStatus } = await import('../mcp/sap-escrow');
    const result = await checkSapEscrowStatus({ escrowAddress: escrowPda.toBase58() });

    expect(result).toMatchObject({
      success: true,
      status: 'active',
      escrowAddress: escrowPda.toBase58(),
      transactionId: escrowPda.toBase58(),
      agent: agentPda.toBase58(),
      api: apiWallet.toBase58(),
      depositor: depositor.toBase58(),
      amount: 0.001,
      callsRemaining: 360,
      affordableCalls: 360,
      isExpired: false,
    });
    expect(fetchByPda).toHaveBeenCalledWith(escrowPda);
    expect(getBalance).toHaveBeenCalledWith(apiWallet, depositor);
  });

  it('rejects legacy transaction ids that are not escrow PDAs', async () => {
    const { checkSapEscrowStatus } = await import('../mcp/sap-escrow');
    const result = await checkSapEscrowStatus({ transactionId: 'tx-123' });

    expect(result).toEqual({
      success: false,
      error: 'escrowAddress must be a valid escrow PDA; transactionId is only a deprecated alias for the same value',
    });
  });
});
