import {
  CDP_ENV,
  createCdpClient,
  compileUsdcSpendPolicy,
  type CdpPolicyNetwork,
} from '@kamiyo/cdp';

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

export function cdpEnvStatus(): {
  ok: boolean;
  env: Record<string, boolean>;
} {
  const env = {
    [CDP_ENV.apiKeyId]: hasEnv(CDP_ENV.apiKeyId),
    [CDP_ENV.apiKeySecret]: hasEnv(CDP_ENV.apiKeySecret),
    [CDP_ENV.walletSecret]: hasEnv(CDP_ENV.walletSecret),
  };

  return { ok: Object.values(env).every(Boolean), env };
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
