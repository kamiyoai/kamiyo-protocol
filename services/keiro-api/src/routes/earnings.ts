import { Hono } from 'hono';
import { earningsService } from '../services/earnings.js';
import { agentService } from '../services/agents.js';

export const earningsRouter = new Hono();

// Get earnings for an agent
earningsRouter.get('/agent/:agentId', (c) => {
  const agentId = c.req.param('agentId');
  const status = c.req.query('status');

  const agent = agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  let earnings = earningsService.getByAgent(agentId);

  if (status) {
    earnings = earnings.filter(e => e.status === status);
  }

  return c.json({ earnings });
});

// Get earnings stats for an agent
earningsRouter.get('/agent/:agentId/stats', (c) => {
  const agentId = c.req.param('agentId');

  const agent = agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const stats = earningsService.getStats(agentId);
  return c.json({ stats });
});

// Get specific earning
earningsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const earning = earningsService.getById(id);

  if (!earning) {
    return c.json({ error: 'Earning not found' }, 404);
  }

  return c.json({ earning });
});

// Get pending earnings for withdrawal
earningsRouter.get('/agent/:agentId/pending', (c) => {
  const agentId = c.req.param('agentId');

  const agent = agentService.getById(agentId);
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const pending = earningsService.getPending(agentId);
  const total = earningsService.getTotalPending(agentId);

  return c.json({ earnings: pending, total });
});
