import { createHash } from 'crypto';
import { getCdpClient } from './cdp.js';
import {
  getAgentWallet,
  upsertAgent,
  upsertAgentWallet,
  type AgentWallet,
  type AgentWalletKind,
} from '../db/queries.js';

function slug(value: string, maxLen: number): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '_');
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen);
}

function cdpAccountName(agentId: string, kind: AgentWalletKind): string {
  const short = slug(agentId, 18);
  const hash = createHash('sha256').update(agentId, 'utf8').digest('hex').slice(0, 12);
  return `kamiyo_${kind}_${short}_${hash}`;
}

export async function provisionAgentWallets(params: {
  agentId: string;
  kinds: AgentWalletKind[];
}): Promise<Record<AgentWalletKind, AgentWallet>> {
  await upsertAgent(params.agentId);

  const out = {} as Record<AgentWalletKind, AgentWallet>;
  const cdp = getCdpClient();

  for (const kind of params.kinds) {
    const existing = await getAgentWallet(params.agentId, kind);
    if (existing) {
      out[kind] = existing;
      continue;
    }

    const name = cdpAccountName(params.agentId, kind);

    if (kind === 'evm') {
      const account = await cdp.evm.getOrCreateAccount({ name });
      out[kind] = await upsertAgentWallet({
        agentId: params.agentId,
        kind,
        address: account.address,
        name: account.name,
      });
      continue;
    }

    const account = await cdp.solana.getOrCreateAccount({ name });
    out[kind] = await upsertAgentWallet({
      agentId: params.agentId,
      kind,
      address: account.address,
      name: account.name,
    });
  }

  return out;
}
