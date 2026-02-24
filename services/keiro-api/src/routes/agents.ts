import { Hono, type Context, type Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { agentService } from '../services/agents.js';
import { AgentSkillSchema, CreateAgentRequestSchema } from '../types/index.js';
import { z } from 'zod';
import { inferSkills } from '../services/skill-inference.js';
import { polymarketIntelService } from '../services/polymarket-cli.js';
import { agentOpportunityFeedService } from '../services/agent-opportunity-feed.js';
import { verifyWalletSignature } from '../middleware/auth.js';
import { incMetric } from '../services/runtime-metrics.js';

export const agentsRouter = new Hono();

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value);
}

const POLYMARKET_RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  parsePositiveIntEnv('POLYMARKET_ROUTE_RATE_LIMIT_WINDOW_MS', 60_000)
);
const POLYMARKET_RATE_LIMIT_MAX = Math.max(
  1,
  parsePositiveIntEnv('POLYMARKET_ROUTE_RATE_LIMIT_MAX', 30)
);
const polymarketRateLimits = new Map<string, { count: number; resetAt: number }>();

function parseBooleanQuery(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

function getClientIp(c: Context): string {
  const xf = c.req.header('x-forwarded-for');
  const cf = c.req.header('cf-connecting-ip');
  const xr = c.req.header('x-real-ip');
  if (cf) return cf;
  if (xr) return xr;
  if (xf) return xf.split(',')[0].trim();
  return 'unknown';
}

async function polymarketRateLimit(c: Context, next: Next): Promise<Response | void> {
  const auth = c.get('auth') as { walletAddress?: string } | undefined;
  const key = auth?.walletAddress || getClientIp(c);
  const now = Date.now();
  const entry = polymarketRateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    polymarketRateLimits.set(key, {
      count: 1,
      resetAt: now + POLYMARKET_RATE_LIMIT_WINDOW_MS,
    });
    await next();
    return;
  }

  if (entry.count >= POLYMARKET_RATE_LIMIT_MAX) {
    incMetric('polymarket_route_rate_limit_total');
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: 'Polymarket route rate limit exceeded' }, 429);
  }

  entry.count += 1;
  await next();
}

agentsRouter.use('/polymarket/*', verifyWalletSignature, polymarketRateLimit);
agentsRouter.use('/:id/polymarket/opportunities', verifyWalletSignature, polymarketRateLimit);

agentsRouter.post(
  '/infer-skills',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1).max(5000),
      maxSkills: z.number().int().min(1).max(24).optional(),
    })
  ),
  async (c) => {
    const { prompt, maxSkills } = c.req.valid('json');
    const limit = Math.min(24, Math.max(1, maxSkills ?? 4));
    const result = await inferSkills(prompt, limit);
    return c.json(result);
  }
);

agentsRouter.get('/polymarket/health', async (c) => {
  try {
    const status = await polymarketIntelService.status();
    return c.json({ source: 'polymarket-cli', status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 503);
  }
});

agentsRouter.get('/polymarket/markets', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? '10');
  const active = parseBooleanQuery(c.req.query('active'));
  const closed = parseBooleanQuery(c.req.query('closed'));

  try {
    const markets = await polymarketIntelService.listMarkets({
      limit: Number.isFinite(rawLimit) ? rawLimit : 10,
      active,
      closed,
    });
    return c.json({ source: 'polymarket-cli', markets });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 503);
  }
});

agentsRouter.get('/polymarket/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim();
  const rawLimit = Number(c.req.query('limit') ?? '10');
  if (!query) return c.json({ error: 'q is required' }, 400);

  try {
    const markets = await polymarketIntelService.searchMarkets(
      query,
      Number.isFinite(rawLimit) ? rawLimit : 10
    );
    return c.json({ source: 'polymarket-cli', query, markets });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 503);
  }
});

agentsRouter.get('/polymarket/orderbook/:tokenId', async (c) => {
  const tokenId = c.req.param('tokenId');
  try {
    const book = await polymarketIntelService.orderBook(tokenId);
    return c.json({ source: 'polymarket-cli', tokenId, book });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('tokenId must be a numeric string') ? 400 : 503;
    return c.json({ error: message }, status);
  }
});

