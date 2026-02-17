import { CdpClient } from '@coinbase/cdp-sdk';
import { readCdpEnv } from './env.js';

export type KamiyoCdpClientOptions = {
  apiKeyId?: string;
  apiKeySecret?: string;
  walletSecret?: string;
};

export function createCdpClient(opts: KamiyoCdpClientOptions = {}): CdpClient {
  const env = readCdpEnv();
  return new CdpClient({
    apiKeyId: opts.apiKeyId || env.apiKeyId,
    apiKeySecret: opts.apiKeySecret || env.apiKeySecret,
    walletSecret: opts.walletSecret || env.walletSecret,
  });
}
