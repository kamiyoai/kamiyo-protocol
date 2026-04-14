#!/usr/bin/env node
import fs from 'node:fs';
import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

const STAKING_PROGRAM_ID = new PublicKey('CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb');
const STAKING_PERIOD_DISCRIMINATOR = Buffer.from([239, 137, 140, 7, 183, 139, 119, 57]);
const DEPOSIT_TO_PERIOD_DISCRIMINATOR = Buffer.from([186, 73, 80, 101, 8, 61, 232, 107]);
const CREATE_STAKING_PERIOD_DISCRIMINATOR = Buffer.from([202, 135, 16, 155, 165, 246, 201, 241]);
const ACTIVATE_PERIOD_DISCRIMINATOR = Buffer.from([54, 213, 53, 207, 247, 10, 172, 34]);
const DEFAULT_PERIOD_DURATION_SECONDS = 7 * 24 * 60 * 60;

const STAKING_PERIOD_DATA_LEN = 200;
const STAKING_PERIOD_POOL_OFFSET = 8;
const STAKING_PERIOD_NUMBER_OFFSET = 72;
const STAKING_PERIOD_START_TIME_OFFSET = 80;
const STAKING_PERIOD_END_TIME_OFFSET = 88;
const STAKING_PERIOD_TOTAL_TREASURY_OFFSET = 96;
const STAKING_PERIOD_TOTAL_CLAIMED_OFFSET = 104;
const STAKING_PERIOD_STATUS_OFFSET = 132;
const U64_MAX = (1n << 64n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

function fail(code, message, details = {}) {
  const payload = {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
}

function env(name, fallback = '') {
  const value = process.env[name];
  if (value == null) return fallback;
  return String(value).trim();
}

function envNumber(name, fallback = 0) {
  const raw = env(name, '');
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBool(name, fallback = false) {
  const raw = env(name, '');
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function parsePoolAddress(poolUrl) {
  const text = String(poolUrl || '').trim().replace(/\/+$/, '');
  if (!text) fail('missing_pool_url', 'missing staking pool url');
  const poolId = text.split('/').pop();
  if (!poolId) fail('invalid_pool_url', 'unable to parse staking pool address', { poolUrl: text });
  try {
    return new PublicKey(poolId);
  } catch (error) {
    fail('invalid_pool_pubkey', 'invalid staking pool address', {
      poolId,
      reason: String(error?.message || error),
    });
  }
}

function loadKeypair(pathValue, missingCode) {
  const path = env(pathValue, '');
  if (!path) fail(missingCode, `missing ${pathValue.toLowerCase()}`, { env: pathValue });
  let raw = '';
  try {
    raw = fs.readFileSync(path, 'utf8').trim();
  } catch (error) {
    fail('keypair_read_failed', 'failed to read keypair file', {
      env: pathValue,
      path,
      reason: String(error?.message || error),
    });
  }
  if (!raw) fail('empty_keypair_file', 'keypair file is empty', { env: pathValue, path });
  let secret;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('expected JSON array');
    secret = Uint8Array.from(parsed);
  } catch (error) {
    fail('invalid_keypair_file', 'invalid Solana keypair file', {
      env: pathValue,
      path,
      reason: String(error?.message || error),
    });
  }
  try {
    return { keypair: Keypair.fromSecretKey(secret), path };
  } catch (error) {
    fail('invalid_keypair_secret', 'unable to construct keypair from secret', {
      env: pathValue,
      path,
      reason: String(error?.message || error),
    });
  }
}

function statusLabel(status) {
  if (status === 0) return 'pending';
  if (status === 1) return 'active';
  if (status === 2) return 'finalized';
  if (status === 3) return 'cancelled';
  return 'unknown';
}

function toSnapshot(period) {
  return {
    address: period.address.toBase58(),
    pool: period.pool.toBase58(),
    periodNumber: period.periodNumber.toString(),
    startTime: period.startTime,
    endTime: period.endTime,
    totalTreasuryLamports: period.totalTreasuryLamports.toString(),
    totalClaimedLamports: period.totalClaimedLamports.toString(),
    status: period.status,
    statusLabel: statusLabel(period.status),
  };
}

function parseStakingPeriodAccount(account, data) {
  if (data.length < STAKING_PERIOD_DATA_LEN) return null;
  if (!data.subarray(0, 8).equals(STAKING_PERIOD_DISCRIMINATOR)) return null;

  const status = data.readUInt8(STAKING_PERIOD_STATUS_OFFSET);
  if (status < 0 || status > 3) return null;

  return {
    address: account,
    pool: new PublicKey(data.subarray(STAKING_PERIOD_POOL_OFFSET, STAKING_PERIOD_POOL_OFFSET + 32)),
    periodNumber: data.readBigUInt64LE(STAKING_PERIOD_NUMBER_OFFSET),
    startTime: Number(data.readBigInt64LE(STAKING_PERIOD_START_TIME_OFFSET)),
    endTime: Number(data.readBigInt64LE(STAKING_PERIOD_END_TIME_OFFSET)),
    totalTreasuryLamports: data.readBigUInt64LE(STAKING_PERIOD_TOTAL_TREASURY_OFFSET),
    totalClaimedLamports: data.readBigUInt64LE(STAKING_PERIOD_TOTAL_CLAIMED_OFFSET),
    status,
  };
}

function encodeU64(value) {
  if (value < 0n || value > U64_MAX) {
    fail('u64_out_of_range', 'u64 out of range', { value: value.toString() });
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
}

function encodeI64(value) {
  if (value < I64_MIN || value > I64_MAX) {
    fail('i64_out_of_range', 'i64 out of range', { value: value.toString() });
  }
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(value, 0);
  return out;
}

function getStakingConfig() {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config', 'utf8')], STAKING_PROGRAM_ID);
  return config;
}

function getStakingPeriod(pool, periodNumber) {
  const [stakingPeriod] = PublicKey.findProgramAddressSync(
    [Buffer.from('staking_period', 'utf8'), pool.toBuffer(), encodeU64(periodNumber)],
    STAKING_PROGRAM_ID
  );
  return stakingPeriod;
}

function getPeriodVault(pool, periodNumber) {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('period_vault', 'utf8'), pool.toBuffer(), encodeU64(periodNumber)],
    STAKING_PROGRAM_ID
  );
  return vault;
}

async function findPoolStakingPeriods(connection, pool) {
  const accounts = await connection.getProgramAccounts(STAKING_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(STAKING_PERIOD_DISCRIMINATOR) } },
      { memcmp: { offset: STAKING_PERIOD_POOL_OFFSET, bytes: pool.toBase58() } },
    ],
  });

  const periods = accounts
    .map(account => parseStakingPeriodAccount(account.pubkey, account.account.data))
    .filter(period => period !== null);
  periods.sort((a, b) => (a.periodNumber === b.periodNumber ? 0 : a.periodNumber > b.periodNumber ? -1 : 1));
  return periods;
}

