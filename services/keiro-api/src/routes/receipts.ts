import { Hono } from 'hono';
import { agentService } from '../services/agents.js';
import { receiptService } from '../services/receipts.js';

export const receiptsRouter = new Hono();

receiptsRouter.get('/agent/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agent = await agentService.getById(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const limitRaw = c.req.query('limit');
  const limit =
    limitRaw && /^\d+$/.test(limitRaw)
      ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10)))
      : 50;

  const receipts = await receiptService.listByAgent(agentId, limit);
  return c.json({ receipts });
});

receiptsRouter.get('/:receiptId', async (c) => {
  const receiptId = c.req.param('receiptId');
  const receipt = await receiptService.getById(receiptId);
  if (!receipt) return c.json({ error: 'Receipt not found' }, 404);
  return c.json({ receipt });
});

receiptsRouter.get('/:receiptId/verify', async (c) => {
  const receiptId = c.req.param('receiptId');
  const receipt = await receiptService.getById(receiptId);
  if (!receipt) return c.json({ error: 'Receipt not found' }, 404);
  return c.json({ verification: receiptService.verify(receipt) });
});
