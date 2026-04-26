#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';

import { runRead } from './commands/read';
import { runUnderwrite } from './commands/underwrite';
import { runReservation } from './commands/reservation';
import { runSettle } from './commands/settle';
import type { SolanaCluster } from '@kamiyo/saep-adapter';

function parseCluster(value: string): SolanaCluster {
  if (value === 'mainnet-beta' || value === 'devnet') return value;
  throw new Error(`unsupported cluster: ${value}`);
}

const program = new Command();
program
  .name('kamiyo-saep')
  .description('Operator CLI for the KAMIYO SAEP adapter')
  .version('0.1.0');

program
  .command('read')
  .description('Decode a SAEP TaskContract account')
  .argument('<taskPda>', 'Base58 SAEP TaskContract PDA')
  .option('-c, --cluster <cluster>', 'mainnet-beta | devnet', 'mainnet-beta')
  .option('--json', 'emit raw JSON only', false)
  .action(async (taskPda: string, opts: { cluster: string; json: boolean }) => {
    const code = await runRead(taskPda, {
      cluster: parseCluster(opts.cluster),
      json: opts.json,
    });
    process.exit(code);
  });

program
  .command('underwrite')
  .description('POST /kizuna/adapters/saep/underwrite via the facilitator')
  .argument('<taskPda>', 'Base58 SAEP TaskContract PDA')
  .requiredOption('--agent-id <id>', 'Kizuna agent id')
  .requiredOption('--payer <wallet>', 'Kizuna payer wallet (base58)')
  .requiredOption('--collateral <account>', 'Kizuna collateral account')
  .requiredOption('--idempotency-key <key>', 'request nonce / idempotency key')
  .option('-c, --cluster <cluster>', 'mainnet-beta | devnet', 'mainnet-beta')
  .option('--json', 'emit raw JSON only', false)
  .action(
    async (
      taskPda: string,
      opts: {
        agentId: string;
        payer: string;
        collateral: string;
        idempotencyKey: string;
        cluster: string;
        json: boolean;
      }
    ) => {
      const code = await runUnderwrite(taskPda, {
        agentId: opts.agentId,
        payerWallet: opts.payer,
        collateralAccount: opts.collateral,
        idempotencyKey: opts.idempotencyKey,
        cluster: parseCluster(opts.cluster),
        json: opts.json,
      });
      process.exit(code);
    }
  );

program
  .command('reservation')
  .description('GET /kizuna/adapters/saep/reservations/:id')
  .argument('<reservationId>', 'reservation uuid')
  .option('--json', 'emit raw JSON only', false)
  .action(async (reservationId: string, opts: { json: boolean }) => {
    const code = await runReservation(reservationId, opts.json);
    process.exit(code);
  });

program
  .command('settle')
  .description('POST /kizuna/adapters/saep/settlement-ingest')
  .argument('<reservationId>', 'reservation uuid')
  .requiredOption('--release-signature <sig>', 'SAEP release tx signature')
  .option('-t, --task-pda <pda>', 'override taskPda (otherwise resolved from decision)')
  .option('-c, --cluster <cluster>', 'override cluster (mainnet-beta | devnet)')
  .option('-m, --merchant-wallet <wallet>', 'merchant wallet override')
  .option('--json', 'emit raw JSON only', false)
  .action(
    async (
      reservationId: string,
      opts: {
        releaseSignature: string;
        taskPda?: string;
        cluster?: string;
        merchantWallet?: string;
        json: boolean;
      }
    ) => {
      const code = await runSettle(reservationId, {
        releaseSignature: opts.releaseSignature,
        ...(opts.taskPda && { taskPda: opts.taskPda }),
        ...(opts.cluster && { cluster: parseCluster(opts.cluster) }),
        ...(opts.merchantWallet && { merchantWallet: opts.merchantWallet }),
        json: opts.json,
      });
      process.exit(code);
    }
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
