import { z } from 'zod';

export const SUPPORTED_CHAINS = [
  'ethereum',
  'base',
  'polygon',
  'avalanche',
  'arbitrum',
  'optimism',
  'bsc',
  'solana',
  'fantom',
  'gnosis',
  'celo',
  'moonbeam',
  'moonriver'
] as const;

export const protocolNameSchema = z
  .string()
  .min(1, 'Protocol name required')
  .max(100, 'Protocol name too long')
  .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Invalid protocol name format')
  .transform(str => str.trim());

export const chainSchema = z.enum(SUPPORTED_CHAINS);

export const limitSchema = z
  .string()
  .optional()
  .transform(val => (val ? parseInt(val, 10) : undefined))
  .pipe(
    z
      .number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .optional()
  );

export const exploitsQuerySchema = z.object({
  protocol: protocolNameSchema.optional(),
  chain: chainSchema.optional(),
  limit: limitSchema
});

export const riskScoreParamsSchema = z.object({
  protocol: protocolNameSchema
});

export const riskScoreQuerySchema = z.object({
  chain: chainSchema.optional()
});

export const solanaSignatureSchema = z
  .string()
  .length(88, 'Invalid Solana signature length')
  .regex(/^[1-9A-HJ-NP-Za-km-z]{88}$/, 'Invalid Solana signature format');

export const solanaAddressSchema = z
  .string()
  .min(32, 'Invalid Solana address')
  .max(44, 'Invalid Solana address')
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address format');

export const lamportsSchema = z
  .number()
  .int('Lamports must be an integer')
  .positive('Lamports must be positive')
  .max(Number.MAX_SAFE_INTEGER, 'Lamports amount too large');

export const x402PayloadSchema = z.object({
  signature: solanaSignatureSchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be numeric string'),
  recipient: solanaAddressSchema,
  timestamp: z.number().int().positive().optional(),
  memo: z.string().max(1000).optional()
});

export const x402PaymentSchema = z.object({
  x402Version: z.literal(1),
  scheme: z.literal('exact'),
  network: z.literal('solana-mainnet'),
  payload: x402PayloadSchema
});

export function sanitizeString(input: string): string {
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

export function validateProtocol(protocol: string): string {
  const sanitized = sanitizeString(protocol);
  return protocolNameSchema.parse(sanitized);
}

export function validateChain(chain: string): string {
  const sanitized = sanitizeString(chain).toLowerCase();
  return chainSchema.parse(sanitized);
}

export function validateLimit(limit: string | undefined): number {
  if (!limit) return 50;
  const result = limitSchema.parse(limit);
  return result ?? 50;
}

export type ExploitsQuery = z.infer<typeof exploitsQuerySchema>;
export type RiskScoreParams = z.infer<typeof riskScoreParamsSchema>;
export type RiskScoreQuery = z.infer<typeof riskScoreQuerySchema>;
export type X402Payment = z.infer<typeof x402PaymentSchema>;
export type X402Payload = z.infer<typeof x402PayloadSchema>;
