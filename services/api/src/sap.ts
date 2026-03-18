import { BN } from '@coral-xyz/anchor';
import { PayAIFacilitator } from '@kamiyo/x402-client';
import {
  type Capability,
  type PricingTier,
  SettlementMode,
  TokenType,
} from '@oobe-protocol-labs/synapse-sap-sdk';
import { resolveAllowedTargetHosts } from './allowed-target-hosts';
import { getMcpCapability, resolveX402SupportedNetworks } from './core-capabilities';
import { getHostedToolDefinition } from './mcp/server';

const DEFAULT_ALLOWED_TARGET_HOSTS = ['api.kamiyo.ai', 'x402.kamiyo.ai'] as const;

export const SAP_ALLOWED_TOOL_NAMES = [
  'x402_check_pricing',
  'x402_fetch',
  'create_escrow',
  'check_escrow_status',
] as const;

export type SapToolName = (typeof SAP_ALLOWED_TOOL_NAMES)[number];
export type SapPaymentMode = 'free' | 'pass_through' | 'x402';

export const SAP_AGENT_NAME = 'KAMIYO SAP Agent';
export const SAP_AGENT_DESCRIPTION =
  'SAP-native access to KAMIYO x402 pricing, x402 fetch, and escrow settlement tools.';
export const SAP_AGENT_ID = 'kamiyo-sap-mainnet';
export const SAP_ACTIVE = true;
export const SAP_PROTOCOLS = ['sap', 'kamiyo', 'x402'] as const;
export const SAP_BASELINE_PRICE_MICRO_USDC = 5_000;
export const SAP_BASELINE_RATE_LIMIT = 60;
export const SAP_BASELINE_PRICE_USD = SAP_BASELINE_PRICE_MICRO_USDC / 1_000_000;

function parseConfiguredList(configured: string | undefined): string[] {
  return [...new Set(
    (configured || '')
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SAP_CAPABILITIES: Capability[] = [
  {
    id: 'kamiyo:x402-pricing',
    description: 'Inspect x402 pricing for allowlisted endpoints.',
    protocolId: 'x402',
    version: '1.0.0',
  },
  {
    id: 'kamiyo:x402-fetch',
    description: 'Fetch x402-protected resources with automatic payment handling.',
    protocolId: 'x402',
    version: '1.0.0',
  },
  {
    id: 'kamiyo:escrow-create',
    description: 'Create KAMIYO escrow sessions for paid execution.',
    protocolId: 'kamiyo',
    version: '1.0.0',
  },
  {
    id: 'kamiyo:escrow-status',
    description: 'Read KAMIYO escrow session state.',
    protocolId: 'kamiyo',
    version: '1.0.0',
  },
] as const;

export const SAP_BASELINE_PRICING_TIERS: PricingTier[] = [
  {
    tierId: 'standard',
    pricePerCall: new BN(SAP_BASELINE_PRICE_MICRO_USDC),
    minPricePerCall: null,
    maxPricePerCall: null,
    rateLimit: SAP_BASELINE_RATE_LIMIT,
    maxCallsPerSession: 1_000,
    burstLimit: 10,
    tokenType: TokenType.Usdc,
    tokenMint: null,
    tokenDecimals: 6,
    settlementMode: SettlementMode.X402,
    minEscrowDeposit: null,
    batchIntervalSec: null,
    volumeCurve: null,
  },
] as const;

interface SapToolProfileSeed {
  protocolId: string;
  category: 'data' | 'payment';
  categoryKey: 'Data' | 'Payment';
  paymentMode: SapPaymentMode;
  priceMicroUsdc: number | null;
  pricingNote: string;
}

export interface SapToolProfile extends SapToolProfileSeed {
  name: SapToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  httpMethod: 'post';
  paramsCount: number;
  requiredParams: number;
  isCompound: false;
}

const SAP_TOOL_SEEDS: Record<SapToolName, SapToolProfileSeed> = {
  x402_check_pricing: {
    protocolId: 'x402',
    category: 'data',
    categoryKey: 'Data',
    paymentMode: 'free',
    priceMicroUsdc: 0,
    pricingNote: 'Free. Use this first to inspect pass-through x402 requirements.',
  },
  x402_fetch: {
    protocolId: 'x402',
    category: 'data',
    categoryKey: 'Data',
    paymentMode: 'pass_through',
    priceMicroUsdc: null,
    pricingNote: 'Pass-through only. The caller must satisfy the upstream x402 challenge directly; no SAP surcharge is added.',
  },
  create_escrow: {
    protocolId: 'kamiyo',
    category: 'payment',
    categoryKey: 'Payment',
    paymentMode: 'x402',
    priceMicroUsdc: SAP_BASELINE_PRICE_MICRO_USDC,
    pricingNote: 'Fixed baseline price of 5000 micro-USDC per call. Execution stays disabled until SAP escrow allowlist and spend cap are configured.',
  },
  check_escrow_status: {
    protocolId: 'kamiyo',
    category: 'payment',
    categoryKey: 'Payment',
    paymentMode: 'x402',
    priceMicroUsdc: SAP_BASELINE_PRICE_MICRO_USDC,
    pricingNote: 'Fixed baseline price of 5000 micro-USDC per call.',
  },
};

function countSchemaProperties(schema: Record<string, unknown>): number {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return 0;
  }

  return Object.keys(properties).length;
}

function countSchemaRequired(schema: Record<string, unknown>): number {
  const required = schema.required;
  if (!Array.isArray(required)) {
    return 0;
  }

  return required.length;
}

function createToolRequestSchema(toolName: SapToolName, argsSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      tool: {
        type: 'string',
        const: toolName,
      },
      args: argsSchema,
    },
    required: ['tool', 'args'],
    additionalProperties: false,
  };
}

