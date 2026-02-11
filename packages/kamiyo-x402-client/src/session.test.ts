import {
  createSessionPaymentHeader,
  generateSessionNonce,
  parseSessionPaymentHeader,
  withSessionPaymentHeaders,
} from './session';

describe('session payments', () => {
  it('generates url-safe nonces', () => {
    const nonce = generateSessionNonce();
    expect(nonce.length).toBeGreaterThan(10);
    expect(/^[a-f0-9]+$/i.test(nonce)).toBe(true);
  });

  it('creates and parses session payment headers', () => {
    const token = 'aGVsbG93b3JsZA';
    const header = createSessionPaymentHeader({
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      token,
      nonce: 'n123',
    });
    expect(header).toBe(`session:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${token}.n123`);

    const parsed = parseSessionPaymentHeader(header);
    expect(parsed).toEqual({
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      token,
      nonce: 'n123',
    });
  });

  it('attaches session header as payment headers', () => {
    const header = createSessionPaymentHeader({
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      token: 'abc',
      nonce: 'n1',
    });

    const headers = withSessionPaymentHeaders(header, { Accept: 'application/json' });
    expect(headers['PAYMENT-SIGNATURE']).toBe(header);
    expect(headers['X-PAYMENT']).toBe(header);
    expect(headers['X-PAYMENT-SIGNATURE']).toBe(header);
    expect(headers['Accept']).toBe('application/json');
  });
});

