import { describe, expect, it } from 'vitest';

import { getCreditsCapability, getMcpCapability, getX402Capability } from '../core-capabilities';

describe('companion core capabilities', () => {
  it('treats credits as disabled when treasury or mint config is missing', () => {
    expect(getCreditsCapability({} as NodeJS.ProcessEnv)).toMatchObject({
      enabled: false,
      state: 'disabled',
      reason: 'treasury_wallet_missing',
    });

    expect(
      getCreditsCapability({
        CREDITS_TREASURY_WALLET: 'treasury-wallet',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      enabled: false,
      state: 'disabled',
      reason: 'token_mint_missing',
    });
  });

  it('treats credits as ready only when treasury and mint config are present', () => {
    expect(
      getCreditsCapability({
        CREDITS_TREASURY_WALLET: 'treasury-wallet',
        KAMIYO_MINT: 'mint-address',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      enabled: true,
      state: 'ready',
      reason: null,
      treasuryWallet: 'treasury-wallet',
      tokenMint: 'mint-address',
    });
  });

  it('treats x402 as disabled when the merchant wallet is missing', () => {
    expect(getX402Capability({} as NodeJS.ProcessEnv)).toMatchObject({
      enabled: false,
      state: 'disabled',
      reason: 'merchant_wallet_missing',
    });
  });

  it('resolves the MCP base url from env or sane defaults', () => {
    expect(
      getMcpCapability({
        API_BASE_URL: 'https://api.example.com',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      publicBaseUrl: 'https://api.example.com/',
      source: 'env',
    });

    expect(
      getMcpCapability({
        NODE_ENV: 'development',
        PORT: '4100',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      publicBaseUrl: 'http://localhost:4100',
      source: 'default-development',
    });

    expect(getMcpCapability({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toMatchObject({
      publicBaseUrl: 'https://api.kamiyo.ai',
      source: 'default-production',
    });
  });
});