function getHostedSapTool(name: SapToolName) {
  const tool = getHostedToolDefinition(name);
  if (!tool || !tool.outputSchema || typeof tool.outputSchema !== 'object' || Array.isArray(tool.outputSchema)) {
    throw new Error(`SAP tool definition missing output schema: ${name}`);
  }

  return tool;
}

export function getSapToolCatalog(): SapToolProfile[] {
  return SAP_ALLOWED_TOOL_NAMES.map((name) => {
    const hostedTool = getHostedSapTool(name);
    const seed = SAP_TOOL_SEEDS[name];
    const inputSchema = createToolRequestSchema(name, hostedTool.inputSchema as Record<string, unknown>);

    return {
      ...seed,
      name,
      description: hostedTool.description,
      inputSchema,
      outputSchema: hostedTool.outputSchema as Record<string, unknown>,
      httpMethod: 'post',
      paramsCount: countSchemaProperties(hostedTool.inputSchema as Record<string, unknown>),
      requiredParams: countSchemaRequired(hostedTool.inputSchema as Record<string, unknown>),
      isCompound: false,
    };
  });
}

export function getSapAllowedTargetHosts(): string[] {
  return resolveAllowedTargetHosts(DEFAULT_ALLOWED_TARGET_HOSTS, process.env.SAP_ALLOWED_TARGET_HOSTS);
}

export function getSapEscrowAllowedApis(): string[] {
  return parseConfiguredList(process.env.SAP_ESCROW_ALLOWED_APIS);
}

export function getSapEscrowMaxAmountSol(): number {
  return parsePositiveNumber(process.env.SAP_ESCROW_MAX_AMOUNT_SOL, 0);
}

export function isSapEscrowExecutionEnabled(): boolean {
  return getSapEscrowAllowedApis().length > 0 && getSapEscrowMaxAmountSol() > 0;
}

export function getSapBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return getMcpCapability(env).publicBaseUrl;
}

export function getSapAgentUri(baseUrl = getSapBaseUrl()): string {
  return new URL('/api/sap/metadata', baseUrl).toString();
}

export function getSapExecuteEndpoint(baseUrl = getSapBaseUrl()): string {
  return new URL('/api/sap/execute', baseUrl).toString();
}

export function getSapPricingEndpoint(baseUrl = getSapBaseUrl()): string {
  return new URL('/api/sap/pricing', baseUrl).toString();
}

export function getSapHealthEndpoint(baseUrl = getSapBaseUrl()): string {
  return new URL('/api/sap/health', baseUrl).toString();
}

