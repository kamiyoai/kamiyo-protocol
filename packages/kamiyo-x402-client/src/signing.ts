/**
 * x402 payment request signing.
 */

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
  // Counter + random + timestamp prevents collisions even at same millisecond
  const counter = (++nonceCounter % 0xffff).toString(16).padStart(4, '0');
  const random = Buffer.from(nacl.randomBytes(12)).toString('hex');
  const ts = Date.now().toString(16);
  return `${counter}${random}${ts}`;
}

export function createSignedPayment(
  wallet: Keypair,
  transactionSignature: string,
  resource: string,
  amountLamports: number
): SignedPayment {
  const timestamp = Date.now();
  const nonce = generateNonce();

  return {
    signature: transactionSignature,
    payer: wallet.publicKey.toBase58(),
    timestamp,
    nonce,
    resource,
    amount: amountLamports.toString(),
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
  // Create message to sign
  const message = serializeForSigning(payment);

  // Sign the message
  const authSignature = signPaymentMessage(wallet, message);
  const authSignatureBase64 = Buffer.from(authSignature).toString('base64');

  // Create payload with auth signature
  const payload = {
    ...payment,
    authSignature: authSignatureBase64,
  };

  // Encode as base64
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');

  // Return in x402 header format: scheme:network:payload
  return `solana:${network}:${payloadBase64}`;
}

/**
 * Parse x402 payment header
 */
export function parsePaymentHeader(header: string): X402PaymentComponents | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;

  const scheme = parts[0];
  const network = parts.slice(1, -1).join(':');
  const payload = parts[parts.length - 1];

  return { scheme, network, payload };
}

/**
 * Decode and verify payment header
 */
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

/**
 * Verify the auth signature in a payment header
 */
export function verifyPaymentHeader(header: string): boolean {
  const payment = decodePaymentHeader(header);
  if (!payment) return false;

  try {
    const publicKey = new PublicKey(payment.payer);
    const authSignature = Buffer.from(payment.authSignature, 'base64');

    // Reconstruct message
    const { authSignature: _, ...paymentWithoutAuth } = payment;
    const message = serializeForSigning(paymentWithoutAuth);

    return verifyPaymentSignature(publicKey, message, authSignature);
  } catch {
    return false;
  }
}

/**
 * Check if payment is within valid time window
 */
export function isPaymentFresh(payment: SignedPayment, maxAgeMs: number = 300_000): boolean {
  const now = Date.now();
  const age = now - payment.timestamp;
  return age >= 0 && age <= maxAgeMs;
}

/**
 * Create Kamiyo-specific escrow proof header
 */
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

/**
 * Payment signing helper class
 */
export class PaymentSigner {
  constructor(private readonly wallet: Keypair) {}

  /**
   * Sign a payment and create x402 header
   */
  signPayment(
    transactionSignature: string,
    resource: string,
    amountLamports: number,
    network: string = 'solana:mainnet'
  ): string {
    const payment = createSignedPayment(
      this.wallet,
      transactionSignature,
      resource,
      amountLamports
    );
    return createPaymentHeader(payment, this.wallet, network);
  }

  /**
   * Create escrow proof header
   */
  signEscrowProof(escrowPda: PublicKey, transactionId: string): string {
    return createEscrowProofHeader(escrowPda, transactionId, this.wallet);
  }

  /**
   * Get public key
   */
  getPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }
}

/**
 * Create payment signer
 */
export function createPaymentSigner(wallet: Keypair): PaymentSigner {
  return new PaymentSigner(wallet);
}
