import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { Wallet } from 'ethers';
import { verifyPaymentAuth } from '../src/services/signature';

function serializeCanonical(payment: {
  signature: string;
  payer: string;
  timestamp: number;
  nonce: string;
  resource: string;
  amount: string;
}): Uint8Array {
  const canonical = JSON.stringify({
    amount: payment.amount,
    nonce: payment.nonce,
    payer: payment.payer,
    resource: payment.resource,
    signature: payment.signature,
    timestamp: payment.timestamp,
  });
  return new TextEncoder().encode(canonical);
}

describe('verifyPaymentAuth', () => {
  it('verifies ed25519 signatures for Solana payer addresses', () => {
    const keypair = Keypair.generate();
    const paymentBase = {
      signature: 'tx-solana-1',
      payer: keypair.publicKey.toBase58(),
      timestamp: Date.now(),
      nonce: 'nonce-sol',
      resource: '/resource',
      amount: '1.0',
    };

    const message = serializeCanonical(paymentBase);
    const signature = nacl.sign.detached(message, keypair.secretKey);
    const authSignature = Buffer.from(signature).toString('base64');

    expect(verifyPaymentAuth({ ...paymentBase, authSignature })).toBe(true);
  });

  it('verifies secp256k1 signatures for EVM payer addresses', async () => {
    const wallet = Wallet.createRandom();
    const paymentBase = {
      signature: 'tx-evm-1',
      payer: wallet.address,
      timestamp: Date.now(),
      nonce: 'nonce-evm',
      resource: '/resource',
      amount: '1.25',
    };

    const message = serializeCanonical(paymentBase);
    const signed = await wallet.signMessage(message);
    const authSignature = Buffer.from(signed.slice(2), 'hex').toString('base64');

    expect(verifyPaymentAuth({ ...paymentBase, authSignature })).toBe(true);
  });
});