export function getSapMcpEndpoint(baseUrl = getSapBaseUrl()): string {
  return new URL('/mcp', baseUrl).toString();
}

export function getSapPricingManifest(baseUrl = getSapBaseUrl()) {
  return {
    baselineTier: {
      tierId: 'standard',
      tokenType: 'usdc',
      tokenDecimals: 6,
      settlementMode: 'x402',
      pricePerCall: SAP_BASELINE_PRICE_MICRO_USDC,
      rateLimit: SAP_BASELINE_RATE_LIMIT,
    },
    exactPricingEndpoint: getSapPricingEndpoint(baseUrl),
    payment: {
      protocol: 'x402',
      asset: 'USDC',
      unit: 'micro-usdc',
      headers: ['payment-signature', 'X-Payment'],
      facilitator: PayAIFacilitator.URL,
      networks: resolveX402SupportedNetworks().map((network) => ({
        name: network,
        chainId: PayAIFacilitator.getChainId(network),
        usdc: PayAIFacilitator.getUsdcAddress(network),
      })),
    },
    tools: Object.fromEntries(
      getSapToolCatalog().map((tool) => [
        tool.name,
        {
          paymentMode: tool.paymentMode,
          priceMicroUsdc: tool.priceMicroUsdc,
          note: tool.pricingNote,
        },
      ])
    ),
    safeguards: {
      x402Fetch: 'Caller-paid pass-through. Upstream payment headers are forwarded, not settled by the SAP server.',
      createEscrow: {
        enabled: isSapEscrowExecutionEnabled(),
        allowedApis: getSapEscrowAllowedApis(),
        maxAmountSol: getSapEscrowMaxAmountSol(),
      },
    },
  };
}

export function getSapMetadata(baseUrl = getSapBaseUrl()) {
  return {
    name: SAP_AGENT_NAME,
    description: SAP_AGENT_DESCRIPTION,
    agentId: SAP_AGENT_ID,
    active: SAP_ACTIVE,
    protocols: [...SAP_PROTOCOLS],
    capabilities: SAP_CAPABILITIES,
    services: [
      {
        type: 'sap_execute',
        protocol: 'sap',
        url: getSapExecuteEndpoint(baseUrl),
        auth: 'x402',
        pricingEndpoint: getSapPricingEndpoint(baseUrl),
      },
      {
        type: 'sap_pricing',
        protocol: 'https',
        url: getSapPricingEndpoint(baseUrl),
        auth: 'none',
      },
      {
        type: 'mcp',
        protocol: 'mcp',
        url: getSapMcpEndpoint(baseUrl),
        auth: 'oauth2',
      },
    ],
    tools: getSapToolCatalog().map((tool) => ({
      name: tool.name,
      protocolId: tool.protocolId,
      description: tool.description,
      httpMethod: tool.httpMethod,
      category: tool.category,
      paramsCount: tool.paramsCount,
      requiredParams: tool.requiredParams,
      isCompound: tool.isCompound,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      pricing: {
        paymentMode: tool.paymentMode,
        priceMicroUsdc: tool.priceMicroUsdc,
        note: tool.pricingNote,
      },
    })),
    endpoints: {
      agentUri: getSapAgentUri(baseUrl),
      execute: getSapExecuteEndpoint(baseUrl),
      pricing: getSapPricingEndpoint(baseUrl),
      health: getSapHealthEndpoint(baseUrl),
      mcp: getSapMcpEndpoint(baseUrl),
    },
    pricing: getSapPricingManifest(baseUrl),
  };
}

export function getSapRegistrationProfile(baseUrl = getSapBaseUrl()) {
  return {
    name: SAP_AGENT_NAME,
    description: SAP_AGENT_DESCRIPTION,
    agentId: SAP_AGENT_ID,
    agentUri: getSapAgentUri(baseUrl),
    x402Endpoint: getSapExecuteEndpoint(baseUrl),
    protocols: [...SAP_PROTOCOLS],
    capabilities: SAP_CAPABILITIES,
    pricing: SAP_BASELINE_PRICING_TIERS,
    tools: getSapToolCatalog(),
  };
}
