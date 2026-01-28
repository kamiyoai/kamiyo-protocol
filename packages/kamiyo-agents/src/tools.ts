import { PublicKey } from '@solana/web3.js';
import type { ToolConfig, ToolResult } from './types.js';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidBase58(str: unknown): str is string {
  return typeof str === 'string' && BASE58_REGEX.test(str);
}

function isPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

function isValidUri(str: unknown): str is string {
  if (typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'ipfs:';
  } catch {
    return false;
  }
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Invalid public key')) return 'Invalid wallet address';
    if (error.message.includes('Account does not exist')) return 'Account not found';
    if (error.message.includes('insufficient')) return 'Insufficient funds';
    return 'Operation failed';
  }
  return 'Unknown error';
}

export interface KamiyoToolsConfig {
  sdk: {
    createEscrow: (params: {
      provider: PublicKey;
      amount: number;
      slaUri: string;
      expirySeconds?: number;
    }) => Promise<{ escrowId: PublicKey; txId: string }>;
    releaseEscrow: (escrowId: PublicKey) => Promise<{ txId: string }>;
    fileDispute: (escrowId: PublicKey, reason: string) => Promise<{ disputeId: PublicKey; txId: string }>;
    getReputation: (entity: PublicKey) => Promise<{ score: number; history: unknown[] }>;
    getEscrow: (escrowId: PublicKey) => Promise<unknown>;
  };
}

export function createKamiyoTools(config: KamiyoToolsConfig): ToolConfig[] {
  const { sdk } = config;

  return [
    {
      name: 'create_escrow',
      description: 'Create a payment escrow for a service agreement. Locks funds until service is delivered.',
      parameters: {
        provider: { type: 'string', description: 'Provider wallet address (base58)', required: true },
        amount: { type: 'number', description: 'Amount in lamports', required: true },
        slaUri: { type: 'string', description: 'URI to SLA document', required: true },
        expirySeconds: { type: 'number', description: 'Escrow expiry in seconds (default: 86400)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        // Validate inputs
        if (!isValidBase58(params.provider)) {
          return { success: false, error: 'Invalid provider address' };
        }
        if (!isPositiveNumber(params.amount) || params.amount > 1e12) {
          return { success: false, error: 'Invalid amount (must be positive, max 1T lamports)' };
        }
        if (!isValidUri(params.slaUri)) {
          return { success: false, error: 'Invalid SLA URI (must be https or ipfs)' };
        }
        if (params.expirySeconds !== undefined && (!isPositiveNumber(params.expirySeconds) || params.expirySeconds > 2592000)) {
          return { success: false, error: 'Invalid expiry (must be 1-2592000 seconds)' };
        }

        try {
          const result = await sdk.createEscrow({
            provider: new PublicKey(params.provider),
            amount: params.amount,
            slaUri: params.slaUri,
            expirySeconds: params.expirySeconds as number | undefined,
          });
          return { success: true, data: { escrowId: result.escrowId.toBase58(), txId: result.txId } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'release_escrow',
      description: 'Release funds from an escrow to the provider after service delivery.',
      parameters: {
        escrowId: { type: 'string', description: 'Escrow account address (base58)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidBase58(params.escrowId)) {
          return { success: false, error: 'Invalid escrow address' };
        }

        try {
          const result = await sdk.releaseEscrow(new PublicKey(params.escrowId));
          return { success: true, data: { txId: result.txId } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'file_dispute',
      description: 'File a dispute against an escrow if service was not delivered or unsatisfactory.',
      parameters: {
        escrowId: { type: 'string', description: 'Escrow account address (base58)', required: true },
        reason: { type: 'string', description: 'Reason for dispute (max 500 chars)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidBase58(params.escrowId)) {
          return { success: false, error: 'Invalid escrow address' };
        }
        const reason = typeof params.reason === 'string' ? params.reason.slice(0, 500) : '';
        if (!reason) {
          return { success: false, error: 'Reason is required' };
        }

        try {
          const result = await sdk.fileDispute(new PublicKey(params.escrowId), reason);
          return { success: true, data: { disputeId: result.disputeId.toBase58(), txId: result.txId } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_reputation',
      description: 'Query the on-chain reputation score for an entity (agent or provider).',
      parameters: {
        entity: { type: 'string', description: 'Entity wallet address (base58)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidBase58(params.entity)) {
          return { success: false, error: 'Invalid entity address' };
        }

        try {
          const result = await sdk.getReputation(new PublicKey(params.entity));
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_escrow',
      description: 'Get details of an existing escrow account.',
      parameters: {
        escrowId: { type: 'string', description: 'Escrow account address (base58)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidBase58(params.escrowId)) {
          return { success: false, error: 'Invalid escrow address' };
        }

        try {
          const result = await sdk.getEscrow(new PublicKey(params.escrowId));
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
  ];
}

export const KAMIYO_TOOL_NAMES = [
  'create_escrow',
  'release_escrow',
  'file_dispute',
  'get_reputation',
  'get_escrow',
] as const;

export type KamiyoToolName = (typeof KAMIYO_TOOL_NAMES)[number];
