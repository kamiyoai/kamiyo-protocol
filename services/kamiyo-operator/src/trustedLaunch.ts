import { Connection, PublicKey } from '@solana/web3.js';
import { createHash } from 'node:crypto';

function accountDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
}

const LAUNCH_RECORD_DISCRIMINATOR = accountDiscriminator('LaunchRecord');
const LAUNCH_RATE_LIMIT_DISCRIMINATOR = accountDiscriminator('LaunchRateLimit');

function hasDiscriminator(data: Buffer | Uint8Array | null | undefined, expected: Buffer): boolean {
  if (!data || data.length < 8) return false;
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== expected[i]) return false;
  }
  return true;
}

export interface TrustedLaunchState {
  programId: string;
  agentIdentity: string;
  mint: string;
  launchRecordPda: string;
  launchRateLimitPda: string;
  launchRecordExists: boolean;
  launchRateLimitExists: boolean;
  launchRecordOwner: string | null;
  launchRateLimitOwner: string | null;
  launchRecordDiscriminatorOk: boolean;
  launchRateLimitDiscriminatorOk: boolean;
  launchRecordLamports: string;
  launchRateLimitLamports: string;
  linked: boolean;
  reason?: string;
}

export async function readTrustedLaunchState(params: {
  connection: Connection;
  programId: PublicKey;
  agentIdentity: PublicKey;
  mint: PublicKey;
}): Promise<TrustedLaunchState> {
  const [launchRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('launch'), params.agentIdentity.toBuffer(), params.mint.toBuffer()],
    params.programId
  );
  const [launchRateLimit] = PublicKey.findProgramAddressSync(
    [Buffer.from('launch_rate'), params.agentIdentity.toBuffer()],
    params.programId
  );

  const [launchRecordInfo, launchRateLimitInfo] = await params.connection.getMultipleAccountsInfo(
    [launchRecord, launchRateLimit],
    'confirmed'
  );

  const launchRecordExists = launchRecordInfo !== null;
  const launchRateLimitExists = launchRateLimitInfo !== null;
  const launchRecordOwnerMatches = !!launchRecordInfo && launchRecordInfo.owner.equals(params.programId);
  const launchRateLimitOwnerMatches = !!launchRateLimitInfo && launchRateLimitInfo.owner.equals(params.programId);
  const launchRecordDiscriminatorOk = hasDiscriminator(launchRecordInfo?.data, LAUNCH_RECORD_DISCRIMINATOR);
  const launchRateLimitDiscriminatorOk = hasDiscriminator(
    launchRateLimitInfo?.data,
    LAUNCH_RATE_LIMIT_DISCRIMINATOR
  );

  const linked =
    launchRecordExists &&
    launchRateLimitExists &&
    launchRecordOwnerMatches &&
    launchRateLimitOwnerMatches &&
    launchRecordDiscriminatorOk &&
    launchRateLimitDiscriminatorOk;

  let reason: string | undefined;
  if (!linked) {
    if (!launchRecordExists) {
      reason = 'launch_record_missing';
    } else if (!launchRateLimitExists) {
      reason = 'launch_rate_limit_missing';
    } else if (!launchRecordOwnerMatches || !launchRateLimitOwnerMatches) {
      reason = 'owner_mismatch';
    } else if (!launchRecordDiscriminatorOk || !launchRateLimitDiscriminatorOk) {
      reason = 'account_type_mismatch';
    } else {
      reason = 'link_invalid';
    }
  }

  return {
    programId: params.programId.toBase58(),
    agentIdentity: params.agentIdentity.toBase58(),
    mint: params.mint.toBase58(),
    launchRecordPda: launchRecord.toBase58(),
    launchRateLimitPda: launchRateLimit.toBase58(),
    launchRecordExists,
    launchRateLimitExists,
    launchRecordOwner: launchRecordInfo?.owner.toBase58() ?? null,
    launchRateLimitOwner: launchRateLimitInfo?.owner.toBase58() ?? null,
    launchRecordDiscriminatorOk,
    launchRateLimitDiscriminatorOk,
    launchRecordLamports: String(launchRecordInfo?.lamports ?? 0),
    launchRateLimitLamports: String(launchRateLimitInfo?.lamports ?? 0),
    linked,
    ...(reason ? { reason } : {}),
  };
}
