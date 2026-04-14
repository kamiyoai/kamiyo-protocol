import { Hono } from 'hono';
import { earningsService } from '../services/earnings.js';
import { agentService } from '../services/agents.js';

export const earningsRouter = new Hono();

earningsRouter.get('/agent/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const status = c.req.query('status');

  const agent = await agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  let earnings = await earningsService.getByAgent(agentId);
  if (status) {
    earnings = earnings.filter((earning) => earning.status === status);
  }

  return c.json({ earnings });
});

earningsRouter.get('/agent/:agentId/stats', async (c) => {
  const agentId = c.req.param('agentId');

  const agent = await agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const stats = await earningsService.getStats(agentId);
  return c.json({ stats });
});

earningsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const earning = await earningsService.getById(id);

  if (!earning) {
    return c.json({ error: 'Earning not found' }, 404);
  }

  return c.json({ earning });
});

earningsRouter.get('/agent/:agentId/pending', async (c) => {
  const agentId = c.req.param('agentId');

  const agent = await agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const pending = await earningsService.getPending(agentId);
  const total = await earningsService.getTotalPending(agentId);

  return c.json({ earnings: pending, total });
});
