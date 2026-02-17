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

  const meishi = getMeishiClient();
  const [passport, mandate] = await Promise.all([
    meishi.fetchPassport(passportKey),
    meishi.getLatestMandate(passportKey),
  ]);

  if (!passport) return c.json({ error: 'Passport not found' }, 404);
  if (!mandate || mandate.revoked) return c.json({ error: 'No valid mandate' }, 404);

  const agentId = passport.agentIdentity.toBase58();
  const passportAddress = passportKey.toBase58();

  const networks = uniqueNetworks(parsed.data.networks);
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
      !parsed.data.forceNewPolicy &&
      existing &&
      existing.mandate_version === mandate.version &&
      (!parsed.data.allowedMerchants || parsed.data.allowedMerchants.length === 0);

    const description =
      parsed.data.description || `Meishi mandate v${mandate.version} for ${agentId}`;

    let policyId = reuse ? existing.policy_id : null;
    if (!policyId) {
      const policy = compileMeishiMandateToCdpPolicy({
        description,
        network: policyNetwork,
        mandate,
        allowedMerchants: parsed.data.allowedMerchants,
      });
      const created = await cdp.policies.createPolicy({ policy });
      policyId = created.id;
    }

    if (kind === 'evm') {
      if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) {
        return c.json({ error: 'Invalid stored EVM wallet address' }, 500);
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

  return c.json({
    passportAddress,
    agentId,
    mandateVersion: mandate.version,
    wallets,
    synced,
  });
});
