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

export type StakingPeriodStatus = 0 | 1 | 2 | 3;

type ParsedStakingPeriod = {
  address: PublicKey;
  pool: PublicKey;
  periodNumber: bigint;
  startTime: number;
  endTime: number;
  totalTreasuryLamports: bigint;
  totalClaimedLamports: bigint;
  status: StakingPeriodStatus;
};

export type StakingPeriodSnapshot = {
  address: string;
  pool: string;
  periodNumber: string;
  startTime: number;
  endTime: number;
  totalTreasuryLamports: string;
  totalClaimedLamports: string;
  status: StakingPeriodStatus;
  statusLabel: 'pending' | 'active' | 'finalized' | 'cancelled' | 'unknown';
};

export type EnsureOpenStakingPeriodResult = {
  period: StakingPeriodSnapshot | null;
  createdPeriod: StakingPeriodSnapshot | null;
  createSignature: string | null;
  activateSignature: string | null;
};

function statusLabel(status: number): StakingPeriodSnapshot['statusLabel'] {
  if (status === 0) return 'pending';
  if (status === 1) return 'active';
  if (status === 2) return 'finalized';
  if (status === 3) return 'cancelled';
  return 'unknown';
}

function toSnapshot(period: ParsedStakingPeriod): StakingPeriodSnapshot {
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

function parseStakingPeriodAccount(account: PublicKey, data: Buffer): ParsedStakingPeriod | null {
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
    status: status as StakingPeriodStatus,
  };
}

function encodeU64(value: bigint): Buffer {
  if (value < 0n || value > U64_MAX) {
    throw new Error(`u64 out of range: ${value.toString()}`);
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
}

function encodeI64(value: bigint): Buffer {
  if (value < I64_MIN || value > I64_MAX) {
    throw new Error(`i64 out of range: ${value.toString()}`);
  }
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(value, 0);
  return out;
}

function getStakingConfig(): PublicKey {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config', 'utf8')], STAKING_PROGRAM_ID);
  return config;
}

function getStakingPeriod(pool: PublicKey, periodNumber: bigint): PublicKey {
  const [stakingPeriod] = PublicKey.findProgramAddressSync(
    [Buffer.from('staking_period', 'utf8'), pool.toBuffer(), encodeU64(periodNumber)],
    STAKING_PROGRAM_ID
  );
  return stakingPeriod;
}

function getPeriodVault(pool: PublicKey, periodNumber: bigint): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('period_vault', 'utf8'), pool.toBuffer(), encodeU64(periodNumber)],
    STAKING_PROGRAM_ID
  );
  return vault;
}

async function findPoolStakingPeriods(
  connection: Connection,
  pool: PublicKey
): Promise<ParsedStakingPeriod[]> {
  const accounts = await connection.getProgramAccounts(STAKING_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(STAKING_PERIOD_DISCRIMINATOR) } },
      { memcmp: { offset: STAKING_PERIOD_POOL_OFFSET, bytes: pool.toBase58() } },
    ],
  });

  const periods = accounts
    .map(account => parseStakingPeriodAccount(account.pubkey, account.account.data))
    .filter((period): period is ParsedStakingPeriod => period !== null);

  periods.sort((a, b) => (a.periodNumber === b.periodNumber ? 0 : a.periodNumber > b.periodNumber ? -1 : 1));
  return periods;
}

export async function readStakingPeriod(
  connection: Connection,
  stakingPeriod: PublicKey
): Promise<StakingPeriodSnapshot | null> {
  const info = await connection.getAccountInfo(stakingPeriod, 'confirmed');
  if (!info) return null;
  const parsed = parseStakingPeriodAccount(stakingPeriod, info.data);
  if (!parsed) return null;
  return toSnapshot(parsed);
}

export async function findLatestOpenStakingPeriod(
  connection: Connection,
  pool: PublicKey
): Promise<StakingPeriodSnapshot | null> {
  const openPeriods = (await findPoolStakingPeriods(connection, pool)).filter(
    period => period.status === 0 || period.status === 1
  );

  if (openPeriods.length === 0) return null;
  return toSnapshot(openPeriods[0]);
}

export async function findLatestStakingPeriod(
  connection: Connection,
  pool: PublicKey
): Promise<StakingPeriodSnapshot | null> {
  const periods = await findPoolStakingPeriods(connection, pool);
  return periods[0] ? toSnapshot(periods[0]) : null;
}

export async function createStakingPeriod(params: {
  connection: Connection;
  admin: Keypair;
  pool: PublicKey;
  periodNumber: bigint;
  startTime: number;
  endTime: number;
}) {
  const { connection, admin, pool, periodNumber, startTime, endTime } = params;

  if (!Number.isInteger(startTime) || !Number.isInteger(endTime)) {
    throw new Error('startTime and endTime must be unix-second integers');
  }
  if (endTime <= startTime) {
    throw new Error(`invalid period window: start=${startTime} end=${endTime}`);
  }
  if (periodNumber < 0n || periodNumber > U64_MAX) {
    throw new Error(`periodNumber out of range: ${periodNumber.toString()}`);
  }

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
    periodNumber: periodNumber.toString(),
    startTime,
    endTime,
    stakingPeriod: stakingPeriod.toBase58(),
    periodVault: periodVault.toBase58(),
  };
}

export async function activateStakingPeriod(params: {
  connection: Connection;
  caller: Keypair;
  pool: PublicKey;
  stakingPeriod: PublicKey;
}) {
  const { connection, caller, pool, stakingPeriod } = params;

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

export async function ensureOpenStakingPeriod(params: {
  connection: Connection;
  admin: Keypair;
  pool: PublicKey;
  defaultDurationSeconds?: number;
}): Promise<EnsureOpenStakingPeriodResult> {
  const { connection, admin, pool } = params;
  const now = Math.floor(Date.now() / 1000);
  const defaultDuration = Math.max(1, params.defaultDurationSeconds ?? DEFAULT_PERIOD_DURATION_SECONDS);

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
    return {
      period: null,
      createdPeriod: null,
      createSignature: null,
      activateSignature: null,
    };
  }

  const previousPeriodNumber = BigInt(latest.periodNumber);
  const nextPeriodNumber = previousPeriodNumber + 1n;
  const previousDuration = latest.endTime - latest.startTime;
  const duration = previousDuration > 0 ? previousDuration : defaultDuration;
  const startTime = Math.max(now, latest.endTime);
  const endTime = startTime + duration;

  let createSignature: string | null = null;
  let activateSignature: string | null = null;
  let createdPeriod: StakingPeriodSnapshot | null = null;

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
      // Best-effort activation; pending periods are still valid targets for deposits.
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

export async function depositToStakingPeriod(params: {
  connection: Connection;
  depositor: Keypair;
  pool: PublicKey;
  stakingPeriod: PublicKey;
  amountLamports: bigint;
  dryRun?: boolean;
}) {
  const { connection, depositor, pool, stakingPeriod, amountLamports, dryRun = false } = params;
  if (amountLamports <= 0n) throw new Error('amountLamports must be > 0');

  const beforeBalanceLamports = await connection.getBalance(depositor.publicKey, 'confirmed');
  const beforePeriod = await readStakingPeriod(connection, stakingPeriod);
  if (!beforePeriod) throw new Error('Staking period account not found or invalid');
  if (beforePeriod.pool !== pool.toBase58()) {
    throw new Error(`Staking period pool mismatch: expected ${pool.toBase58()} got ${beforePeriod.pool}`);
  }
  const periodVault = getPeriodVault(pool, BigInt(beforePeriod.periodNumber));

  if (dryRun) {
    return {
      signature: null as string | null,
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
