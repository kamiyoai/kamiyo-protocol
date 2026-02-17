import { beforeEach, describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';

import { verifyEvmMessageSignature } from '../src/services/evm-signature';

describe('verifyEvmMessageSignature', () => {
  beforeEach(() => {
    delete process.env.BASE_RPC_URL;
    delete process.env.BASE_FACILITATOR_KEY;
    delete process.env.SOLANA_RPC_URL;
    delete process.env.FACILITATOR_PRIVATE_KEY;
    delete process.env.TREASURY_WALLET;
    delete process.env.DATABASE_URL;
  });

  it('verifies EOA signatures', async () => {
    const wallet = Wallet.createRandom();
    const message = 'hello from kamiyo';
    const signature = await wallet.signMessage(message);

    await expect(
      verifyEvmMessageSignature({ address: wallet.address, message, signature })
    ).resolves.toBe(true);
  });

  it('returns false for mismatched signer without throwing', async () => {
    const wallet = Wallet.createRandom();
    const other = Wallet.createRandom();
    const message = 'hello from kamiyo';
    const signature = await wallet.signMessage(message);

    await expect(
      verifyEvmMessageSignature({ address: other.address, message, signature })
    ).resolves.toBe(false);
  });

  it('returns false for invalid inputs', async () => {
    await expect(
      verifyEvmMessageSignature({ address: '0x123', message: 'hello', signature: '0xabc' })
    ).resolves.toBe(false);
  });
});

