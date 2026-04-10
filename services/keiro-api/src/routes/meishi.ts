import { Hono } from 'hono';
import { agentService } from '../services/agents.js';
import { meishiService } from '../services/meishi.js';

export const meishiRouter = new Hono();

function isMeishiNotConfigured(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return 'code' in err && (err as { code?: unknown }).code === 'meishi_not_configured';
}

meishiRouter.get('/passport/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agent = await agentService.getById(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  try {
    const { passport } = await meishiService.getPassportAndMandateByAgent(agent);
    if (!passport) return c.json({ error: 'Passport not found' }, 404);
    return c.json({ passport });
  } catch (err) {
    if (isMeishiNotConfigured(err)) {
      return c.json({ error: 'Meishi not configured' }, 503);
    }
    throw err;
  }
});

meishiRouter.get('/mandate/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agent = await agentService.getById(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  try {
    const { passport, mandate } = await meishiService.getPassportAndMandateByAgent(agent);
    if (!passport) return c.json({ error: 'Passport not found' }, 404);
    if (!mandate) return c.json({ mandate: null });
    return c.json({ mandate });
  } catch (err) {
    if (isMeishiNotConfigured(err)) {
      return c.json({ error: 'Meishi not configured' }, 503);
    }
    throw err;
  }
});
