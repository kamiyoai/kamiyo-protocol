import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type BlockhashWithExpiryBlockHeight
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

const STAKING_PROGRAM_ID = new PublicKey('CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb');
const USER_LOCK_CONFIG_SEED = Buffer.from('user_lock_config', 'utf8');
const UNSTAKE_SEED = Buffer.from('unstake', 'utf8');

const SET_USER_LOCK_CONFIG_DISCRIMINATOR = Buffer.from([105, 97, 228, 37, 227, 90, 40, 14]);
const CLEAR_USER_LOCK_CONFIG_DISCRIMINATOR = Buffer.from([53, 99, 154, 28, 153, 138, 167, 199]);
const UNSTAKE_V2_DISCRIMINATOR = Buffer.from([88, 53, 113, 37, 217, 40, 248, 41]);

const MIN_USER_COOLDOWN_SECONDS = 86_400;
const MAX_USER_COOLDOWN_SECONDS = 2_592_000;

const POOL_DATA_LEN = 624;
const POOL_WRAPPED_MINT_OFFSET = 40;
const POOL_WRAPPED_TOKEN_PROGRAM_OFFSET = 104;
const POOL_COOLDOWN_OFFSET = 176;

type LockConfigSource = 'user_lock_config' | 'pool_default';

type ApiError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

type GetUserLockConfigResponse = {
  poolAddress: string;
  wallet: string;
  poolCooldownSeconds: number;
  userLockConfigAddress: string | null;
  userCooldownSeconds: number | null;
  effectiveCooldownSeconds: number;
  source: LockConfigSource;
  updatedAt: string | null;
};

type PrepareSetUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  cooldownSeconds: number;
  effectiveCooldownSeconds: number;
  instruction: 'set_user_lock_config';
};

type PrepareClearUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  instruction: 'clear_user_lock_config';
};

type PrepareUnstakeV2Response = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  unstakeAddress: string;
  userLockConfigAddress: string | null;
  amountRaw: string;
  poolCooldownSeconds: number;
  effectiveCooldownSeconds: number;
  unlockAtUnix: number;
  unlockAtIso: string;
  source: LockConfigSource;
  instruction: 'unstake_v2';
};

type SubmitSignedTxResponse = {
  signature: string;
  slot?: number;
};

const setLockSchema = z.object({
  wallet: z.string().min(32),
  poolAddress: z.string().min(32),
  cooldownSeconds: z.number().int().min(MIN_USER_COOLDOWN_SECONDS).max(MAX_USER_COOLDOWN_SECONDS),
});

const clearLockSchema = z.object({
  wallet: z.string().min(32),
  poolAddress: z.string().min(32),
});

const unstakeV2Schema = z.object({
  wallet: z.string().min(32),
  poolAddress: z.string().min(32),
  amountRaw: z.string().regex(/^\d+$/),
});

const submitSchema = z.object({
  transaction: z.string().min(1),
});

function asApiError(
  code: string,
  error: string,
  details?: Record<string, unknown>
): ApiError {
  return { code, error, details };
}

function encodeU64(value: bigint): Buffer {
  if (value < 0n) throw new Error('u64 must be non-negative');
  const max = (1n << 64n) - 1n;
  if (value > max) throw new Error('u64 overflow');
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
}

function decodePoolCooldown(data: Buffer): number {
  return Number(data.readBigUInt64LE(POOL_COOLDOWN_OFFSET));
}

function decodePoolWrappedMint(data: Buffer): PublicKey {
  return new PublicKey(data.subarray(POOL_WRAPPED_MINT_OFFSET, POOL_WRAPPED_MINT_OFFSET + 32));
}

function decodePoolWrappedTokenProgram(data: Buffer): PublicKey {
  return new PublicKey(data.subarray(POOL_WRAPPED_TOKEN_PROGRAM_OFFSET, POOL_WRAPPED_TOKEN_PROGRAM_OFFSET + 32));
}

