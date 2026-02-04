import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import { agentsRouter } from './routes/agents.js';
import { jobsRouter } from './routes/jobs.js';
import { earningsRouter } from './routes/earnings.js';
import { reputationRouter } from './routes/reputation.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'KEIRO API',
    version: '0.0.1',
    status: 'healthy',
    endpoints: {
      agents: '/api/agents',
      jobs: '/api/jobs',
      earnings: '/api/earnings',
      reputation: '/api/reputation',
    },
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/api/agents', agentsRouter);
app.route('/api/jobs', jobsRouter);
app.route('/api/earnings', earningsRouter);
app.route('/api/reputation', reputationRouter);

// Error handling
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json(
    {
      error: 'Internal server error',
      message: err.message,
    },
    500
  );
});

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting KEIRO API on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`KEIRO API running at http://localhost:${port}`);
