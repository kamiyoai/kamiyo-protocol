import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PublicKey } from '@solana/web3.js';
import {
  MeishiClient,
  MeishiExchange,
  PassportManager,
  MandateManager,
  LiabilityManager,
  generateComplianceReport,
  generateKamonFromPassport,
  classifyCompliance,
  fromOnChainScore,
  type MeishiConfig,
} from '@kamiyo/meishi';

export const MEISHI_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'verify_meishi',
    description: 'Verify an agent\'s Meishi compliance passport. Checks identity, mandate validity, compliance score, and suspension status.',
    inputSchema: {
      type: 'object',
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA address' },
        minComplianceScore: { type: 'number', description: 'Minimum compliance score threshold (0-1000)' },
        requiredJurisdiction: { type: 'number', description: 'Required jurisdiction (0=Global, 1=EU, 2=US, 3=UK, 4=APAC)' },
      },
      required: ['passportAddress'],
    },
  },
  {
    name: 'get_meishi',
    description: 'Fetch full Meishi passport details for an agent identity.',
    inputSchema: {
      type: 'object',
      properties: {
        agentIdentity: { type: 'string', description: 'Agent identity public key' },
      },
      required: ['agentIdentity'],
    },
  },
  {
    name: 'check_compliance',
    description: 'Generate a compliance report for a Meishi passport. Evaluates identity verification, authorization validity, transaction history, and audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA address' },
      },
      required: ['passportAddress'],
    },
  },
  {
    name: 'check_mandate',
    description: 'Check if an agent\'s mandate allows a specific transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA address' },
        amountUsd: { type: 'number', description: 'Transaction amount in USD' },
        productCategory: { type: 'number', description: 'Product category code (0-255)' },
      },
      required: ['passportAddress'],
    },
  },
  {
    name: 'get_liability',
    description: 'Get the liability allocation between a passport holder and a counterparty.',
    inputSchema: {
      type: 'object',
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA address' },
        counterparty: { type: 'string', description: 'Counterparty public key' },
      },
      required: ['passportAddress', 'counterparty'],
    },
  },
  {
    name: 'get_kamon',
    description: 'Generate the Kamon visual crest SVG for a Meishi passport.',
    inputSchema: {
      type: 'object',
      properties: {
        agentIdentity: { type: 'string', description: 'Agent identity public key' },
        size: { type: 'number', description: 'SVG size in pixels (default: 256)' },
      },
      required: ['agentIdentity'],
    },
  },
  {
    name: 'suggest_liability',
    description: 'Get a suggested liability allocation for a transaction context.',
    inputSchema: {
      type: 'object',
      properties: {
        agentComplianceScore: { type: 'number', description: 'Agent compliance score (on-chain, -1000 to 1000)' },
        merchantVerified: { type: 'boolean', description: 'Whether the merchant is verified' },
        transactionAmountUsd: { type: 'number', description: 'Transaction amount in USD' },
        humanApproved: { type: 'boolean', description: 'Whether a human approved this transaction' },
      },
      required: ['agentComplianceScore', 'merchantVerified', 'transactionAmountUsd', 'humanApproved'],
    },
  },
];

export interface ToolContext {
  client: MeishiClient;
  exchange: MeishiExchange;
  passports: PassportManager;
  mandates: MandateManager;
  liability: LiabilityManager;
}

export function createToolContext(config: MeishiConfig): ToolContext {
  const client = new MeishiClient(config);
  return {
    client,
    exchange: new MeishiExchange(client),
    passports: new PassportManager(client),
    mandates: new MandateManager(client),
    liability: new LiabilityManager(client),
  };
}

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case 'verify_meishi':
      return verifyMeishi(args, ctx);
    case 'get_meishi':
      return getMeishi(args, ctx);
    case 'check_compliance':
      return checkCompliance(args, ctx);
    case 'check_mandate':
      return checkMandate(args, ctx);
    case 'get_liability':
      return getLiability(args, ctx);
    case 'get_kamon':
      return getKamon(args, ctx);
    case 'suggest_liability':
      return suggestLiability(args);
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

