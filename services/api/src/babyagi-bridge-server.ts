// Minimal server for BabyAGI bridge endpoints (no Anthropic/Twitter dependencies).

import express from 'express';
import 'dotenv/config';
import { logger } from './logger';
import babyagiRoutes from './api/routes/babyagi';

const port = parseInt(process.env.BABYAGI_PORT || process.env.PORT || '8787', 10);

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'babyagi-bridge' });
});

app.use('/babyagi/v1', babyagiRoutes);

app.listen(port, () => {
  logger.info('BabyAGI bridge server started', { port });
});
