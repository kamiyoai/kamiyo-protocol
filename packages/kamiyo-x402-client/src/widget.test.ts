import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PaymentWidget, createPaymentButton, PaymentState } from './widget';

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

jest.mock('./client', () => ({
  X402KamiyoClient: jest.fn().mockImplementation(() => ({
    createEscrow: jest.fn().mockResolvedValue({
      success: true, signature: 'escrow-sig',
      escrowPda: new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),
      transactionId: 'tx-123', amount: 0.1,
    }),
    releaseEscrow: jest.fn().mockResolvedValue({ success: true, signature: 'release-sig' }),
    disputeEscrow: jest.fn().mockResolvedValue({ success: true, signature: 'dispute-sig' }),
  })),
}));

describe('PaymentWidget', () => {
  const wallet = Keypair.generate();
  const provider = Keypair.generate().publicKey;
  const conn = { sendRawTransaction: jest.fn(), confirmTransaction: jest.fn() } as unknown as Connection;

  const make = (opts: Partial<{ amount: number; useEscrow: boolean }> = {}) =>
    new PaymentWidget({ connection: conn, wallet, programId: PROGRAM_ID, provider, amount: opts.amount ?? 0.1, useEscrow: opts.useEscrow ?? true });

  test('idle on init', () => expect(make().getState().status).toBe('idle'));

  test('subscribe', async () => {
    const w = make();
    const states: PaymentState[] = [];
    w.subscribe(s => states.push({ ...s }));
    await w.pay();
    expect(states.some(s => s.status === 'processing')).toBe(true);
    expect(states.some(s => s.status === 'completed')).toBe(true);
  });

  test('unsubscribe', async () => {
    const w = make();
    const states: PaymentState[] = [];
    w.subscribe(s => states.push({ ...s }))();
    await w.pay();
    expect(states).toHaveLength(0);
  });

  test('pay', async () => {
    const w = make();
    const r = await w.pay();
    expect(r.success).toBe(true);
    expect(r.signature).toBe('escrow-sig');
    expect(w.getState().status).toBe('completed');
  });

  test('rejects concurrent pay', async () => {
    const w = make();
    const p = w.pay();
    await expect(w.pay()).rejects.toThrow('in progress');
    await p;
  });

  test('release', async () => {
    const w = make();
    await expect(w.release()).rejects.toThrow('no escrow');
    await w.pay();
    const r = await w.release();
    expect(r.success).toBe(true);
    expect(r.signature).toBe('release-sig');
  });

  test('dispute', async () => {
    const w = make();
    await expect(w.dispute()).rejects.toThrow('no escrow');
    await w.pay();
    const r = await w.dispute();
    expect(r.success).toBe(true);
    expect(r.signature).toBe('dispute-sig');
  });

  test('reset', async () => {
    const w = make();
    await w.pay();
    const states: PaymentState[] = [];
    w.subscribe(s => states.push({ ...s }));
    w.reset();
    expect(w.getState().status).toBe('idle');
    expect(states[0].status).toBe('idle');
  });

  test('onComplete', async () => {
    const cb = jest.fn();
    const w = new PaymentWidget({ connection: conn, wallet, programId: PROGRAM_ID, provider, amount: 0.1, useEscrow: true, onComplete: cb });
    await w.pay();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('createPaymentButton', () => {
  test('html + widget', () => {
    const { html, widget } = createPaymentButton({
      connection: {} as Connection,
      wallet: Keypair.generate(),
      programId: new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),
      provider: Keypair.generate().publicKey,
      amount: 0.5,
    });
    expect(html).toContain('Pay 0.5 SOL');
    expect(widget).toBeInstanceOf(PaymentWidget);
  });
});
