import { z } from 'zod';
import type { IAgentRuntime } from './types';

export const kamiyoEnvSchema = z.object({
  KAMIYO_NETWORK: z.enum(['mainnet', 'devnet', 'localnet']).default('mainnet'),
  SOLANA_PRIVATE_KEY: z.string().min(1).optional(),
  KAMIYO_QUALITY_THRESHOLD: z.coerce.number().min(0).max(100).default(80),
  KAMIYO_MAX_PRICE: z.coerce.number().positive().default(0.01),
  KAMIYO_AUTO_DISPUTE: z.coerce.boolean().default(true),
  KAMIYO_MIN_REPUTATION: z.coerce.number().min(0).max(100).default(60),
  KAMIYO_MONITOR_INTERVAL: z.coerce.number().positive().default(60000),
});

export type KamiyoEnv = z.infer<typeof kamiyoEnvSchema>;

export function validateEnv(runtime: IAgentRuntime): KamiyoEnv {
  const raw = {
    KAMIYO_NETWORK: runtime.getSetting('KAMIYO_NETWORK'),
    SOLANA_PRIVATE_KEY: runtime.getSetting('SOLANA_PRIVATE_KEY'),
    KAMIYO_QUALITY_THRESHOLD: runtime.getSetting('KAMIYO_QUALITY_THRESHOLD'),
    KAMIYO_MAX_PRICE: runtime.getSetting('KAMIYO_MAX_PRICE'),
    KAMIYO_AUTO_DISPUTE: runtime.getSetting('KAMIYO_AUTO_DISPUTE'),
    KAMIYO_MIN_REPUTATION: runtime.getSetting('KAMIYO_MIN_REPUTATION'),
    KAMIYO_MONITOR_INTERVAL: runtime.getSetting('KAMIYO_MONITOR_INTERVAL'),
  };

  return kamiyoEnvSchema.parse(raw);
}

export function getSetting<K extends keyof KamiyoEnv>(
  runtime: IAgentRuntime,
  key: K
): KamiyoEnv[K] {
  const env = validateEnv(runtime);
  return env[key];
}
