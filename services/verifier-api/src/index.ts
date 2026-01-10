import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { verifyReputation } from './reputation.js';
import { verifyExclusion, getBlacklistRoot } from './exclusion.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: ['https://blindfoldfinance.com', 'https://www.blindfoldfinance.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/verify/reputation', verifyReputation);
app.post('/verify/exclusion', verifyExclusion);
app.get('/blacklist/root', getBlacklistRoot);

export default app;

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Verifier API running on port ${port}`);
serve({ fetch: app.fetch, port });
