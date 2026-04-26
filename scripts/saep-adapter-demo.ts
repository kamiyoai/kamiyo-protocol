#!/usr/bin/env npx tsx
/**
 * SAEP adapter end-to-end demo (W5).
 *
 * Walks through the full happy-path of the `/kizuna/adapters/saep/*` surface:
 *   1. health probe
 *   2. underwrite a SAEP task → reservation + decision id
 *   3. read reservation back
 *   4. settle (settlement-ingest) using the persisted externalWorkRef
 *
 * Designed to run against a live x402-facilitator with Kizuna enabled and a
 * pre-funded SAEP task. Inputs come from environment variables so the script
 * stays repo-checkable without baking in real PDAs.
 *
 *   KAMIYO_FACILITATOR_URL=http://localhost:3000 \
 *   KAMIYO_INTERNAL_TOKEN=... \
 *   SAEP_DEMO_TASK_PDA=<base58> \
 *   SAEP_DEMO_AGENT_ID=agent-1 \
 *   SAEP_DEMO_PAYER_WALLET=<base58> \
 *   SAEP_DEMO_COLLATERAL_ACCOUNT=<base58> \
 *   SAEP_DEMO_RELEASE_SIGNATURE=<base58 tx sig> \
 *   SAEP_DEMO_CLUSTER=devnet \
 *   npx tsx scripts/saep-adapter-demo.ts
 */

import chalk from 'chalk';

interface DemoEnv {
  taskPda: string;
  agentId: string;
  payerWallet: string;
  collateralAccount: string;
  releaseSignature: string;
  cluster: 'mainnet-beta' | 'devnet';
  facilitatorUrl: string;
  internalToken: string;
}

function readEnv(): DemoEnv {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      console.error(chalk.red(`Missing env: ${name}`));
      process.exit(1);
    }
    return value;
  };
  const cluster = (process.env.SAEP_DEMO_CLUSTER ?? 'mainnet-beta') as 'mainnet-beta' | 'devnet';
  if (cluster !== 'mainnet-beta' && cluster !== 'devnet') {
    console.error(chalk.red(`Invalid SAEP_DEMO_CLUSTER: ${cluster}`));
    process.exit(1);
  }
  return {
    taskPda: required('SAEP_DEMO_TASK_PDA'),
    agentId: required('SAEP_DEMO_AGENT_ID'),
    payerWallet: required('SAEP_DEMO_PAYER_WALLET'),
    collateralAccount: required('SAEP_DEMO_COLLATERAL_ACCOUNT'),
    releaseSignature: required('SAEP_DEMO_RELEASE_SIGNATURE'),
    cluster,
    facilitatorUrl: (process.env.KAMIYO_FACILITATOR_URL ?? 'http://localhost:3000').replace(
      /\/+$/,
      ''
    ),
    internalToken: required('KAMIYO_INTERNAL_TOKEN'),
  };
}

async function call(
  env: DemoEnv,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.internalToken}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${env.facilitatorUrl}${path}`, init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

function step(n: number, title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`[${n}] ${title}`));
  console.log(chalk.gray('─'.repeat(60)));
}

function expectOk(label: string, status: number, body: unknown): void {
  if (status >= 200 && status < 300) {
    console.log(chalk.green(`  ✓ ${label} HTTP ${status}`));
    return;
  }
  console.log(chalk.red(`  ✗ ${label} HTTP ${status}`));
  console.log(JSON.stringify(body, null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  const env = readEnv();

  console.log(chalk.bold.magenta('\nKAMIYO SAEP adapter — end-to-end demo'));
  console.log(chalk.gray(`  facilitator: ${env.facilitatorUrl}`));
  console.log(chalk.gray(`  cluster:     ${env.cluster}`));
  console.log(chalk.gray(`  task:        ${env.taskPda}`));

  step(1, 'GET /kizuna/adapters/saep/health');
  const health = await call(env, 'GET', '/kizuna/adapters/saep/health');
  expectOk('health', health.status, health.body);
  console.log(JSON.stringify(health.body, null, 2));

  step(2, 'POST /kizuna/adapters/saep/underwrite');
  const idempotencyKey = `saep-demo-${Date.now()}`;
  const underwrite = await call(env, 'POST', '/kizuna/adapters/saep/underwrite', {
    agentId: env.agentId,
    payerWallet: env.payerWallet,
    collateralAccount: env.collateralAccount,
    taskPda: env.taskPda,
    cluster: env.cluster,
    idempotencyKey,
  });
  expectOk('underwrite', underwrite.status, underwrite.body);
  const escrowRef = (underwrite.body as { escrowRef: string }).escrowRef;
  console.log(JSON.stringify(underwrite.body, null, 2));
  console.log(chalk.gray(`  → reservation id: ${escrowRef}`));

  step(3, `GET /kizuna/adapters/saep/reservations/${escrowRef}`);
  const reservation = await call(
    env,
    'GET',
    `/kizuna/adapters/saep/reservations/${encodeURIComponent(escrowRef)}`
  );
  expectOk('reservation', reservation.status, reservation.body);
  console.log(JSON.stringify(reservation.body, null, 2));

  step(4, 'POST /kizuna/adapters/saep/settlement-ingest');
  console.log(
    chalk.gray('  taskPda + cluster omitted on purpose — resolved from the persisted decision.')
  );
  const settle = await call(env, 'POST', '/kizuna/adapters/saep/settlement-ingest', {
    reservationId: escrowRef,
    releaseSignature: env.releaseSignature,
  });
  expectOk('settle', settle.status, settle.body);
  console.log(JSON.stringify(settle.body, null, 2));

  console.log('');
  console.log(chalk.bold.green('All steps OK.'));
}

main().catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
