import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { agentService } from '../services/agents.js';
import { CreateAgentRequestSchema } from '../types/index.js';
import { z } from 'zod';

export const agentsRouter = new Hono();

// Get all agents
agentsRouter.get('/', (c) => {
  const agents = agentService.getAll();
  return c.json({ agents });
});

// Get leaderboard
agentsRouter.get('/leaderboard', (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const agents = agentService.getLeaderboard(limit);
  return c.json({ agents });
});

// Get agent by ID
agentsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const agent = agentService.getById(id);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({ agent });
});

// Get agent by wallet address
agentsRouter.get('/wallet/:address', (c) => {
  const address = c.req.param('address');
  const agent = agentService.getByWallet(address);

  if (!agent) {
    return c.json({ error: 'Agent not found for this wallet' }, 404);
  }

  return c.json({ agent });
});

// Create new agent
agentsRouter.post(
  '/',
  zValidator('json', CreateAgentRequestSchema),
  (c) => {
    const body = c.req.valid('json');

    try {
      const agent = agentService.create(body);
      return c.json({ agent }, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  }
);

// Update agent
agentsRouter.patch(
  '/:id',
  zValidator(
    'json',
    z.object({
      name: z.string().min(2).max(24).optional(),
      personality: z.enum(['professional', 'creative', 'efficient', 'balanced']).optional(),
      skills: z.array(z.enum(['research', 'writing', 'code_review', 'data_analysis', 'translation', 'general'])).optional(),
      isActive: z.boolean().optional(),
    })
  ),
  (c) => {
    const id = c.req.param('id');
    const updates = c.req.valid('json');

    const agent = agentService.update(id, updates);
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    return c.json({ agent });
  }
);

// Toggle agent active status
agentsRouter.post('/:id/toggle-active', (c) => {
  const id = c.req.param('id');
  const agent = agentService.getById(id);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const updated = agentService.setActive(id, !agent.isActive);
  return c.json({ agent: updated });
});

// Delete agent
agentsRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const deleted = agentService.delete(id);

  if (!deleted) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({ success: true });
});