async function readStakingPeriod(connection, stakingPeriod) {
  const info = await connection.getAccountInfo(stakingPeriod, 'confirmed');
  if (!info) return null;
  const parsed = parseStakingPeriodAccount(stakingPeriod, info.data);
  if (!parsed) return null;
  return toSnapshot(parsed);
}

async function findLatestOpenStakingPeriod(connection, pool) {
  const openPeriods = (await findPoolStakingPeriods(connection, pool)).filter(
    period => period.status === 0 || period.status === 1
  );
  if (!openPeriods.length) return null;
  return toSnapshot(openPeriods[0]);
}

async function findLatestStakingPeriod(connection, pool) {
  const periods = await findPoolStakingPeriods(connection, pool);
  return periods[0] ? toSnapshot(periods[0]) : null;
}

async function createStakingPeriod({ connection, admin, pool, periodNumber, startTime, endTime }) {
  const config = getStakingConfig();
  const stakingPeriod = getStakingPeriod(pool, periodNumber);
  const periodVault = getPeriodVault(pool, periodNumber);

  const ix = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: stakingPeriod, isSigner: false, isWritable: true },
      { pubkey: periodVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      CREATE_STAKING_PERIOD_DISCRIMINATOR,
      encodeU64(periodNumber),
      encodeI64(BigInt(startTime)),
      encodeI64(BigInt(endTime)),
    ]),
  });

  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = admin.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(admin);

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  return {
    signature,
    stakingPeriod: stakingPeriod.toBase58(),
    periodVault: periodVault.toBase58(),
  };
}

