import { Keypair, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preflightService } from '../surfpool-preflight';

describe('preflightService transaction simulation', () => {
  const service = preflightService as any;
  const simulateTransaction = service.surfpoolConnection.simulateTransaction;

  afterEach(() => {
    service.surfpoolConnection.simulateTransaction = simulateTransaction;
    vi.restoreAllMocks();
  });

  it('simulates legacy transactions without the versioned config overload', async () => {
    const tx = new Transaction();
    service.surfpoolConnection.simulateTransaction = vi.fn().mockResolvedValue({
      value: {
        err: null,
        logs: ['ok'],
        unitsConsumed: 123,
      },
    });

    const result = await service.simulateTransaction(tx);

    expect(result).toEqual({
      success: true,
      computeUnits: 123,
      logs: ['ok'],
      error: undefined,
    });
    expect(service.surfpoolConnection.simulateTransaction).toHaveBeenCalledWith(tx);
  });

  it('simulates versioned transactions with confirmed commitment', async () => {
    const payer = Keypair.generate().publicKey;
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: '11111111111111111111111111111111',
        instructions: [],
      }).compileToV0Message()
    );
    service.surfpoolConnection.simulateTransaction = vi.fn().mockResolvedValue({
      value: {
        err: null,
        logs: ['ok'],
        unitsConsumed: 456,
      },
    });

    const result = await service.simulateTransaction(tx);

    expect(result).toEqual({
      success: true,
      computeUnits: 456,
      logs: ['ok'],
      error: undefined,
    });
    expect(service.surfpoolConnection.simulateTransaction).toHaveBeenCalledWith(tx, {
      commitment: 'confirmed',
    });
  });
});
