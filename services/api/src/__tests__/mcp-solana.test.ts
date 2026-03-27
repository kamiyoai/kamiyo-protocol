import { Keypair, SystemProgram } from '@solana/web3.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceEscrowCreationPreflight: vi.fn(),
  enforceSurfpoolPreflight: vi.fn(),
  attachTelemetry: vi.fn(() => null),
}));

vi.mock('../surfpool-gate', () => ({
  enforceEscrowCreationPreflight: mocks.enforceEscrowCreationPreflight,
  enforceSurfpoolPreflight: mocks.enforceSurfpoolPreflight,
}));

vi.mock('../telemetry', () => ({
  _attachTelemetry: mocks.attachTelemetry,
  _padAmount: (value: number) => value,
}));

describe('X402Program.initializeEscrow', () => {
  beforeEach(() => {
    mocks.enforceEscrowCreationPreflight.mockReset();
    mocks.enforceEscrowCreationPreflight.mockResolvedValue(undefined);
    mocks.enforceSurfpoolPreflight.mockReset();
    mocks.attachTelemetry.mockReset();
    mocks.attachTelemetry.mockReturnValue(null);
  });

  it('uses escrow-specific preflight instead of generic transaction simulation', async () => {
    const { X402Program } = await import('../mcp/solana');
    const agent = Keypair.generate().publicKey;
    const api = Keypair.generate().publicKey;
    const protocolConfig = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const escrow = Keypair.generate().publicKey;

    const builder = {
      preInstructions: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockResolvedValue('sig-1'),
      transaction: vi.fn(() => {
        throw new Error('initializeEscrow should not use generic transaction preflight');
      }),
    };

    const fakeProgram = {
      wallet: { publicKey: agent },
      pda: {
        deriveProtocolConfigPDA: vi.fn(() => [protocolConfig, 255] as const),
        deriveTreasuryPDA: vi.fn(() => [treasury, 255] as const),
        deriveEscrowPDAs: vi.fn(() => [[escrow, 255] as const]),
      },
      instruction: vi.fn(() => ({ args: [{}, {}, {}, {}] })),
      buildMethod: vi.fn(() => ({ name: 'initializeEscrow' })),
      attachAccounts: vi.fn(() => builder),
      isSeedsMismatch: vi.fn(() => false),
      runEscrowCreationPreflight: X402Program.prototype['runEscrowCreationPreflight'],
    };

    const result = await X402Program.prototype.initializeEscrow.call(fakeProgram as any, {
      api,
      amount: 1_500_000,
      timeLock: 3600,
      transactionId: 'tx-1',
    });

    expect(mocks.enforceEscrowCreationPreflight).toHaveBeenCalledWith({
      label: 'initializeEscrow',
      agent,
      counterparty: api,
      amountLamports: 1_500_000,
      tokenMint: SystemProgram.programId,
    });
    expect(mocks.enforceSurfpoolPreflight).not.toHaveBeenCalled();
    expect(builder.transaction).not.toHaveBeenCalled();
    expect(builder.rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ signature: 'sig-1', escrowPDA: escrow });
  });
});
