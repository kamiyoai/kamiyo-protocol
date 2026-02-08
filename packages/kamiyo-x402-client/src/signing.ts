import { Keypair, PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';

let nonceCounter = 0;

export interface SignedPayment {
  signature: string;
  payer: string;
  timestamp: number;
  nonce: string;
  resource: string;
  amount: string;
}

export interface X402PaymentComponents {
  scheme: string;
  network: string;
  payload: string;
}

export function signPaymentMessage(wallet: Keypair, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, wallet.secretKey);
}

export function verifyPaymentSignature(publicKey: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
}

export function generateNonce(): string {
  const counter = (++nonceCounter % 0xffff).toString(16).padStart(4, '0');
  const random = Buffer.from(nacl.randomBytes(12)).toString('hex');
  const ts = Date.now().toString(16);
  return `${counter}${random}${ts}`;
}

export function createSignedPayment(
  wallet: Keypair,
  transactionSignature: string,
  resource: string,
  amount: number | string
): SignedPayment {
  const timestamp = Date.now();
  const nonce = generateNonce();
  const normalizedAmount =
    typeof amount === 'number'
      ? Number.isFinite(amount) && amount > 0
        ? amount.toString()
        : null
      : typeof amount === 'string' && amount.trim().length > 0
        ? amount.trim()
        : null;

  if (!normalizedAmount) {
    throw new Error('Invalid payment amount');
  }

  return {
    signature: transactionSignature,
    payer: wallet.publicKey.toBase58(),
    timestamp,
    nonce,
    resource,
    amount: normalizedAmount,
  };
}

export function serializeForSigning(payment: Omit<SignedPayment, 'signature'> & { signature?: string }): Uint8Array {
  const canonical = JSON.stringify({
    amount: payment.amount,
    nonce: payment.nonce,
    payer: payment.payer,
    resource: payment.resource,
    signature: payment.signature || '',
    timestamp: payment.timestamp,
  });
  return new TextEncoder().encode(canonical);
}

export function createPaymentHeader(
  payment: SignedPayment,
  wallet: Keypair,
  network: string = 'solana:mainnet'
): string {
  const message = serializeForSigning(payment);
  const authSignature = signPaymentMessage(wallet, message);
  const authSignatureBase64 = Buffer.from(authSignature).toString('base64');
  const payload = {
    ...payment,
    authSignature: authSignatureBase64,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `solana:${network}:${payloadBase64}`;
}

export function parsePaymentHeader(header: string): X402PaymentComponents | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;

  const scheme = parts[0];
  const network = parts.slice(1, -1).join(':');
  const payload = parts[parts.length - 1];

  return { scheme, network, payload };
}

export function decodePaymentHeader(
  header: string
): (SignedPayment & { authSignature: string }) | null {
  const components = parsePaymentHeader(header);
  if (!components) return null;

  try {
    const decoded = Buffer.from(components.payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function verifyPaymentHeader(header: string): boolean {
  const payment = decodePaymentHeader(header);
  if (!payment) return false;

  try {
    const publicKey = new PublicKey(payment.payer);
    const authSignature = Buffer.from(payment.authSignature, 'base64');
    const { authSignature: _, ...paymentWithoutAuth } = payment;
    const message = serializeForSigning(paymentWithoutAuth);

    return verifyPaymentSignature(publicKey, message, authSignature);
  } catch {
    return false;
  }
}

export function isPaymentFresh(payment: SignedPayment, maxAgeMs: number = 300_000): boolean {
  const now = Date.now();
  const age = now - payment.timestamp;
  return age >= 0 && age <= maxAgeMs;
}

export function createEscrowProofHeader(
  escrowPda: PublicKey,
  transactionId: string,
  wallet: Keypair
): string {
  const message = new TextEncoder().encode(
    `kamiyo:escrow:${escrowPda.toBase58()}:${transactionId}:${Date.now()}`
  );
  const signature = signPaymentMessage(wallet, message);

  const payload = {
    escrowPda: escrowPda.toBase58(),
    transactionId,
    timestamp: Date.now(),
    signature: Buffer.from(signature).toString('base64'),
    agent: wallet.publicKey.toBase58(),
  };

  return `kamiyo:escrow:${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

export class PaymentSigner {
  constructor(private readonly wallet: Keypair) {}

  signPayment(
    transactionSignature: string,
    resource: string,
    amount: number | string,
    network: string = 'solana:mainnet'
  ): string {
    const payment = createSignedPayment(
      this.wallet,
      transactionSignature,
      resource,
      amount
    );
    return createPaymentHeader(payment, this.wallet, network);
  }

  signEscrowProof(escrowPda: PublicKey, transactionId: string): string {
    return createEscrowProofHeader(escrowPda, transactionId, this.wallet);
  }

  getPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }
}

export function createPaymentSigner(wallet: Keypair): PaymentSigner {
  return new PaymentSigner(wallet);
}
