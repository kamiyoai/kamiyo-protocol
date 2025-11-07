import { z } from 'zod';

export const SUPPORTED_CHAINS = [
  'ethereum',
  'base',
  'polygon',
  'avalanche',
  'arbitrum',
  'optimism',
  'bsc',
] as const;

export type SupportedChain = typeof SUPPORTED_CHAINS[number];

export interface TokenApproval {
  token_address: string;
  token_symbol: string;
  token_name: string;
  spender_address: string;
  spender_name?: string;
  allowance: string;
  is_unlimited: boolean;
  last_updated: string;
  transaction_hash: string;
}

export interface RiskFlag {
  type: 'unlimited' | 'stale' | 'exploited_protocol' | 'suspicious_spender';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface RevocationTransaction {
  to: string;
  data: string;
  value: string;
  chainId: number;
  token_address: string;
  spender_address: string;
  description: string;
}

export interface ApprovalAuditResponse {
  success: boolean;
  wallet: string;
  chains: string[];
  approvals: TokenApproval[];
  risk_flags: Record<string, RiskFlag[]>;
  revoke_tx_data: RevocationTransaction[];
  total_approvals: number;
  risky_approvals: number;
  timestamp: string;
}

export const approvalAuditQuerySchema = z.object({
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format'),
  chains: z
    .string()
    .optional()
    .default('ethereum')
    .transform(str => str.split(',').map(s => s.trim()))
    .pipe(z.array(z.enum(SUPPORTED_CHAINS))),
});

export const CHAIN_IDS: Record<SupportedChain, number> = {
  ethereum: 1,
  base: 8453,
  polygon: 137,
  avalanche: 43114,
  arbitrum: 42161,
  optimism: 10,
  bsc: 56,
};

export const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
