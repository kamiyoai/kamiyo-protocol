import { Keypair, PublicKey } from '@solana/web3.js';
import {
  signPaymentMessage,
  verifyPaymentSignature,
  generateNonce,
  createSignedPayment,
  serializeForSigning,
  createPaymentHeader,
  parsePaymentHeader,
  decodePaymentHeader,
  verifyPaymentHeader,
  isPaymentFresh,
  createEscrowProofHeader,
  PaymentSigner,
  createPaymentSigner,
} from './signing';

describe('signing', () => {
  let wallet: Keypair;

  beforeEach(() => {
    wallet = Keypair.generate();
  });

  describe('signPaymentMessage', () => {
    it('creates a signature', () => {
      const message = new TextEncoder().encode('test message');
      const signature = signPaymentMessage(wallet, message);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);
    });
  });

  describe('verifyPaymentSignature', () => {
    it('verifies valid signature', () => {
      const message = new TextEncoder().encode('test message');
      const signature = signPaymentMessage(wallet, message);
      expect(verifyPaymentSignature(wallet.publicKey, message, signature)).toBe(true);
    });

    it('rejects invalid signature', () => {
      const message = new TextEncoder().encode('test message');
      const signature = signPaymentMessage(wallet, message);
      const differentMessage = new TextEncoder().encode('different message');
      expect(verifyPaymentSignature(wallet.publicKey, differentMessage, signature)).toBe(false);
    });

    it('rejects signature from different key', () => {
      const message = new TextEncoder().encode('test message');
      const signature = signPaymentMessage(wallet, message);
      const otherWallet = Keypair.generate();
      expect(verifyPaymentSignature(otherWallet.publicKey, message, signature)).toBe(false);
    });
  });

  describe('generateNonce', () => {
    it('generates unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('generates hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('createSignedPayment', () => {
    it('creates payment with all fields', () => {
      const payment = createSignedPayment(
        wallet,
        'tx-signature-123',
        'https://api.example.com/resource',
        1000000
      );

      expect(payment.signature).toBe('tx-signature-123');
      expect(payment.payer).toBe(wallet.publicKey.toBase58());
      expect(payment.resource).toBe('https://api.example.com/resource');
      expect(payment.amount).toBe('1000000');
      expect(payment.timestamp).toBeLessThanOrEqual(Date.now());
      expect(payment.nonce).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('serializeForSigning', () => {
    it('produces canonical JSON', () => {
      const payment = {
        signature: 'sig',
        payer: 'payer',
        timestamp: 12345,
        nonce: 'nonce',
        resource: 'resource',
        amount: '100',
      };

      const serialized = new TextDecoder().decode(serializeForSigning(payment));
      const parsed = JSON.parse(serialized);

      // Keys should be sorted
      const keys = Object.keys(parsed);
      expect(keys).toEqual(['amount', 'nonce', 'payer', 'resource', 'signature', 'timestamp']);
    });
  });

  describe('createPaymentHeader', () => {
    it('creates valid header format', () => {
      const payment = createSignedPayment(wallet, 'sig123', 'resource', 1000);
      const header = createPaymentHeader(payment, wallet);

      expect(header).toMatch(/^solana:solana:mainnet:/);
    });

    it('creates parseable header', () => {
      const payment = createSignedPayment(wallet, 'sig123', 'resource', 1000);
      const header = createPaymentHeader(payment, wallet);

      const decoded = decodePaymentHeader(header);
      expect(decoded).not.toBeNull();
      expect(decoded?.signature).toBe('sig123');
      expect(decoded?.payer).toBe(wallet.publicKey.toBase58());
    });
  });

  describe('parsePaymentHeader', () => {
    it('parses valid header', () => {
      const header = 'solana:mainnet:base64payload';
      const components = parsePaymentHeader(header);

      expect(components).toEqual({
        scheme: 'solana',
        network: 'mainnet',
        payload: 'base64payload',
      });
    });

    it('handles network with colons', () => {
      const header = 'solana:solana:mainnet-beta:base64payload';
      const components = parsePaymentHeader(header);

      expect(components).toEqual({
        scheme: 'solana',
        network: 'solana:mainnet-beta',
        payload: 'base64payload',
      });
    });

    it('returns null for invalid header', () => {
      expect(parsePaymentHeader('invalid')).toBeNull();
      expect(parsePaymentHeader('only:two')).toBeNull();
    });
  });

  describe('verifyPaymentHeader', () => {
    it('verifies valid header', () => {
      const payment = createSignedPayment(wallet, 'sig123', 'resource', 1000);
      const header = createPaymentHeader(payment, wallet);

      expect(verifyPaymentHeader(header)).toBe(true);
    });

    it('rejects tampered header', () => {
      const payment = createSignedPayment(wallet, 'sig123', 'resource', 1000);
      const header = createPaymentHeader(payment, wallet);

      // Decode, modify, re-encode
      const decoded = decodePaymentHeader(header);
      if (decoded) {
        decoded.amount = '999999';
        const components = parsePaymentHeader(header)!;
        const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64');
        const tamperedHeader = `${components.scheme}:${components.network}:${tamperedPayload}`;
        expect(verifyPaymentHeader(tamperedHeader)).toBe(false);
      }
    });

    it('rejects invalid header format', () => {
      expect(verifyPaymentHeader('invalid')).toBe(false);
    });
  });

  describe('isPaymentFresh', () => {
    it('accepts fresh payment', () => {
      const payment = createSignedPayment(wallet, 'sig', 'resource', 1000);
      expect(isPaymentFresh(payment)).toBe(true);
    });

    it('accepts payment within max age', () => {
      const payment = createSignedPayment(wallet, 'sig', 'resource', 1000);
      payment.timestamp = Date.now() - 60000; // 1 minute ago
      expect(isPaymentFresh(payment, 120000)).toBe(true);
    });

    it('rejects expired payment', () => {
      const payment = createSignedPayment(wallet, 'sig', 'resource', 1000);
      payment.timestamp = Date.now() - 600000; // 10 minutes ago
      expect(isPaymentFresh(payment, 300000)).toBe(false);
    });

    it('rejects future payment', () => {
      const payment = createSignedPayment(wallet, 'sig', 'resource', 1000);
      payment.timestamp = Date.now() + 60000; // 1 minute in future
      expect(isPaymentFresh(payment)).toBe(false);
    });
  });

  describe('createEscrowProofHeader', () => {
    it('creates escrow proof header', () => {
      const escrowPda = Keypair.generate().publicKey;
      const transactionId = 'tx-12345';

      const header = createEscrowProofHeader(escrowPda, transactionId, wallet);

      expect(header).toMatch(/^mitama:escrow:/);
    });

    it('contains escrow info', () => {
      const escrowPda = Keypair.generate().publicKey;
      const transactionId = 'tx-12345';

      const header = createEscrowProofHeader(escrowPda, transactionId, wallet);

      // Parse the base64 payload
      const parts = header.split(':');
      const payload = JSON.parse(Buffer.from(parts[2], 'base64').toString('utf-8'));

      expect(payload.escrowPda).toBe(escrowPda.toBase58());
      expect(payload.transactionId).toBe(transactionId);
      expect(payload.agent).toBe(wallet.publicKey.toBase58());
      expect(payload.signature).toBeDefined();
    });
  });

  describe('PaymentSigner', () => {
    it('creates signer', () => {
      const signer = createPaymentSigner(wallet);
      expect(signer.getPublicKey().equals(wallet.publicKey)).toBe(true);
    });

    describe('signPayment', () => {
      it('creates verifiable payment header', () => {
        const signer = new PaymentSigner(wallet);
        const header = signer.signPayment('sig123', 'resource', 1000);

        expect(verifyPaymentHeader(header)).toBe(true);
      });
    });

    describe('signEscrowProof', () => {
      it('creates escrow proof', () => {
        const signer = new PaymentSigner(wallet);
        const escrowPda = Keypair.generate().publicKey;

        const header = signer.signEscrowProof(escrowPda, 'tx-123');

        expect(header).toMatch(/^mitama:escrow:/);
      });
    });
  });
});