async function activateStakingPeriod({ connection, caller, pool, stakingPeriod }) {
  const ix = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: caller.publicKey, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: stakingPeriod, isSigner: false, isWritable: true },
    ],
    data: ACTIVATE_PERIOD_DISCRIMINATOR,
  });

  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = caller.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(caller);

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );
  return signature;
}

async function ensureOpenStakingPeriod({ connection, admin, pool }) {
  const now = Math.floor(Date.now() / 1000);
  let period = await findLatestOpenStakingPeriod(connection, pool);
  if (period) {
    if (period.status === 0 && period.startTime <= now) {
      try {
        const activateSignature = await activateStakingPeriod({
          connection,
          caller: admin,
          pool,
          stakingPeriod: new PublicKey(period.address),
        });
        const refreshed = await readStakingPeriod(connection, new PublicKey(period.address));
        return {
          period: refreshed ?? period,
          createdPeriod: null,
          createSignature: null,
          activateSignature,
        };
      } catch {
        const refreshed = await readStakingPeriod(connection, new PublicKey(period.address));
        return {
          period: refreshed ?? period,
          createdPeriod: null,
          createSignature: null,
          activateSignature: null,
        };
      }
    }
    return {
      period,
      createdPeriod: null,
      createSignature: null,
      activateSignature: null,
    };
  }

  const latest = await findLatestStakingPeriod(connection, pool);
  if (!latest) {
    return { period: null, createdPeriod: null, createSignature: null, activateSignature: null };
  }

  const previousPeriodNumber = BigInt(latest.periodNumber);
  const nextPeriodNumber = previousPeriodNumber + 1n;
  const previousDuration = latest.endTime - latest.startTime;
  const duration = previousDuration > 0 ? previousDuration : DEFAULT_PERIOD_DURATION_SECONDS;
  const startTime = Math.max(now, latest.endTime);
  const endTime = startTime + duration;

  let createSignature = null;
  let activateSignature = null;
  let createdPeriod = null;

  try {
    const created = await createStakingPeriod({
      connection,
      admin,
      pool,
      periodNumber: nextPeriodNumber,
      startTime,
      endTime,
    });
    createSignature = created.signature;
    createdPeriod = await readStakingPeriod(connection, new PublicKey(created.stakingPeriod));
  } catch (error) {
    const maybeOpen = await findLatestOpenStakingPeriod(connection, pool);
    if (maybeOpen) {
      return {
        period: maybeOpen,
        createdPeriod: null,
        createSignature: null,
        activateSignature: null,
      };
    }
    throw error;
  }

  if (startTime <= now) {
    try {
      const stakingPeriod = createdPeriod ? new PublicKey(createdPeriod.address) : getStakingPeriod(pool, nextPeriodNumber);
      activateSignature = await activateStakingPeriod({
        connection,
        caller: admin,
        pool,
        stakingPeriod,
      });
      createdPeriod = (await readStakingPeriod(connection, stakingPeriod)) ?? createdPeriod;
    } catch {
      // keep pending period if activation fails
    }
  }

  period = (await findLatestOpenStakingPeriod(connection, pool)) ?? createdPeriod;
  return {
    period,
    createdPeriod,
    createSignature,
    activateSignature,
  };
}

