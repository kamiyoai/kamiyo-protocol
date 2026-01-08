import { Connection, Keypair, MessageV0, VersionedTransaction } from '@solana/web3.js';
import { JupiterSwap, payWithAnyToken, SOL_MINT, USDC_MINT } from './jupiter';

const mockQuote = { inputMint: 'TokenA', outputMint: SOL_MINT, inputAmount: '1000000', outputAmount: '500000', priceImpactPct: '0.1' };

function mockTx(signer: Keypair) {
  const msg = new MessageV0({
    header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
    staticAccountKeys: [signer.publicKey],
    recentBlockhash: '11111111111111111111111111111111',
    compiledInstructions: [],
    addressTableLookups: [],
  });
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString('base64');
}

global.fetch = jest.fn();

describe('JupiterSwap', () => {
  const wallet = Keypair.generate();
  const swapTx = mockTx(wallet);
  const conn = {
    sendRawTransaction: jest.fn().mockResolvedValue('sig-123'),
    confirmTransaction: jest.fn().mockResolvedValue({}),
  } as unknown as Connection;

  beforeEach(() => jest.clearAllMocks());

  const make = (opts: Partial<{ slippageBps: number; priorityFee: number }> = {}) =>
    new JupiterSwap({ connection: conn, wallet, ...opts });

  test('defaults', () => {
    const j = make();
    expect((j as any).slippageBps).toBe(50);
    expect((j as any).priorityFee).toBe(0);
  });

  test('custom config', () => {
    const j = make({ slippageBps: 100, priorityFee: 5000 });
    expect((j as any).slippageBps).toBe(100);
    expect((j as any).priorityFee).toBe(5000);
  });

  test('quote ok', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) });
    expect(await make().quote('TokenA', SOL_MINT, 1e6)).toEqual(mockQuote);
  });

  test('quote api fail', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    expect(await make().quote('TokenA', SOL_MINT, 1e6)).toBeNull();
  });

  test('quote network fail', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('net'));
    expect(await make().quote('TokenA', SOL_MINT, 1e6)).toBeNull();
  });

  test('swap quote fail', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    const r = await make().swap('TokenA', SOL_MINT, 1e6);
    expect(r.success).toBe(false);
    expect(r.error).toBe('quote failed');
  });

  test('swap request fail', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) })
      .mockResolvedValueOnce({ ok: false });
    const r = await make().swap('TokenA', SOL_MINT, 1e6);
    expect(r.success).toBe(false);
    expect(r.error).toBe('swap request failed');
  });

  test('swap ok', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ swapTransaction: swapTx }) });
    const r = await make().swap('TokenA', SOL_MINT, 1e6);
    expect(r.success).toBe(true);
    expect(r.signature).toBe('sig-123');
    expect(r.outputAmount).toBe(500000);
  });

  test('swap tx fail', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ swapTransaction: swapTx }) });
    (conn.sendRawTransaction as jest.Mock).mockRejectedValueOnce(new Error('tx failed'));
    const r = await make().swap('TokenA', SOL_MINT, 1e6);
    expect(r.success).toBe(false);
    expect(r.error).toBe('tx failed');
  });

  test('toSol', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ swapTransaction: swapTx }) });
    expect((await make().toSol('TokenA', 1e6)).success).toBe(true);
  });

  test('toUsdc', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockQuote, outputMint: USDC_MINT }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ swapTransaction: swapTx }) });
    expect((await make().toUsdc('TokenA', 1e6)).success).toBe(true);
  });
});

describe('payWithAnyToken', () => {
  const wallet = Keypair.generate();
  const recipient = Keypair.generate().publicKey;

  beforeEach(() => jest.clearAllMocks());

  test('fails on bad quote', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    const r = await payWithAnyToken({ connection: {} as Connection, wallet }, 'TokenA', 1e6, recipient);
    expect(r.success).toBe(false);
    expect(r.error).toBe('quote failed');
  });

  test('preserves sig on transfer fail', async () => {
    const swapTx = mockTx(wallet);
    const conn = {
      sendRawTransaction: jest.fn().mockResolvedValue('swap-sig'),
      confirmTransaction: jest.fn().mockResolvedValue({}),
    } as unknown as Connection;
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockQuote) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ swapTransaction: swapTx }) });
    const r = await payWithAnyToken({ connection: conn, wallet }, 'TokenA', 1e6, recipient);
    expect(r.signature).toBe('swap-sig');
    expect(r.outputAmount).toBe(500000);
  });
});
