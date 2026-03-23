import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import { inspect } from 'node:util';
import { z } from 'zod';
import { isAuthorized } from './auth.js';
import { clearConfigCache, getConfig, getRedactedConfig, validateConfig } from './config.js';
import { closePool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { activatePolicyPack, upsertPolicyPack, upsertSigningKey } from './db/queries.js';
import { clearSigningContextCache, getSigningContext } from './decision/envelope.js';
import {
  evaluateDecision,
  handleCollateralIngest,
  handleCommit,
  handleInternalEvent,
  handleRepaymentIngest,
} from './engine.js';
import { getPolicyPack, listPolicyPacks } from './policy/index.js';

function writeLog(stream: NodeJS.WriteStream, message: string, detail?: unknown): void {
  if (detail === undefined) {
    stream.write(`${message}\n`);
    return;
  }

  const serialized =
    typeof detail === 'string' ? detail : inspect(detail, { depth: null, breakLength: Infinity });
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

const evaluateSchema = z.object({
  agentId: z.string().min(1),
  repayWallet: z.string().min(1),
  payerWallet: z.string().min(1),
  requestNonce: z.string().min(1),
  network: z.string().min(1),
  requestedMicro: z.string().regex(/^\d+$/),
  resource: z.string().optional().nullable(),
  payTo: z.string().optional().nullable(),
  maxSingleMicro: z.string().regex(/^\d+$/).optional(),
  outstandingMicro: z.string().regex(/^\d+$/),
  prefundAvailableMicro: z.string().regex(/^\d+$/).optional().nullable(),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
  mandateSingleLimitMicro: z.string().regex(/^\d+$/).optional().nullable(),
  accountStatus: z.string().min(1),
  accountAgeDays: z.number().int().nonnegative(),
  settlementCount: z.number().int().nonnegative(),
  disputesFiled: z.number().int().nonnegative(),
  disputesWon: z.number().int().nonnegative(),
  avgQuality: z.number().finite(),
  debtClosed: z.number().int().nonnegative(),
  debtTotal: z.number().int().nonnegative(),
  collateral: z
    .object({
      collateralAccount: z.string().min(1),
      assetId: z.string().min(1),
      totalDepositedMicro: z.string().regex(/^\d+$/),
      totalWithdrawnMicro: z.string().regex(/^\d+$/),
      availableMicro: z.string().regex(/^\d+$/),
      effectiveCollateralMicro: z.string().regex(/^\d+$/),
      ltvCapBps: z.number().int().nonnegative().max(10000),
      healthFactor: z.number().finite().nonnegative(),
    })
    .optional(),
});

const commitSchema = z.object({
  decisionId: z.string().min(1),
  debtId: z.string().optional(),
  settlementId: z.string().min(1),
  txHash: z.string().min(1),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
});

const repaymentSchema = z.object({
  agentId: z.string().min(1),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
  referenceId: z.string().min(1),
  amountMicro: z.string().regex(/^\d+$/),
  appliedMicro: z.string().regex(/^\d+$/),
});

const collateralSchema = z.object({
  agentId: z.string().min(1),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
  collateralAccount: z.string().min(1),
  assetId: z.string().min(1),
  amountMicro: z.string().regex(/^\d+$/),
  eventType: z.enum(['deposit', 'withdraw']),
  referenceId: z.string().min(1),
});

const activatePolicySchema = z.object({
  lane: z.enum(['enterprise', 'crypto-fast']),
  policyPackId: z.string().min(1),
  activatedBy: z.string().min(1),
});

const riskOverrideSchema = z.object({
  entityType: z.string().min(1),
  entityKey: z.string().min(1),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
  action: z.enum(['freeze', 'throttle', 'unfreeze']),
  reason: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const internalEventSchema = z.object({
  entityType: z.string().min(1),
  entityKey: z.string().min(1),
  metric: z.enum(['dispute', 'settlement_failure', 'kernel_commit_failure']),
  lane: z.enum(['enterprise', 'crypto-fast']),
  poolId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

async function syncKernelState(): Promise<void> {
  const config = getConfig();
  for (const pack of listPolicyPacks()) {
    await upsertPolicyPack(pack);
  }

  for (const lane of ['enterprise', 'crypto-fast'] as const) {
    const packId = config.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS[lane];
    const pack = getPolicyPack(packId);
    if (!pack || pack.lane !== lane) {
      throw new Error(`active_policy_pack_missing:${lane}:${packId}`);
    }
    await activatePolicyPack({
      lane,
      policyPackId: pack.id,
      policyPackVersion: pack.version,
      activatedBy: 'boot',
    });
  }

  const signingContext = await getSigningContext();
  await upsertSigningKey({
    kid: signingContext.kid,
    backend: getConfig().KIZUNA_KERNEL_SIGNING_BACKEND,
    publicKeyPem: signingContext.publicKeyPem,
  });
}

export function createApp() {
  const app = new Hono();
  const config = getConfig();

  app.use('*', secureHeaders());
  app.use('*', timing());
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    })
  );

  app.get('/', (c) => c.json({ name: 'kizuna-kernel', status: 'ok' }));
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  );

  app.post('/v2/decisions/evaluate', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_INTERNAL_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = evaluateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const pack = getPolicyPack(config.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS[parsed.data.lane]);
    if (!pack) {
      return c.json({ error: 'Active policy pack missing' }, 500);
    }

    const result = await evaluateDecision(parsed.data, pack);
    return c.json(result);
  });

  app.post('/v2/decisions/commit', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_INTERNAL_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = commitSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    await handleCommit(parsed.data);
    return c.json({ ok: true });
  });

  app.post('/v2/repayments/ingest', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_INTERNAL_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = repaymentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    await handleRepaymentIngest(parsed.data);
    return c.json({ ok: true });
  });

  app.post('/v2/collateral/ingest', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_INTERNAL_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = collateralSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    await handleCollateralIngest(parsed.data);
    return c.json({ ok: true });
  });

  app.post('/internal/policy-packs/activate', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_OPERATOR_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = activatePolicySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const pack = getPolicyPack(parsed.data.policyPackId);
    if (!pack || pack.lane !== parsed.data.lane) {
      return c.json({ error: 'Policy pack not found for lane' }, 404);
    }

    await activatePolicyPack({
      lane: parsed.data.lane,
      policyPackId: pack.id,
      policyPackVersion: pack.version,
      activatedBy: parsed.data.activatedBy,
    });
    return c.json({ ok: true, policyPackId: pack.id, policyPackVersion: pack.version });
  });

  app.post('/internal/risk-actions/override', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_OPERATOR_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = riskOverrideSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { createRiskAction } = await import('./db/queries.js');
    const action = await createRiskAction({
      ...parsed.data,
      source: 'operator',
    });
    return c.json({ ok: true, action });
  });

  app.post('/internal/events', async (c) => {
    if (!isAuthorized(c.req.header('authorization'), config.KIZUNA_KERNEL_OPERATOR_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const parsed = internalEventSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    await handleInternalEvent(parsed.data);
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    logError('[error]', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  return app;
}

async function main() {
  clearConfigCache();
  clearSigningContextCache();

  const validation = validateConfig();
  for (const warning of validation.warnings) logWarn(`[config] ${warning}`);
  if (!validation.valid) {
    logError('[config] Invalid configuration:');
    for (const err of validation.errors) logError(`  - ${err}`);
    process.exit(1);
  }

  logInfo('[init] config loaded', getRedactedConfig());
  await runMigrations();
  await syncKernelState();
  logInfo('[init] kernel state ready');

  const app = createApp();
  const server = serve({
    fetch: app.fetch,
    port: getConfig().PORT,
  });

  logInfo(`[init] kizuna-kernel listening on :${getConfig().PORT}`);

  async function shutdown(signal: string) {
    logInfo(`[shutdown] ${signal} received`);
    server.close?.();
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logError('[fatal]', err);
  process.exit(1);
});