function getUserLockConfigPda(pool: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_LOCK_CONFIG_SEED, pool.toBuffer(), user.toBuffer()],
    STAKING_PROGRAM_ID
  );
  return pda;
}

function getUnstakePda(pool: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([UNSTAKE_SEED, pool.toBuffer(), user.toBuffer()], STAKING_PROGRAM_ID);
  return pda;
}

async function getPoolSnapshot(connection: Connection, pool: PublicKey): Promise<{
  wrappedMint: PublicKey;
  wrappedTokenProgram: PublicKey;
  cooldownSeconds: number;
}> {
  const info = await connection.getAccountInfo(pool, 'confirmed');
  if (!info) throw new Error('pool_not_found');
  if (info.data.length < POOL_DATA_LEN) throw new Error('pool_decode_failed');

  return {
    wrappedMint: decodePoolWrappedMint(info.data),
    wrappedTokenProgram: decodePoolWrappedTokenProgram(info.data),
    cooldownSeconds: decodePoolCooldown(info.data),
  };
}

async function getUserLockConfig(connection: Connection, pool: PublicKey, user: PublicKey): Promise<{
  address: PublicKey;
  cooldownSeconds: number | null;
  source: LockConfigSource;
}> {
  const address = getUserLockConfigPda(pool, user);
  const info = await connection.getAccountInfo(address, 'confirmed');
  if (!info) {
    return {
      address,
      cooldownSeconds: null,
      source: 'pool_default',
    };
  }

  // bytemuck struct layout in patch:
  // 0..32 user, 32..64 pool, 64..72 cooldown, ...
  const cooldownSeconds = Number(info.data.readBigUInt64LE(64));
  return {
    address,
    cooldownSeconds,
    source: 'user_lock_config',
  };
}

function buildUnsignedTx(params: {
  payer: PublicKey;
  latestBlockhash: BlockhashWithExpiryBlockHeight;
  instruction: TransactionInstruction;
}): string {
  const tx = new Transaction();
  tx.feePayer = params.payer;
  tx.recentBlockhash = params.latestBlockhash.blockhash;
  tx.add(params.instruction);
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64');
}

function buildSetUserLockConfigIx(params: {
  user: PublicKey;
  pool: PublicKey;
  cooldownSeconds: bigint;
}): TransactionInstruction {
  const userLockConfig = getUserLockConfigPda(params.pool, params.user);

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: params.user, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: false },
      { pubkey: userLockConfig, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([SET_USER_LOCK_CONFIG_DISCRIMINATOR, encodeU64(params.cooldownSeconds)]),
  });
}

function buildClearUserLockConfigIx(params: {
  user: PublicKey;
  pool: PublicKey;
}): TransactionInstruction {
  const userLockConfig = getUserLockConfigPda(params.pool, params.user);

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: params.user, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: false },
      { pubkey: userLockConfig, isSigner: false, isWritable: true },
    ],
    data: CLEAR_USER_LOCK_CONFIG_DISCRIMINATOR,
  });
}

function buildUnstakeV2Ix(params: {
  user: PublicKey;
  pool: PublicKey;
  userWrappedTokenAccount: PublicKey;
  wrappedMint: PublicKey;
  wrappedTokenProgram: PublicKey;
  amount: bigint;
  includeUserLockConfig: boolean;
}): TransactionInstruction {
  const unstake = getUnstakePda(params.pool, params.user);
  const userLockConfig = getUserLockConfigPda(params.pool, params.user);

  const keys = [
    { pubkey: params.user, isSigner: true, isWritable: true },
    { pubkey: params.userWrappedTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.pool, isSigner: false, isWritable: true },
    { pubkey: unstake, isSigner: false, isWritable: true },
  ];

  if (params.includeUserLockConfig) {
    keys.push({ pubkey: userLockConfig, isSigner: false, isWritable: false });
  }

  keys.push(
    { pubkey: params.wrappedMint, isSigner: false, isWritable: true },
    { pubkey: params.wrappedTokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  );

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys,
    data: Buffer.concat([UNSTAKE_V2_DISCRIMINATOR, encodeU64(params.amount)]),
  });
}

