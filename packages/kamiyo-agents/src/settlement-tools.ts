import { PublicKey } from '@solana/web3.js';
import type { ToolConfig, ToolResult } from './types.js';
import {
  SettlementClient,
  ViolationType,
  createViolation,
  hashEvidence,
  type SettlementState,
} from '@kamiyo/settlement';

const VIOLATION_TYPES = ['latency', 'timeout', 'malformed', 'incomplete', 'rate_limit', 'server_error'] as const;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidBase58(str: unknown): str is string {
  return typeof str === 'string' && BASE58_REGEX.test(str);
}

function isPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

function isValidViolationType(val: unknown): val is ViolationType {
  return typeof val === 'string' && VIOLATION_TYPES.includes(val as any);
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('not found')) return 'Settlement not found';
    if (error.message.includes('not eligible')) return 'Not eligible for settlement';
    return 'Operation failed';
  }
  return 'Unknown error';
}

export interface SettlementToolsConfig {
  client: SettlementClient;
  defaultProvider?: PublicKey;
}

export function createSettlementTools(config: SettlementToolsConfig): ToolConfig[] {
  const { client, defaultProvider } = config;

  return [
    {
      name: 'request_settlement',
      description: 'Request a refund for an SLA violation on an x402 payment. Use when a paid API call fails to meet its SLA (timeout, latency, errors).',
      parameters: {
        paymentRef: { type: 'string', description: 'Payment reference or transaction signature', required: true },
        provider: { type: 'string', description: 'Provider wallet address (base58)', required: false },
        violationType: { type: 'string', description: 'Type: latency, timeout, malformed, incomplete, rate_limit, server_error', required: true },
        expected: { type: 'number', description: 'Expected value (e.g., max latency in ms)', required: true },
        actual: { type: 'number', description: 'Actual value (e.g., actual latency in ms, -1 for timeout)', required: true },
        evidence: { type: 'string', description: 'Evidence data (response body, error message)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (typeof params.paymentRef !== 'string' || params.paymentRef.length < 10) {
          return { success: false, error: 'Invalid payment reference' };
        }
        if (!isValidViolationType(params.violationType)) {
          return { success: false, error: `Invalid violation type. Must be one of: ${VIOLATION_TYPES.join(', ')}` };
        }
        if (!isPositiveNumber(params.expected) && params.expected !== 0) {
          return { success: false, error: 'Expected value must be a number' };
        }
        if (typeof params.actual !== 'number') {
          return { success: false, error: 'Actual value must be a number' };
        }

        const providerStr = params.provider as string | undefined;
        const providerKey = providerStr && isValidBase58(providerStr)
          ? new PublicKey(providerStr)
          : defaultProvider;

        if (!providerKey) {
          return { success: false, error: 'Provider address required' };
        }

        try {
          const evidenceData = typeof params.evidence === 'string' ? params.evidence : '';
          const violation = createViolation(
            params.violationType as ViolationType,
            params.expected as number,
            params.actual as number,
            evidenceData || `${params.violationType}:${params.expected}:${params.actual}`
          );

          const result = await client.requestSettlement({
            paymentRef: params.paymentRef,
            provider: providerKey,
            violation,
          });

          return {
            success: true,
            data: {
              settlementId: result.settlementId,
              status: result.status,
              refundPercent: result.refundPercent,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'check_settlement',
      description: 'Check the status of a settlement request.',
      parameters: {
        settlementId: { type: 'string', description: 'Settlement ID from request_settlement', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (typeof params.settlementId !== 'string') {
          return { success: false, error: 'Settlement ID required' };
        }

        try {
          const state = await client.getStatus(params.settlementId);
          if (!state) {
            return { success: false, error: 'Settlement not found' };
          }

          return {
            success: true,
            data: {
              id: state.id,
              status: state.status,
              refundPercent: state.refundPercent,
              createdAt: state.createdAt,
              resolvedAt: state.resolvedAt,
              oracleScore: state.oracleScore,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'respond_settlement',
      description: 'Respond to a settlement request as a provider. Accept to refund, or contest to escalate to oracles.',
      parameters: {
        settlementId: { type: 'string', description: 'Settlement ID', required: true },
        accept: { type: 'boolean', description: 'True to accept and refund, false to contest', required: true },
        evidence: { type: 'string', description: 'Counter-evidence if contesting', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (typeof params.settlementId !== 'string') {
          return { success: false, error: 'Settlement ID required' };
        }
        if (typeof params.accept !== 'boolean') {
          return { success: false, error: 'Accept must be true or false' };
        }

        try {
          const result = await client.respondToSettlement(params.settlementId, {
            accept: params.accept,
            evidence: typeof params.evidence === 'string' ? params.evidence : undefined,
          });

          return {
            success: true,
            data: {
              settlementId: result.settlementId,
              status: result.status,
              refundPercent: result.refundPercent,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
  ];
}

export const SETTLEMENT_TOOL_NAMES = [
  'request_settlement',
  'check_settlement',
  'respond_settlement',
] as const;

export type SettlementToolName = (typeof SETTLEMENT_TOOL_NAMES)[number];