async function verifyMeishi(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const address = args.passportAddress;
  if (!isValidPubkey(address)) return { success: false, error: 'passportAddress must be a valid base58 public key' };

  try {
    const presentation = {
      passportAddress: address,
      mandateVersion: 0,
      signature: '',
    };

    const result = await ctx.exchange.verify(presentation, {
      minComplianceScore: args.minComplianceScore as number | undefined,
      requiredJurisdiction: args.requiredJurisdiction as number | undefined,
    });

    return {
      success: true,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      passport: result.passport ? {
        complianceScore: result.passport.complianceScore,
        complianceClass: result.passport.complianceClass,
        jurisdiction: result.passport.jurisdiction,
        suspended: result.passport.suspended,
        totalTransactions: result.passport.totalTransactions.toString(),
        disputesFiled: result.passport.disputesFiled,
        disputesLost: result.passport.disputesLost,
      } : null,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function getMeishi(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const agentId = args.agentIdentity;
  if (!isValidPubkey(agentId)) return { success: false, error: 'agentIdentity must be a valid base58 public key' };

  try {
    const agentPk = new PublicKey(agentId);
    const passport = await ctx.passports.get(agentPk);

    if (!passport) {
      return { success: false, error: 'Passport not found' };
    }

    return {
      success: true,
      passport: {
        issuer: passport.issuer.toBase58(),
        principal: passport.principal.toBase58(),
        complianceClass: passport.complianceClass,
        complianceScore: passport.complianceScore,
        jurisdiction: passport.jurisdiction,
        mandateVersion: passport.mandateVersion,
        mandateExpires: passport.mandateExpires.toString(),
        totalTransactions: passport.totalTransactions.toString(),
        totalVolumeUsd: passport.totalVolumeUsd.toString(),
        disputesFiled: passport.disputesFiled,
        disputesLost: passport.disputesLost,
        suspended: passport.suspended,
        suspensionReason: passport.suspensionReason,
        lastAudit: passport.lastAudit.toString(),
        auditNonce: passport.auditNonce,
        trustTier: ctx.passports.getTrustTier(passport),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function checkCompliance(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const address = args.passportAddress;
  if (!isValidPubkey(address)) return { success: false, error: 'passportAddress must be a valid base58 public key' };

  try {
    const passportPk = new PublicKey(address);
    const passport = await ctx.client.fetchPassport(passportPk);

    if (!passport) {
      return { success: false, error: 'Passport not found' };
    }

    const report = generateComplianceReport(passport, address);

    return {
      success: true,
      report: {
        overallScore: report.overallScore,
        classification: report.classification,
        jurisdiction: report.jurisdiction,
        dimensions: report.dimensions.map((d) => ({
          name: d.name,
          score: d.score,
          weight: d.weight,
          requirement: d.requirement,
          findings: d.findings,
        })),
        recommendations: report.recommendations,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function checkMandate(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const address = args.passportAddress;
  if (!isValidPubkey(address)) return { success: false, error: 'passportAddress must be a valid base58 public key' };

  try {
    const passportPk = new PublicKey(address);
    const passport = await ctx.client.fetchPassport(passportPk);

    if (!passport) {
      return { success: false, error: 'Passport not found' };
    }

    const mandate = await ctx.mandates.getLatest(passportPk);

    if (!mandate) {
      return { success: true, valid: false, reason: 'No mandate found' };
    }

    const valid = ctx.mandates.isValid(mandate);
    const expired = ctx.mandates.isExpired(mandate);

    const checks: Record<string, unknown> = {
      mandateValid: valid,
      mandateExpired: expired,
      version: mandate.version,
      revoked: mandate.revoked,
    };

    if (args.amountUsd !== undefined) {
      const amountMicro = Math.floor((args.amountUsd as number) * 1_000_000);
      checks.withinSpendingLimit = ctx.mandates.checkSpendingLimit(mandate, amountMicro);
      checks.requiresHumanApproval = ctx.mandates.requiresHumanApproval(mandate, amountMicro);
    }

    if (args.productCategory !== undefined) {
      checks.categoryAuthorized = ctx.mandates.checkCategory(mandate, args.productCategory as number);
    }

    return { success: true, valid, checks };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function getLiability(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const address = args.passportAddress;
  const counterparty = args.counterparty;
  if (!isValidPubkey(address) || !isValidPubkey(counterparty)) {
    return { success: false, error: 'passportAddress and counterparty must be valid base58 public keys' };
  }

  try {
    const passportPk = new PublicKey(address);
    const counterpartyPk = new PublicKey(counterparty);
    const allocation = await ctx.liability.get(passportPk, counterpartyPk);

    if (!allocation) {
      return { success: true, found: false };
    }

    return {
      success: true,
      found: true,
      allocation: {
        consumerBps: allocation.consumerLiabilityBps,
        developerBps: allocation.developerLiabilityBps,
        merchantBps: allocation.merchantLiabilityBps,
        platformBps: allocation.platformLiabilityBps,
        maxLiabilityUsd: allocation.maxLiabilityUsd.toString(),
        arbitrationOracle: allocation.arbitrationOracle.toBase58(),
        valid: ctx.liability.isValid(allocation),
        balanced: ctx.liability.isBalanced(allocation),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function getKamon(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const agentId = args.agentIdentity;
  if (!isValidPubkey(agentId)) return { success: false, error: 'agentIdentity must be a valid base58 public key' };

  try {
    const agentPk = new PublicKey(agentId);
    const passport = await ctx.passports.get(agentPk);

    if (!passport) {
      return { success: false, error: 'Passport not found' };
    }

    const rawSize = typeof args.size === 'number' ? args.size : 256;
    const size = Math.max(64, Math.min(1024, rawSize));
    const svg = generateKamonFromPassport(passport, size);

    return {
      success: true,
      svg,
      params: {
        complianceClass: passport.complianceClass,
        jurisdiction: passport.jurisdiction,
        suspended: passport.suspended,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function suggestLiability(args: Record<string, unknown>): unknown {
  if (typeof args.agentComplianceScore !== 'number' ||
      typeof args.merchantVerified !== 'boolean' ||
      typeof args.transactionAmountUsd !== 'number' ||
      typeof args.humanApproved !== 'boolean') {
    return { success: false, error: 'Missing or invalid required parameters' };
  }

  const suggestion = LiabilityManager.suggestAllocation({
    agentComplianceScore: args.agentComplianceScore,
    merchantVerified: args.merchantVerified,
    transactionAmountUsd: args.transactionAmountUsd,
    humanApproved: args.humanApproved,
  });

  return {
    success: true,
    suggestion: {
      consumerBps: suggestion.consumer,
      developerBps: suggestion.developer,
      merchantBps: suggestion.merchant,
      platformBps: suggestion.platform,
      consumerPct: (suggestion.consumer / 100).toFixed(1) + '%',
      developerPct: (suggestion.developer / 100).toFixed(1) + '%',
      merchantPct: (suggestion.merchant / 100).toFixed(1) + '%',
      platformPct: (suggestion.platform / 100).toFixed(1) + '%',
    },
  };
}
