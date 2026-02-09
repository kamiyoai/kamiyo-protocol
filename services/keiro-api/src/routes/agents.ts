import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { agentService } from '../services/agents.js';
import { AgentSkillSchema, CreateAgentRequestSchema } from '../types/index.js';
import { z } from 'zod';
import { inferSkills } from '../services/skill-inference.js';

export const agentsRouter = new Hono();

agentsRouter.post(
  '/infer-skills',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1).max(5000),
      maxSkills: z.number().int().min(1).max(6).optional(),
    })
  ),
  async (c) => {
    const { prompt, maxSkills } = c.req.valid('json');
    const limit = Math.min(6, Math.max(1, maxSkills ?? 4));
    const result = await inferSkills(prompt, limit);
    return c.json(result);
  }
);

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
