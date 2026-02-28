#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  cdpCreateUsdcPolicy,
  cdpEnvStatus,
  cdpEvmGetOrCreateAccount,
  cdpEvmSetAccountPolicy,
  cdpSolanaGetOrCreateAccount,
  cdpSolanaSetAccountPolicy,
} from '../src/tools/cdp.js';

dotenv.config();

type StepStatus = 'pass' | 'fail' | 'skip';

type StepResult = {
  status: StepStatus;
  detail: string;
  data?: Record<string, unknown>;
};

type CdpSmokeReport = {
  at: string;
  ok: boolean;
  mode: 'attach-existing-policy' | 'create-and-attach-policy';
  artifactPath: string;
  config: {
    evmAccountName: string;
    solAccountName: string;
    policyIdConfigured: boolean;
    policyNetwork: string;
    maxSpendMicroUsd: string;
    createPolicy: boolean;
  };
  policyId?: string;
  accounts: {
    evmAddress?: string;
    solAddress?: string;
  };
  steps: Record<string, StepResult>;
};

function readFirst(keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return fallback;
}

function readBool(keys: string[], fallback: boolean): boolean {
  const raw = readFirst(keys);
  if (!raw) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function sanitizeAccountName(value: string, fallback: string): string {
  const source = value || fallback;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return fallback;
  }

  const trimmed = normalized.slice(0, 36).replace(/-+$/g, '');
  if (trimmed.length >= 2) {
    return trimmed;
  }
  return `${fallback.slice(0, 34)}-a`;
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeReport(filePath: string, report: CdpSmokeReport): void {
  ensureParent(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function failStep(error: unknown): StepResult {
  const detail = error instanceof Error ? error.message : String(error);
  return { status: 'fail', detail };
}

async function main(): Promise<void> {
  const artifactPath = readFirst(['KAMIYO_CDP_SMOKE_ARTIFACT_PATH'], 'reports/cdp-live-transaction-smoke.json');
  const createPolicy = readBool(['KAMIYO_CDP_SMOKE_CREATE_POLICY'], false);
  const policyIdConfigured = readFirst(
    ['KAMIYO_CDP_SMOKE_POLICY_ID', 'KAMIYO_CANARY_CDP_POLICY_ID'],
    ''
  );
  const policyNetwork = readFirst(
    ['KAMIYO_CDP_SMOKE_POLICY_NETWORK', 'KAMIYO_CANARY_CDP_POLICY_NETWORK'],
    'base-sepolia'
  );
  const maxSpendMicroUsd = readFirst(
    ['KAMIYO_CDP_SMOKE_POLICY_MAX_SPEND_MICRO_USD', 'KAMIYO_CANARY_CDP_POLICY_MAX_SPEND_MICRO_USD'],
    '250000'
  );
  const evmAccountName = sanitizeAccountName(
    readFirst(['KAMIYO_CDP_SMOKE_ACCOUNT_EVM_NAME', 'KAMIYO_CANARY_CDP_ACCOUNT_EVM_NAME']),
    'kmy-canary-evm'
  );
  const solAccountName = sanitizeAccountName(
    readFirst(['KAMIYO_CDP_SMOKE_ACCOUNT_SOL_NAME', 'KAMIYO_CANARY_CDP_ACCOUNT_SOL_NAME']),
    'kmy-canary-sol'
  );

  const report: CdpSmokeReport = {
    at: new Date().toISOString(),
    ok: false,
    mode: createPolicy ? 'create-and-attach-policy' : 'attach-existing-policy',
    artifactPath,
    config: {
      evmAccountName,
      solAccountName,
      policyIdConfigured: Boolean(policyIdConfigured),
      policyNetwork,
      maxSpendMicroUsd,
      createPolicy,
    },
    accounts: {},
    steps: {},
  };

  const envStatus = cdpEnvStatus();
  if (envStatus.ok) {
    report.steps.cdp_env_status = {
      status: 'pass',
      detail: 'CDP environment is configured',
      data: {
        resolvedFrom: envStatus.resolvedFrom,
      },
    };
  } else {
    report.steps.cdp_env_status = {
      status: 'fail',
      detail: `Missing required CDP env vars: ${envStatus.missing.join(', ')}`,
    };
    writeReport(artifactPath, report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  let policyId = policyIdConfigured;

  try {
    const evm = await cdpEvmGetOrCreateAccount({ name: evmAccountName });
    if (!evm.success) {
      throw new Error(evm.error);
    }
    report.accounts.evmAddress = evm.address;
    report.steps.cdp_evm_get_or_create_account = {
      status: 'pass',
      detail: 'EVM account ready',
      data: { address: evm.address, name: evm.name },
    };
  } catch (error) {
    report.steps.cdp_evm_get_or_create_account = failStep(error);
  }

  try {
    const sol = await cdpSolanaGetOrCreateAccount({ name: solAccountName });
    if (!sol.success) {
      throw new Error(sol.error);
    }
    report.accounts.solAddress = sol.address;
    report.steps.cdp_solana_get_or_create_account = {
      status: 'pass',
      detail: 'Solana account ready',
      data: { address: sol.address, name: sol.name },
    };
  } catch (error) {
    report.steps.cdp_solana_get_or_create_account = failStep(error);
  }

  if (createPolicy) {
    try {
      const policy = await cdpCreateUsdcPolicy({
        description: `canary ${new Date().toISOString().slice(0, 10)}`,
        network: policyNetwork as 'base-sepolia' | 'base-mainnet',
        maxSpendMicroUsd,
      });
      if (!policy.success) {
        throw new Error(policy.error);
      }
      policyId = policy.policyId;
      report.steps.cdp_create_usdc_policy = {
        status: 'pass',
        detail: 'USDC policy created',
        data: {
          policyId: policy.policyId,
          scope: policy.scope,
          description: policy.description,
        },
      };
    } catch (error) {
      report.steps.cdp_create_usdc_policy = failStep(error);
    }
  } else if (policyId) {
    report.steps.policy_source = {
      status: 'pass',
      detail: 'Using configured policy id',
      data: { policyId },
    };
  } else {
    report.steps.policy_source = {
      status: 'fail',
      detail: 'Missing KAMIYO_CANARY_CDP_POLICY_ID (or KAMIYO_CDP_SMOKE_POLICY_ID) for attach mode',
    };
  }

  report.policyId = policyId || undefined;

  if (report.accounts.evmAddress && policyId) {
    try {
      const evmAttach = await cdpEvmSetAccountPolicy({
        address: report.accounts.evmAddress,
        policyId,
      });
      if (!evmAttach.success) {
        throw new Error(evmAttach.error);
      }
      report.steps.cdp_evm_set_account_policy = {
        status: 'pass',
        detail: 'Policy attached to EVM account',
        data: {
          address: evmAttach.address,
          policyId: evmAttach.policyId,
          policies: evmAttach.policies,
        },
      };
    } catch (error) {
      report.steps.cdp_evm_set_account_policy = failStep(error);
    }
  } else {
    report.steps.cdp_evm_set_account_policy = {
      status: 'skip',
      detail: 'Skipped: missing EVM address or policy id',
    };
  }

  if (report.accounts.solAddress && policyId) {
    try {
      const solAttach = await cdpSolanaSetAccountPolicy({
        address: report.accounts.solAddress,
        policyId,
      });
      if (!solAttach.success) {
        throw new Error(solAttach.error);
      }
      report.steps.cdp_solana_set_account_policy = {
        status: 'pass',
        detail: 'Policy attached to Solana account',
        data: {
          address: solAttach.address,
          policyId: solAttach.policyId,
          policies: solAttach.policies,
        },
      };
    } catch (error) {
      report.steps.cdp_solana_set_account_policy = failStep(error);
    }
  } else {
    report.steps.cdp_solana_set_account_policy = {
      status: 'skip',
      detail: 'Skipped: missing Solana address or policy id',
    };
  }

  const required = [
    'cdp_env_status',
    'cdp_evm_get_or_create_account',
    'cdp_solana_get_or_create_account',
    createPolicy ? 'cdp_create_usdc_policy' : 'policy_source',
    'cdp_evm_set_account_policy',
    'cdp_solana_set_account_policy',
  ];
  report.ok = required.every((name) => report.steps[name]?.status === 'pass');

  writeReport(artifactPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`artifact_path=${artifactPath}`);

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  const artifactPath = readFirst(['KAMIYO_CDP_SMOKE_ARTIFACT_PATH'], 'reports/cdp-live-transaction-smoke.json');
  const report: CdpSmokeReport = {
    at: new Date().toISOString(),
    ok: false,
    mode: 'attach-existing-policy',
    artifactPath,
    config: {
      evmAccountName: 'kmy-canary-evm',
      solAccountName: 'kmy-canary-sol',
      policyIdConfigured: false,
      policyNetwork: 'base-sepolia',
      maxSpendMicroUsd: '250000',
      createPolicy: false,
    },
    accounts: {},
    steps: {
      fatal: {
        status: 'fail',
        detail,
      },
    },
  };
  writeReport(artifactPath, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