function resolveUserWrappedTokenAccount(
  user: PublicKey,
  wrappedMint: PublicKey,
  wrappedTokenProgram: PublicKey
): PublicKey {
  return getAssociatedTokenAddressSync(
    wrappedMint,
    user,
    false,
    wrappedTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function createStakingV2Router(params: {
  rpcUrl: string;
}): Router {
  const router = Router();
  const connection = new Connection(params.rpcUrl, 'confirmed');

  router.get('/api/staking/pools/:poolAddress/user-lock-config', async (req: Request, res: Response) => {
    try {
      const poolAddress = String(req.params.poolAddress || '').trim();
      const wallet = String(req.query.wallet || '').trim();

      if (!poolAddress) {
        return res.status(400).json(asApiError('INVALID_POOL', 'poolAddress is required'));
      }
      if (!wallet) {
        return res.status(400).json(asApiError('INVALID_WALLET', 'wallet is required'));
      }

      const pool = new PublicKey(poolAddress);
      const user = new PublicKey(wallet);
      const poolState = await getPoolSnapshot(connection, pool);
      const lockConfig = await getUserLockConfig(connection, pool, user);

      const effectiveCooldown = lockConfig.cooldownSeconds ?? poolState.cooldownSeconds;

      const response: GetUserLockConfigResponse = {
        poolAddress: pool.toBase58(),
        wallet: user.toBase58(),
        poolCooldownSeconds: poolState.cooldownSeconds,
        userLockConfigAddress: lockConfig.source === 'user_lock_config' ? lockConfig.address.toBase58() : null,
        userCooldownSeconds: lockConfig.cooldownSeconds,
        effectiveCooldownSeconds: effectiveCooldown,
        source: lockConfig.source,
        updatedAt: null,
      };

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'pool_not_found') {
        return res.status(404).json(asApiError('POOL_NOT_FOUND', 'Pool not found'));
      }
      return res.status(500).json(asApiError('INTERNAL_ERROR', 'Failed to fetch lock config', { message }));
    }
  });

  router.post('/api/staking/pools/user-lock-config/set', async (req: Request, res: Response) => {
    try {
      const parsed = setLockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(asApiError('INVALID_COOLDOWN', 'Invalid request payload', { issues: parsed.error.issues }));
      }

      const wallet = new PublicKey(parsed.data.wallet);
      const pool = new PublicKey(parsed.data.poolAddress);
      const userLockConfig = getUserLockConfigPda(pool, wallet);
      const latest = await connection.getLatestBlockhash('confirmed');

      const ix = buildSetUserLockConfigIx({
        user: wallet,
        pool,
        cooldownSeconds: BigInt(parsed.data.cooldownSeconds),
      });

      const response: PrepareSetUserLockConfigResponse = {
        transaction: buildUnsignedTx({ payer: wallet, latestBlockhash: latest, instruction: ix }),
        wallet: wallet.toBase58(),
        poolAddress: pool.toBase58(),
        userLockConfigAddress: userLockConfig.toBase58(),
        cooldownSeconds: parsed.data.cooldownSeconds,
        effectiveCooldownSeconds: parsed.data.cooldownSeconds,
        instruction: 'set_user_lock_config',
      };

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json(asApiError('TX_BUILD_FAILED', 'Failed to build set_user_lock_config tx', { message }));
    }
  });

  router.post('/api/staking/pools/user-lock-config/clear', async (req: Request, res: Response) => {
    try {
      const parsed = clearLockSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(asApiError('INVALID_REQUEST', 'Invalid request payload', { issues: parsed.error.issues }));
      }

      const wallet = new PublicKey(parsed.data.wallet);
      const pool = new PublicKey(parsed.data.poolAddress);
      const userLockConfig = getUserLockConfigPda(pool, wallet);
      const latest = await connection.getLatestBlockhash('confirmed');

      const ix = buildClearUserLockConfigIx({ user: wallet, pool });

      const response: PrepareClearUserLockConfigResponse = {
        transaction: buildUnsignedTx({ payer: wallet, latestBlockhash: latest, instruction: ix }),
        wallet: wallet.toBase58(),
        poolAddress: pool.toBase58(),
        userLockConfigAddress: userLockConfig.toBase58(),
        instruction: 'clear_user_lock_config',
      };

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json(asApiError('TX_BUILD_FAILED', 'Failed to build clear_user_lock_config tx', { message }));
    }
  });

  router.post('/api/staking/unstake-v2', async (req: Request, res: Response) => {
    try {
      const parsed = unstakeV2Schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(asApiError('INVALID_AMOUNT', 'Invalid request payload', { issues: parsed.error.issues }));
      }

      const wallet = new PublicKey(parsed.data.wallet);
      const pool = new PublicKey(parsed.data.poolAddress);
      const amount = BigInt(parsed.data.amountRaw);
      if (amount <= 0n) {
        return res.status(400).json(asApiError('INVALID_AMOUNT', 'amountRaw must be > 0'));
      }

      const [poolState, lockConfig] = await Promise.all([
        getPoolSnapshot(connection, pool),
        getUserLockConfig(connection, pool, wallet),
      ]);

      const userWrappedTokenAccount = resolveUserWrappedTokenAccount(
        wallet,
        poolState.wrappedMint,
        poolState.wrappedTokenProgram
      );
      const effectiveCooldownSeconds = lockConfig.cooldownSeconds ?? poolState.cooldownSeconds;
      const now = Math.floor(Date.now() / 1000);
      const unlockAtUnix = now + effectiveCooldownSeconds;
      const unstakeAddress = getUnstakePda(pool, wallet);

      const latest = await connection.getLatestBlockhash('confirmed');
      const ix = buildUnstakeV2Ix({
        user: wallet,
        pool,
        userWrappedTokenAccount,
        wrappedMint: poolState.wrappedMint,
        wrappedTokenProgram: poolState.wrappedTokenProgram,
        amount,
        includeUserLockConfig: lockConfig.source === 'user_lock_config',
      });

      const response: PrepareUnstakeV2Response = {
        transaction: buildUnsignedTx({ payer: wallet, latestBlockhash: latest, instruction: ix }),
        wallet: wallet.toBase58(),
        poolAddress: pool.toBase58(),
        unstakeAddress: unstakeAddress.toBase58(),
        userLockConfigAddress: lockConfig.source === 'user_lock_config' ? lockConfig.address.toBase58() : null,
        amountRaw: amount.toString(),
        poolCooldownSeconds: poolState.cooldownSeconds,
        effectiveCooldownSeconds,
        unlockAtUnix,
        unlockAtIso: new Date(unlockAtUnix * 1000).toISOString(),
        source: lockConfig.source,
        instruction: 'unstake_v2',
      };

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json(asApiError('TX_BUILD_FAILED', 'Failed to build unstake_v2 tx', { message }));
    }
  });

  router.post('/api/staking/stake/submit', async (req: Request, res: Response) => {
    try {
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(asApiError('INVALID_REQUEST', 'Invalid request payload', { issues: parsed.error.issues }));
      }

      const raw = Buffer.from(parsed.data.transaction, 'base64');
      const signature = await connection.sendRawTransaction(raw, { maxRetries: 3 });
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      const response: SubmitSignedTxResponse = {
        signature,
        slot: confirmation.context.slot,
      };

      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json(asApiError('TX_SUBMIT_FAILED', 'Failed to submit signed transaction', { message }));
    }
  });

  return router;
}
