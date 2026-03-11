import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { inspect } from 'node:util';
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
import { createSessionRouter } from './routes/session';
import { createKizunaRouter } from './routes/kizuna';
import { isBaseEnabled } from './services/base-settlement';
import { getSupportedNetworkIds, SOLANA_MAINNET_CAIP2 } from './protocol/networks';

function writeLog(stream: NodeJS.WriteStream, message: string, detail?: unknown): void {
  if (detail === undefined) {
    stream.write(`${message}\n`);
    return;
  }

  const serialized = typeof detail === 'string' ? detail : inspect(detail, { depth: null, breakLength: Infinity });
  stream.write(`${message} ${serialized}\n`);
}

function logInfo(message: string, detail?: unknown): void {
  writeLog(process.stdout, message, detail);
}

function logWarn(message: string, detail?: unknown): void {
  writeLog(process.stderr, message, detail);
}

function logError(message: string, detail?: unknown): void {
  writeLog(process.stderr, message, detail);
}

async function main() {
  const validation = validateConfig();
  for (const warning of validation.warnings) logWarn(`[config] ${warning}`);
  if (!validation.valid) {
    logError('[config] Invalid configuration:');
    for (const err of validation.errors) logError(`  - ${err}`);
    process.exit(1);
  }

  const config = getConfig();
  logInfo('[init] config loaded', getRedactedConfig());

  await runMigrations();
  logInfo('[init] database ready');

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[init] Failed to parse FACILITATOR_PRIVATE_KEY:', message);
    process.exit(1);
  }

  logInfo('[init] facilitator wallet:', facilitatorKeypair.publicKey.toBase58());

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));

  app.use('/widget', rateLimit, express.static(path.join(__dirname, '../public/widget')));

  app.get('/health', rateLimit, (_req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      facilitator: facilitatorKeypair.publicKey.toBase58(),
      network: SOLANA_MAINNET_CAIP2,
      networks: getSupportedNetworkIds(isBaseEnabled()),
    });
  });

  app.use('/.well-known/x402', rateLimit, createDiscoveryRouter());
  app.use('/supported', rateLimit, createSupportedRouter(facilitatorKeypair));
  app.use('/supported-networks', rateLimit, createNetworksRouter());
  app.use('/fees', rateLimit, createFeesRouter());
  app.use('/reputation', rateLimit, createReputationRouter());
  app.use('/session', rateLimit, createSessionRouter(connection, facilitatorKeypair));
  app.use('/kizuna', rateLimit, createKizunaRouter());

  app.use('/verify', optionalApiKeyAuth, rateLimit, createVerifyRouter(connection, facilitatorKeypair.publicKey));
  app.use('/settle', apiKeyAuth, rateLimit, createSettleRouter(connection, facilitatorKeypair));
  app.use('/escrow', apiKeyAuth, rateLimit, createEscrowRouter(connection, facilitatorKeypair));
  app.use('/dispute', apiKeyAuth, rateLimit, createDisputeRouter(connection, facilitatorKeypair));
  app.use('/privacy', apiKeyAuth, rateLimit, createPrivacyRouter(connection, facilitatorKeypair));

  app.use(errorHandler);

  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logInfo(`[init] x402 facilitator listening on :${config.PORT}`);
  });

  async function shutdown(signal: string) {
    logInfo(`[shutdown] ${signal} received`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logError('[fatal] unhandledRejection', err);
  });
  process.on('uncaughtException', (err) => {
    logError('[fatal] uncaughtException', err);
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logError('[fatal]', err);
  process.exit(1);
});
