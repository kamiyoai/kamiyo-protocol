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

const STAKING_PERIOD_DATA_LEN = 200;
const STAKING_PERIOD_POOL_OFFSET = 8;
const STAKING_PERIOD_NUMBER_OFFSET = 72;
const STAKING_PERIOD_START_TIME_OFFSET = 80;
const STAKING_PERIOD_END_TIME_OFFSET = 88;
const STAKING_PERIOD_TOTAL_TREASURY_OFFSET = 96;
const STAKING_PERIOD_TOTAL_CLAIMED_OFFSET = 104;
const STAKING_PERIOD_STATUS_OFFSET = 132;
const U64_MAX = (1n << 64n) - 1n;

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

function getPeriodVault(pool: PublicKey, periodNumber: bigint): PublicKey {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('period_vault', 'utf8'), pool.toBuffer(), encodeU64(periodNumber)],
    STAKING_PROGRAM_ID
  );
  return vault;
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
  const accounts = await connection.getProgramAccounts(STAKING_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(STAKING_PERIOD_DISCRIMINATOR) } },
      { memcmp: { offset: STAKING_PERIOD_POOL_OFFSET, bytes: pool.toBase58() } },
    ],
  });

  const openPeriods = accounts
    .map(account => parseStakingPeriodAccount(account.pubkey, account.account.data))
    .filter((period): period is ParsedStakingPeriod => period !== null)
    .filter(period => period.status === 0 || period.status === 1);

  if (openPeriods.length === 0) return null;
  openPeriods.sort((a, b) => (a.periodNumber === b.periodNumber ? 0 : a.periodNumber > b.periodNumber ? -1 : 1));
  return toSnapshot(openPeriods[0]);
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
