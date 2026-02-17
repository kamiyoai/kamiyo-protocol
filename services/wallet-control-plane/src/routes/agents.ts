import { Hono } from 'hono';
import { z } from 'zod';
import { provisionAgentWallets } from '../services/agents.js';

const BodySchema = z
  .object({
    evm: z.boolean().optional(),
    solana: z.boolean().optional(),
  })
  .strict();

function parseAgentId(raw: string): string | null {
  const agentId = raw.trim();
  if (!agentId) return null;
  if (agentId.length > 128) return null;
  return agentId;
}

export const agentsRouter = new Hono();

agentsRouter.post('/v1/agents/:agentId/wallets/provision', async (c) => {
  const agentId = parseAgentId(c.req.param('agentId'));
  if (!agentId) return c.json({ error: 'Invalid agentId' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const includeEvm = parsed.data.evm !== false;
  const includeSolana = parsed.data.solana !== false;

  const kinds = [
    ...(includeEvm ? (['evm'] as const) : []),
    ...(includeSolana ? (['solana'] as const) : []),
  ];

  if (kinds.length === 0) {
    return c.json({ error: 'No wallet kinds requested' }, 400);
  }

  const wallets = await provisionAgentWallets({ agentId, kinds: [...kinds] });

  return c.json({ agentId, wallets });
});
