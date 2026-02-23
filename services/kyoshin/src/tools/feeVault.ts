import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicFeeSharingClient } from '@meteora-ag/dynamic-fee-sharing-sdk';

function toAmountString(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && 'toString' in value) {
    const str = (value as { toString: () => string }).toString();
    if (str !== '[object Object]') return str;
  }
  return String(value);
}

function formatFeeBreakdown(breakdown: Awaited<ReturnType<DynamicFeeSharingClient['getFeeBreakdown']>>) {
  return {
    totalFundedFee: toAmountString(breakdown.totalFundedFee),
    totalClaimedFee: toAmountString(breakdown.totalClaimedFee),
    totalUnclaimedFee: toAmountString(breakdown.totalUnclaimedFee),
    userFees: breakdown.userFees.map(entry => ({
      address: entry.address.toBase58(),
      totalFee: toAmountString(entry.totalFee),
      feeClaimed: toAmountString(entry.feeClaimed),
      feeUnclaimed: toAmountString(entry.feeUnclaimed),
    })),
  };
}

function uniqKeypairs(keypairs: Keypair[]): Keypair[] {
  const seen = new Set<string>();
  const out: Keypair[] = [];
  for (const kp of keypairs) {
    const key = kp.publicKey.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kp);
  }
  return out;
}

export async function readFeeVault(connection: Connection, feeVault: PublicKey) {
  const client = new DynamicFeeSharingClient(connection, 'confirmed');
  return formatFeeBreakdown(await client.getFeeBreakdown(feeVault));
}

export async function claimFeeVault(params: {
  connection: Connection;
  feeVault: PublicKey;
  user: Keypair;
  payer?: Keypair;
  dryRun?: boolean;
}) {
  const { connection, feeVault, user, payer, dryRun } = params;

  const client = new DynamicFeeSharingClient(connection, 'confirmed');
  const before = formatFeeBreakdown(await client.getFeeBreakdown(feeVault));

  if (dryRun) {
    return {
      signature: null as string | null,
      before,
      after: before,
    };
  }

  const tx = await client.claimUserFee({
    feeVault,
    user: user.publicKey,
    payer: (payer ?? user).publicKey,
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = (payer ?? user).publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(...uniqKeypairs([payer ?? user, user]));

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  const after = formatFeeBreakdown(await client.getFeeBreakdown(feeVault));

  return {
    signature,
    before,
    after,
  };
}
