import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

import { env } from '../config.js';
import { depositToStakingPeriod, findLatestOpenStakingPeriod } from '../tools/stakingPool.js';
import { loadOperatorKeypair } from '../wallet.js';

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const amountSolRaw = readFlag('--amount-sol');
  const amountLamportsRaw = readFlag('--amount-lamports');
  const poolRaw = readFlag('--pool') ?? env.KAMIYO_STAKING_POOL;
  const dryRun = process.argv.includes('--dry-run');

  if (!poolRaw) {
    throw new Error('pool address required (set KAMIYO_STAKING_POOL or pass --pool)');
  }

  const drain = process.argv.includes('--drain');
  const reserveSolRaw = readFlag('--reserve-sol');
  const minSolRaw = readFlag('--min-sol');

  const { keypair, source } = loadOperatorKeypair(env);
  const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');
  const pool = new PublicKey(poolRaw);

  const balance = await connection.getBalance(keypair.publicKey, 'confirmed');

  let amountLamports: bigint;
  if (amountLamportsRaw) {
    amountLamports = BigInt(amountLamportsRaw);
  } else if (amountSolRaw) {
    const sol = Number.parseFloat(amountSolRaw);
    if (!Number.isFinite(sol) || sol <= 0) throw new Error('--amount-sol must be > 0');
    amountLamports = BigInt(Math.round(sol * LAMPORTS_PER_SOL));
  } else if (drain) {
    const reserveSol = reserveSolRaw ? Number.parseFloat(reserveSolRaw) : 0.02;
    const minSol = minSolRaw ? Number.parseFloat(minSolRaw) : 0.01;
    const reserveLamports = BigInt(Math.round(reserveSol * LAMPORTS_PER_SOL));
    const minLamports = BigInt(Math.round(minSol * LAMPORTS_PER_SOL));
    const available = BigInt(balance) > reserveLamports ? BigInt(balance) - reserveLamports : 0n;
    if (available < minLamports) {
      console.log(
        `skip: available=${available} below --min-sol ${minSol} (balance=${balance}, reserve=${reserveLamports})`
      );
      return;
    }
    amountLamports = available;
  } else {
    throw new Error(
      'pass --amount-sol <N>, --amount-lamports <N>, or --drain [--reserve-sol X --min-sol Y]'
    );
  }
  console.log(`depositor: ${keypair.publicKey.toBase58()} (source=${source})`);
  console.log(`balance:   ${balance} lamports (${balance / LAMPORTS_PER_SOL} SOL)`);
  console.log(`pool:      ${pool.toBase58()}`);
  console.log(
    `amount:    ${amountLamports} lamports (${Number(amountLamports) / LAMPORTS_PER_SOL} SOL)`
  );

  const period = await findLatestOpenStakingPeriod(connection, pool);
  if (!period) throw new Error('no open staking period found');
  console.log(`period:    #${period.periodNumber} ${period.statusLabel} ${period.address}`);
  console.log(
    `window:    ${new Date(period.startTime * 1000).toISOString()} → ${new Date(period.endTime * 1000).toISOString()}`
  );
  console.log(`treasury:  ${period.totalTreasuryLamports} lamports before deposit`);

  if (BigInt(balance) <= amountLamports) {
    throw new Error(`balance ${balance} not enough for deposit ${amountLamports} + fees`);
  }

  if (dryRun) {
    console.log('--dry-run set, skipping send');
    return;
  }

  const result = await depositToStakingPeriod({
    connection,
    depositor: keypair,
    pool,
    stakingPeriod: new PublicKey(period.address),
    amountLamports,
  });

  console.log(`signature: ${result.signature}`);
  console.log(`vault:     ${result.periodVault}`);
  console.log(`treasury:  ${result.afterPeriod?.totalTreasuryLamports} after deposit`);
  console.log(`balance:   ${result.afterBalanceLamports} lamports after deposit`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