agentsRouter.get('/', (c) => {
  const agents = agentService.getAll();
  return c.json({ agents });
});

agentsRouter.get('/leaderboard', (c) => {
  const rawLimit = parseInt(c.req.query('limit') || '10', 10);
  const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 10 : rawLimit));
  const agents = agentService.getLeaderboard(limit);
  return c.json({ agents });
});

agentsRouter.get('/wallet/:address', (c) => {
  const address = c.req.param('address');
  const agent = agentService.getByWallet(address);
  if (!agent) return c.json({ error: 'Agent not found for this wallet' }, 404);
  return c.json({ agent });
});

agentsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const agent = agentService.getById(id);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ agent });
});

agentsRouter.get('/:id/polymarket/opportunities', async (c) => {
  const id = c.req.param('id');
  const agent = agentService.getById(id);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const rawLimit = Number(c.req.query('limit') ?? '10');
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.round(rawLimit))) : 10;
  const search = (c.req.query('q') ?? '').trim();
  const forceRefresh = parseBooleanQuery(c.req.query('refresh')) === true;

  try {
    if (search) {
      const markets = await polymarketIntelService.searchMarkets(search, 30);
      const opportunities = polymarketIntelService.rankAgentOpportunities(markets, agent.skills, limit);

      return c.json({
        source: 'polymarket-cli',
        mode: 'search',
        agent: { id: agent.id, skills: agent.skills },
        search,
        opportunities,
      });
    }

    let snapshotState = agentOpportunityFeedService.getSnapshotWithStatus(agent.id);
    if (forceRefresh || !snapshotState.snapshot || snapshotState.stale) {
      try {
        const refreshed = await agentOpportunityFeedService.refreshAgent(agent.id);
        snapshotState = {
          snapshot: refreshed,
          stale: false,
        };
      } catch (error) {
        if (!snapshotState.snapshot) throw error;
      }
    }

    const opportunities = snapshotState.snapshot?.opportunities.slice(0, limit) ?? [];
    if (snapshotState.snapshot && snapshotState.stale) {
      incMetric('agent_opportunity_snapshot_stale_served_total');
    }

    return c.json({
      source: 'polymarket-cli',
      mode: 'snapshot',
      agent: { id: agent.id, skills: agent.skills },
      search: null,
      snapshot: snapshotState.snapshot
        ? {
            updatedAt: snapshotState.snapshot.updatedAt,
            marketUniverseSize: snapshotState.snapshot.marketUniverseSize,
            stale: snapshotState.stale,
            refreshIntervalMs: agentOpportunityFeedService.getRefreshIntervalMs(),
          }
        : {
            updatedAt: null,
            marketUniverseSize: 0,
            stale: true,
            refreshIntervalMs: agentOpportunityFeedService.getRefreshIntervalMs(),
          },
      opportunities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 503);
  }
});

agentsRouter.post(
  '/',
  zValidator('json', CreateAgentRequestSchema),
  (c) => {
    const body = c.req.valid('json');
    try {
      const agent = agentService.create({
        ...body,
        name: body.name.trim(),
      });
      return c.json({ agent }, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  }
);

agentsRouter.patch(
  '/:id',
  zValidator(
    'json',
    z.object({
      name: z.string().min(2).max(24).optional(),
      personality: z.enum(['professional', 'creative', 'efficient', 'balanced']).optional(),
      skills: z.array(AgentSkillSchema).min(1).max(24).optional(),
      isActive: z.boolean().optional(),
    })
  ),
  (c) => {
    const id = c.req.param('id');
    const updates = c.req.valid('json');

    const agent = agentService.update(id, {
      ...updates,
      name: updates.name?.trim() ?? updates.name,
    });
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    return c.json({ agent });
  }
);

agentsRouter.post('/:id/toggle-active', (c) => {
  const id = c.req.param('id');
  const agent = agentService.getById(id);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  const updated = agentService.setActive(id, !agent.isActive);
  return c.json({ agent: updated });
});

agentsRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = agentService.delete(id);
  if (!deleted) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ success: true });
});
