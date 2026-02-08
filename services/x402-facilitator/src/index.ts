import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bs58 from 'bs58';
import { Connection, Keypair } from '@solana/web3.js';
import { validateConfig, getConfig, getRedactedConfig } from './config';
import { runMigrations } from './db/migrate';
import { closePool } from './db/pool';
import { apiKeyAuth, optionalApiKeyAuth } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { createVerifyRouter } from './routes/verify';
import { createSettleRouter } from './routes/settle';
import { createEscrowRouter } from './routes/escrow';
import { createNetworksRouter } from './routes/networks';
import { createFeesRouter } from './routes/fees';
import { createDisputeRouter } from './routes/dispute';
import { createReputationRouter } from './routes/reputation';
import { createPrivacyRouter } from './routes/privacy';
import { createDiscoveryRouter } from './routes/discovery';
import { createSupportedRouter } from './routes/supported';
import { isBaseEnabled } from './services/base-settlement';
import { getSupportedNetworkIds, SOLANA_MAINNET_CAIP2 } from './protocol/networks';

async function main() {
  const validation = validateConfig();
  for (const warning of validation.warnings) console.warn(`[config] ${warning}`);
  if (!validation.valid) {
    console.error('[config] Invalid configuration:');
    for (const err of validation.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const config = getConfig();
  console.log('[init] config loaded', getRedactedConfig());

  await runMigrations();
  console.log('[init] database ready');

  const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

  let facilitatorKeypair: Keypair;
  try {
    const pkData = (config.FACILITATOR_PRIVATE_KEY || '').trim();
    let secret: Uint8Array;
    if (pkData.startsWith('[')) {
      const parsed = Uint8Array.from(JSON.parse(pkData));
      if (parsed.length !== 64) throw new Error('secret key must be 64 bytes');
      secret = parsed;
    } else {
      const decoded = bs58.decode(pkData);
      if (decoded.length !== 64) throw new Error('base58 secret must decode to 64 bytes');
      secret = decoded;
    }
    facilitatorKeypair = Keypair.fromSecretKey(secret);
  } catch (err: any) {
    console.error('[init] Failed to parse FACILITATOR_PRIVATE_KEY:', err.message);
    process.exit(1);
  }

  console.log('[init] facilitator wallet:', facilitatorKeypair.publicKey.toBase58());

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));
  app.use(rateLimit);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      facilitator: facilitatorKeypair.publicKey.toBase58(),
      network: SOLANA_MAINNET_CAIP2,
      networks: getSupportedNetworkIds(isBaseEnabled()),
    });
  });

  app.use('/.well-known/x402', createDiscoveryRouter());
  app.use('/supported', createSupportedRouter(facilitatorKeypair));
  app.use('/supported-networks', createNetworksRouter());
  app.use('/fees', createFeesRouter());

  app.use('/verify', optionalApiKeyAuth, createVerifyRouter(connection));
  app.use('/settle', apiKeyAuth, createSettleRouter(connection, facilitatorKeypair));
  app.use('/escrow', apiKeyAuth, createEscrowRouter(connection, facilitatorKeypair));
  app.use('/dispute', apiKeyAuth, createDisputeRouter(connection, facilitatorKeypair));
  app.use('/reputation', createReputationRouter());
  app.use('/privacy', apiKeyAuth, createPrivacyRouter(connection, facilitatorKeypair));

  app.use(errorHandler);

  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`[init] x402 facilitator listening on :${config.PORT}`);
  });

  async function shutdown(signal: string) {
    console.log(`[shutdown] ${signal} received`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    console.error('[fatal] unhandledRejection', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException', err);
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
