import { CreatePolicyBodySchema, type CreatePolicyBody } from '@coinbase/cdp-sdk';
import type { MeishiMandate } from '@kamiyo/meishi';
import { USDC } from './constants.js';
import {
  mandateSingleSpendLimitMicroUsd,
  microUsdToCents,
} from './mandates.js';

export type CdpPolicyNetwork = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';

export type CompileUsdcPolicyParams = {
  description: string;
  network: CdpPolicyNetwork;
  maxSpendMicroUsd: bigint;
  allowedMerchants?: string[];
};

type CompileMeishiPolicyParams = {
  description: string;
  network: CdpPolicyNetwork;
  mandate: MeishiMandate;
  allowedMerchants?: string[];
};

function uniqLower(values: readonly string[] | undefined): string[] {
  if (!values?.length) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function normalizeDescription(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9 ,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Kamiyo policy';
  return cleaned.length > 50 ? cleaned.slice(0, 50).trim() : cleaned;
}

export function compileUsdcSpendPolicy(params: CompileUsdcPolicyParams): CreatePolicyBody {
  const description = normalizeDescription(params.description);
  const merchants = uniqLower(params.allowedMerchants);

  if (params.network === 'base' || params.network === 'base-sepolia') {
    const network = params.network === 'base' ? 'base' : 'base-sepolia';
    const usdc = params.network === 'base' ? USDC.base : USDC.baseSepolia;
    const maxCents = microUsdToCents(params.maxSpendMicroUsd);

    const policy: CreatePolicyBody = {
      scope: 'account',
      description,
      rules: [
        {
          action: 'accept',
          operation: 'sendEvmTransaction',
          criteria: [
            { type: 'evmNetwork', networks: [network], operator: 'in' },
            { type: 'ethValue', ethValue: '0', operator: '==' },
            { type: 'evmAddress', addresses: [usdc], operator: 'in' },
            {
              type: 'evmData',
              abi: 'erc20',
              conditions: [
                {
                  function: 'transfer',
                  params: merchants.length
                    ? [{ name: 'to', operator: 'in', values: merchants }]
                    : undefined,
                },
              ],
            },
            { type: 'netUSDChange', changeCents: maxCents, operator: '<=' },
          ],
        },
        {
          action: 'reject',
          operation: 'sendEvmTransaction',
          criteria: [{ type: 'evmNetwork', networks: [network], operator: 'in' }],
        },
      ],
    };

    return CreatePolicyBodySchema.parse(policy);
  }

  const network = params.network === 'solana' ? 'solana' : 'solana-devnet';
  const mint = params.network === 'solana' ? USDC.solanaMainnet : USDC.solanaDevnet;
  const maxMicro = params.maxSpendMicroUsd.toString(10);

  const solCriteria: any[] = [
    { type: 'solNetwork', networks: [network], operator: 'in' },
    { type: 'mintAddress', addresses: [mint], operator: 'in' },
    { type: 'splValue', splValue: maxMicro, operator: '<=' },
  ];

  if (merchants.length) {
    solCriteria.push({ type: 'splAddress', addresses: merchants, operator: 'in' });
  }

  const policy: CreatePolicyBody = {
    scope: 'account',
    description,
    rules: [
      {
        action: 'accept',
        operation: 'sendSolTransaction',
        criteria: solCriteria,
      },
      {
        action: 'reject',
        operation: 'sendSolTransaction',
        criteria: [{ type: 'solNetwork', networks: [network], operator: 'in' }],
      },
    ],
  };

  return CreatePolicyBodySchema.parse(policy);
}

export function compileMeishiMandateToCdpPolicy(params: CompileMeishiPolicyParams): CreatePolicyBody {
  return compileUsdcSpendPolicy({
    description: params.description,
    network: params.network,
    maxSpendMicroUsd: mandateSingleSpendLimitMicroUsd(params.mandate),
    allowedMerchants: params.allowedMerchants,
  });
}