async function depositToStakingPeriod({ connection, depositor, pool, stakingPeriod, amountLamports, dryRun = false }) {
  const beforeBalanceLamports = await connection.getBalance(depositor.publicKey, 'confirmed');
  const beforePeriod = await readStakingPeriod(connection, stakingPeriod);
  if (!beforePeriod) fail('missing_staking_period', 'staking period account not found or invalid');
  if (beforePeriod.pool !== pool.toBase58()) {
    fail('staking_period_pool_mismatch', 'staking period pool mismatch', {
      expected: pool.toBase58(),
      actual: beforePeriod.pool,
    });
  }
  const periodVault = getPeriodVault(pool, BigInt(beforePeriod.periodNumber));

  if (dryRun) {
    return {
      signature: `dry-run-${Math.floor(Date.now() / 1000)}`,
      periodVault: periodVault.toBase58(),
      amountLamports: amountLamports.toString(),
      beforeBalanceLamports,
      afterBalanceLamports: beforeBalanceLamports,
      beforePeriod,
      afterPeriod: beforePeriod,
    };
  }

  const ix = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: depositor.publicKey, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: stakingPeriod, isSigner: false, isWritable: true },
      { pubkey: periodVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_TO_PERIOD_DISCRIMINATOR, encodeU64(amountLamports)]),
  });

  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = depositor.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(depositor);

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  const afterBalanceLamports = await connection.getBalance(depositor.publicKey, 'confirmed');
  const afterPeriod = await readStakingPeriod(connection, stakingPeriod);
  return {
    signature,
    periodVault: periodVault.toBase58(),
    amountLamports: amountLamports.toString(),
    beforeBalanceLamports,
    afterBalanceLamports,
    beforePeriod,
    afterPeriod,
  };
}

function solToLamports(amountSol) {
  const normalized = Number(amountSol);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    fail('invalid_amount_sol', 'deposit amount must be greater than zero', { amountSol });
  }
  return BigInt(Math.floor(normalized * 1_000_000_000));
}

async function main() {
  const pool = parsePoolAddress(env('KYO_FUNDRY_STAKING_POOL_URL', env('KYO_ROUTE_STAKING_POOL_URL', '')));
  const amountSol = envNumber('KYO_FUNDRY_DEPOSIT_AMOUNT_SOL', envNumber('KYO_ROUTE_AMOUNT_SOL', 0));
  const amountLamports = solToLamports(amountSol);
  const rpcUrl = env('KYO_FUNDRY_DEPOSIT_RPC_URL', 'https://api.mainnet-beta.solana.com');
  const dryRun = parseBool('KYO_FUNDRY_DEPOSIT_DRY_RUN', false);
  const depositor = loadKeypair('KYO_FUNDRY_DEPOSIT_KEYPAIR_PATH', 'missing_depositor_keypair').keypair;
  const adminPath = env('KYO_FUNDRY_DEPOSIT_ADMIN_KEYPAIR_PATH', '');
  const admin = adminPath ? loadKeypair('KYO_FUNDRY_DEPOSIT_ADMIN_KEYPAIR_PATH', 'missing_admin_keypair').keypair : depositor;
  const connection = new Connection(rpcUrl, 'confirmed');

  let period = await findLatestOpenStakingPeriod(connection, pool);
  let createSignature = null;
  let activateSignature = null;
  let createdPeriod = null;
  if (!period) {
    const ensured = await ensureOpenStakingPeriod({ connection, admin, pool });
    period = ensured.period;
    createSignature = ensured.createSignature;
    activateSignature = ensured.activateSignature;
    createdPeriod = ensured.createdPeriod;
  }
  if (!period) {
    fail('missing_open_period', 'no open staking period found or created', {
      pool: pool.toBase58(),
      admin: admin.publicKey.toBase58(),
    });
  }

  const deposit = await depositToStakingPeriod({
    connection,
    depositor,
    pool,
    stakingPeriod: new PublicKey(period.address),
    amountLamports,
    dryRun,
  });

  const payload = {
    ok: true,
    method: dryRun ? 'staking_period_deposit_dry_run' : 'staking_period_deposit',
    at: nowIso(),
    txSignature: deposit.signature,
    signature: deposit.signature,
    routedSol: amountSol,
    amountSol,
    amountLamports: amountLamports.toString(),
    pool: pool.toBase58(),
    stakingPeriod: period.address,
    periodNumber: period.periodNumber,
    periodVault: deposit.periodVault,
    createSignature,
    activateSignature,
    createdPeriod,
    beforeBalanceLamports: String(deposit.beforeBalanceLamports),
    afterBalanceLamports: String(deposit.afterBalanceLamports),
    beforePeriod: deposit.beforePeriod,
    afterPeriod: deposit.afterPeriod,
    depositor: depositor.publicKey.toBase58(),
    admin: admin.publicKey.toBase58(),
    dryRun,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main().catch(error => {
  fail('fundry_staking_bridge_failed', 'fundry staking deposit bridge failed', {
    reason: String(error?.message || error),
  });
});
