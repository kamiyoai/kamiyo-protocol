import { Hono } from 'hono';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { compileMeishiMandateToCdpPolicy, type CdpPolicyNetwork } from '@kamiyo/cdp';

import { getCdpClient } from '../services/cdp.js';
import { getMeishiClient } from '../services/meishi.js';
import { provisionAgentWallets } from '../services/agents.js';
import { getMandatePolicy, upsertMandatePolicy, type AgentWalletKind } from '../db/queries.js';

export const mandatesRouter = new Hono();

const SyncSchema = z
  .object({
    networks: z.array(z.enum(['base', 'solana'])).optional(),
    allowedMerchants: z.array(z.string().min(1)).optional(),
    description: z.string().min(1).max(200).optional(),
    forceNewPolicy: z.boolean().optional(),
  })
  .strict();

type SyncNetwork = z.infer<typeof SyncSchema>['networks'];

type HttpStatus = 400 | 404 | 500;

class HttpError extends Error {
  readonly status: HttpStatus;

  constructor(status: HttpStatus, message: string) {
    super(message);
    this.status = status;
  }
}

function uniqueNetworks(value: SyncNetwork | undefined): ('base' | 'solana')[] {
  const raw = value?.length ? value : (['base', 'solana'] as const);
  const out: ('base' | 'solana')[] = [];
  const seen = new Set<string>();

  for (const v of raw) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
}

function walletKindForNetwork(network: 'base' | 'solana'): AgentWalletKind {
  return network === 'base' ? 'evm' : 'solana';
}

function policyNetworkFor(network: 'base' | 'solana'): CdpPolicyNetwork {
  return network === 'base' ? 'base' : 'solana';
}

async function syncMandatePolicies(params: {
  passportKey: PublicKey;
  options: z.infer<typeof SyncSchema>;
}): Promise<Record<string, unknown>> {
  const meishi = getMeishiClient();
  const [passport, mandate] = await Promise.all([
    meishi.fetchPassport(params.passportKey),
    meishi.getLatestMandate(params.passportKey),
  ]);

  if (!passport) throw new HttpError(404, 'Passport not found');
  if (!mandate || mandate.revoked) throw new HttpError(404, 'No valid mandate');

  const agentId = passport.agentIdentity.toBase58();
  const passportAddress = params.passportKey.toBase58();

  const networks = uniqueNetworks(params.options.networks);
  const kinds = Array.from(new Set(networks.map(walletKindForNetwork)));
  const wallets = await provisionAgentWallets({ agentId, kinds });

  const cdp = getCdpClient();
  const synced: Record<string, unknown> = {};

  for (const net of networks) {
    const kind = walletKindForNetwork(net);
    const policyNetwork = policyNetworkFor(net);
    const wallet = wallets[kind];

    const existing = await getMandatePolicy(passportAddress, kind);
    const reuse =
      !params.options.forceNewPolicy &&
      existing &&
      existing.mandate_version === mandate.version &&
      (!params.options.allowedMerchants || params.options.allowedMerchants.length === 0);

    const description = params.options.description || `Meishi mandate v${mandate.version} for ${agentId}`;

    let policyId = reuse ? existing.policy_id : null;
    if (!policyId) {
      const policy = compileMeishiMandateToCdpPolicy({
        description,
        network: policyNetwork,
        mandate,
        allowedMerchants: params.options.allowedMerchants,
      });

      const created = await cdp.policies.createPolicy({ policy });
      policyId = created.id;
    }

    if (kind === 'evm') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) {
        throw new HttpError(500, 'Invalid stored EVM wallet address');
      }
      await cdp.evm.updateAccount({
        address: wallet.address as `0x${string}`,
        update: { accountPolicy: policyId },
      });
    } else {
      await cdp.solana.updateAccount({
        address: wallet.address,
        update: { accountPolicy: policyId },
      });
    }

    await upsertMandatePolicy({
      passportAddress,
      agentId,
      kind,
      mandateVersion: mandate.version,
      policyId,
    });

    synced[net] = { policyId, reused: reuse };
  }

  return {
    passportAddress,
    agentId,
    mandateVersion: mandate.version,
    wallets,
    synced,
  };
}

mandatesRouter.post('/v1/mandates/:passportAddress/sync', async (c) => {
  const passportRaw = c.req.param('passportAddress').trim();
  let passportKey: PublicKey;
  try {
    passportKey = new PublicKey(passportRaw);
  } catch {
    return c.json({ error: 'Invalid passportAddress' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = SyncSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  try {
    return c.json(await syncMandatePolicies({ passportKey, options: parsed.data }));
  } catch (err) {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    console.error('[mandates] sync failed', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

mandatesRouter.post('/v1/agents/:agentId/mandate/sync', async (c) => {
  const agentRaw = c.req.param('agentId').trim();
  let agentIdentity: PublicKey;
  try {
    agentIdentity = new PublicKey(agentRaw);
  } catch {
    return c.json({ error: 'Invalid agentId (expected a Solana public key)' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = SyncSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  try {
    const meishi = getMeishiClient();
    const [passportKey] = meishi.getPassportPDA(agentIdentity);
    return c.json(await syncMandatePolicies({ passportKey, options: parsed.data }));
  } catch (err) {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    console.error('[mandates] sync failed', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
