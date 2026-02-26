import {
  CDP_ENV,
  inspectCdpEnv,
  createCdpClient,
  compileUsdcSpendPolicy,
  type CdpPolicyNetwork,
} from '@kamiyo/cdp';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const CDP_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'cdp_env_status',
    description: 'Check whether required Coinbase CDP environment variables are configured.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cdp_evm_get_or_create_account',
    description: 'Create or fetch a CDP-managed EVM account.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional account name' },
      },
    },
  },
  {
    name: 'cdp_solana_get_or_create_account',
    description: 'Create or fetch a CDP-managed Solana account.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional account name' },
      },
    },
  },
  {
    name: 'cdp_create_usdc_policy',
    description: 'Create a USDC spend policy in CDP.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        network: { type: 'string', enum: ['base-sepolia', 'base-mainnet'] },
        maxSpendMicroUsd: { type: 'string' },
        allowedMerchants: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['description', 'network', 'maxSpendMicroUsd'],
    },
  },
  {
    name: 'cdp_evm_set_account_policy',
    description: 'Attach a policy to an EVM account.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: '0x-prefixed EVM address' },
        policyId: { type: 'string' },
      },
      required: ['address', 'policyId'],
    },
  },
  {
    name: 'cdp_solana_set_account_policy',
    description: 'Attach a policy to a Solana account.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Solana public key' },
        policyId: { type: 'string' },
      },
      required: ['address', 'policyId'],
    },
  },
  {
    name: 'cdp_create_end_user',
    description: 'Create an authenticated CDP end user profile.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        userId: { type: 'string' },
        createEvmSmartAccount: { type: 'boolean' },
        enableSpendPermissions: { type: 'boolean' },
        createSolanaAccount: { type: 'boolean' },
      },
      required: ['email'],
    },
  },
  {
    name: 'cdp_validate_end_user_access_token',
    description: 'Validate a CDP end-user access token and return its user ID.',
    inputSchema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
      },
      required: ['accessToken'],
    },
  },
];

export function cdpEnvStatus(): {
  ok: boolean;
  env: Record<string, boolean>;
  resolvedFrom: Record<string, string | null>;
  missing: string[];
} {
  const inspection = inspectCdpEnv();
  const env = {
    [CDP_ENV.apiKeyId]: inspection.fields.apiKeyId.configured,
    [CDP_ENV.apiKeySecret]: inspection.fields.apiKeySecret.configured,
    [CDP_ENV.walletSecret]: inspection.fields.walletSecret.configured,
  };

  const resolvedFrom = {
    [CDP_ENV.apiKeyId]: inspection.fields.apiKeyId.source,
    [CDP_ENV.apiKeySecret]: inspection.fields.apiKeySecret.source,
    [CDP_ENV.walletSecret]: inspection.fields.walletSecret.source,
  };

  return { ok: inspection.ok, env, resolvedFrom, missing: inspection.missing };
}

export async function cdpEvmGetOrCreateAccount(params: {
  name?: string;
}): Promise<
  | { success: true; address: string; name?: string }
  | { success: false; error: string }
> {
  try {
    const cdp = createCdpClient();
    const account = params.name
      ? await cdp.evm.getOrCreateAccount({ name: params.name })
      : await cdp.evm.createAccount();

    return { success: true, address: account.address, name: account.name };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpSolanaGetOrCreateAccount(params: {
  name?: string;
}): Promise<
  | { success: true; address: string; name?: string }
  | { success: false; error: string }
> {
  try {
    const cdp = createCdpClient();
    const account = params.name
      ? await cdp.solana.getOrCreateAccount({ name: params.name })
      : await cdp.solana.createAccount();

    return { success: true, address: account.address, name: account.name };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpCreateUsdcPolicy(params: {
  description: string;
  network: CdpPolicyNetwork;
  maxSpendMicroUsd: string;
  allowedMerchants?: string[];
}): Promise<
  | { success: true; policyId: string; scope: string; description?: string }
  | { success: false; error: string }
> {
  try {
    const maxSpendMicroUsd = BigInt(params.maxSpendMicroUsd);

    const policy = compileUsdcSpendPolicy({
      description: params.description,
      network: params.network,
      maxSpendMicroUsd,
      allowedMerchants: params.allowedMerchants,
    });

    const cdp = createCdpClient();
    const created = await cdp.policies.createPolicy({ policy });

    return {
      success: true,
      policyId: created.id,
      scope: created.scope,
      description: created.description,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpCreateEndUser(params: {
  email: string;
  userId?: string;
  createEvmSmartAccount?: boolean;
  enableSpendPermissions?: boolean;
  createSolanaAccount?: boolean;
}): Promise<
  | { success: true; userId: string }
  | { success: false; error: string }
> {
  try {
    const cdp = createCdpClient();

    const endUser = await cdp.endUser.createEndUser({
      userId: params.userId,
      authenticationMethods: [{ type: 'email', email: params.email }],
      evmAccount:
        typeof params.createEvmSmartAccount === 'boolean'
          ? {
              createSmartAccount: params.createEvmSmartAccount,
              enableSpendPermissions: !!params.enableSpendPermissions,
            }
          : undefined,
      solanaAccount: params.createSolanaAccount ? { createSmartAccount: false } : undefined,
    });

    return { success: true, userId: endUser.userId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpValidateEndUserAccessToken(params: {
  accessToken: string;
}): Promise<
  | { success: true; userId: string }
  | { success: false; error: string }
> {
  try {
    const cdp = createCdpClient();
    const user = await cdp.endUser.validateAccessToken({
      accessToken: params.accessToken,
    });
    return { success: true, userId: user.userId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpEvmSetAccountPolicy(params: {
  address: string;
  policyId: string;
}): Promise<
  | { success: true; address: string; policyId: string; policies?: string[] }
  | { success: false; error: string }
> {
  try {
    const trimmed = params.address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      throw new Error('Invalid EVM address');
    }

    const cdp = createCdpClient();
    const updated = await cdp.evm.updateAccount({
      address: trimmed as `0x${string}`,
      update: { accountPolicy: params.policyId },
    });

    return {
      success: true,
      address: updated.address,
      policyId: params.policyId,
      policies: updated.policies,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export async function cdpSolanaSetAccountPolicy(params: {
  address: string;
  policyId: string;
}): Promise<
  | { success: true; address: string; policyId: string; policies?: string[] }
  | { success: false; error: string }
> {
  try {
    const cdp = createCdpClient();
    const updated = await cdp.solana.updateAccount({
      address: params.address,
      update: { accountPolicy: params.policyId },
    });

    return {
      success: true,
      address: updated.address,
      policyId: params.policyId,
      policies: updated.policies,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}
