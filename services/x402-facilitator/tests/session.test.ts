import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Wallet } from 'ethers';
import {
  buildSessionChallengeMessage,
  parseSessionPaymentHeader,
  verifySessionChallengeSignature,
} from '../src/services/session';

describe('session payments', () => {
  it('parses session payment header token and nonce', () => {
    const header = 'session:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:tok_abc.n1';
    const parsed = parseSessionPaymentHeader(header);
    expect(parsed).toEqual({
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      token: 'tok_abc',
      nonce: 'n1',
    });
  });

  it('verifies ed25519 signatures for Solana payer addresses (base58)', () => {
    const kp = Keypair.generate();
    const message = buildSessionChallengeMessage({
      payerWallet: kp.publicKey.toBase58(),
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      merchantWallet: Keypair.generate().publicKey.toBase58(),
      maxTotalMicro: '1500000',
      maxSingleMicro: null,
      sessionExpiresAtIso: new Date(Date.now() + 3600_000).toISOString(),
      nonce: 'nonce1',
    });

    const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);
    const signature = bs58.encode(sig);

    expect(verifySessionChallengeSignature({ payerWallet: kp.publicKey.toBase58(), message, signature })).toBe(true);
  });

  it('verifies secp256k1 signatures for EVM payer addresses (hex)', async () => {
    const wallet = Wallet.createRandom();
    const message = buildSessionChallengeMessage({
      payerWallet: wallet.address,
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      merchantWallet: Keypair.generate().publicKey.toBase58(),
      maxTotalMicro: '1500000',
      maxSingleMicro: '500000',
      sessionExpiresAtIso: new Date(Date.now() + 3600_000).toISOString(),
      nonce: 'nonce2',
    });

    const signature = await wallet.signMessage(new TextEncoder().encode(message));
    expect(verifySessionChallengeSignature({ payerWallet: wallet.address, message, signature })).toBe(true);
  });
});

