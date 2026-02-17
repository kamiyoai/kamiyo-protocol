import { CDP_ENV } from './constants.js';

export type CdpEnv = {
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
};

function mustGetEnv(key: string): string {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
}

export function readCdpEnv(): CdpEnv {
  return {
    apiKeyId: mustGetEnv(CDP_ENV.apiKeyId),
    apiKeySecret: mustGetEnv(CDP_ENV.apiKeySecret),
    walletSecret: mustGetEnv(CDP_ENV.walletSecret),
  };
}
