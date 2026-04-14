import { Keypair } from '@solana/web3.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateEscrowCreation: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../surfpool-preflight', () => ({
  preflightService: {
    validateEscrowCreation: mocks.validateEscrowCreation,
  },
}));

vi.mock('../logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

describe('enforceEscrowCreationPreflight', () => {
  beforeEach(() => {
    mocks.validateEscrowCreation.mockReset();
    mocks.loggerWarn.mockReset();
  });

  it('fails open when the Surfpool backend is unavailable', async () => {
    const agent = Keypair.generate().publicKey;
    const counterparty = Keypair.generate().publicKey;
    mocks.validateEscrowCreation.mockResolvedValue({
      success: false,
      simulationSuccess: false,
      computeUnits: 0,
      logs: [],
      error: 'Surfpool RPC call failed after retries',
    });

    const { enforceEscrowCreationPreflight } = await import('../surfpool-gate');

    await expect(
      enforceEscrowCreationPreflight({
        label: 'initializeEscrow',
        agent,
        counterparty,
        amountLamports: 1_000_000,
      })
    ).resolves.toBeUndefined();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Surfpool unavailable during initializeEscrow; continuing without escrow preflight',
      { counterparty: counterparty.toBase58() }
    );
  });

  it('still rejects real escrow validation failures', async () => {
    const agent = Keypair.generate().publicKey;
    const counterparty = Keypair.generate().publicKey;
    mocks.validateEscrowCreation.mockResolvedValue({
      success: false,
      simulationSuccess: false,
      computeUnits: 0,
      logs: [],
      error: 'Amount must be positive',
    });

    const { enforceEscrowCreationPreflight } = await import('../surfpool-gate');

    await expect(
      enforceEscrowCreationPreflight({
        label: 'initializeEscrow',
        agent,
        counterparty,
        amountLamports: 0,
      })
    ).rejects.toThrow('Surfpool preflight rejected initializeEscrow: Amount must be positive');
  });
});
