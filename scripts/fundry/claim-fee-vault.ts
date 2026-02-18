import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicFeeSharingClient } from '@meteora-ag/dynamic-fee-sharing-sdk';
import bs58 from 'bs58';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function loadKeypairFromPath(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const bytes = new Uint8Array(JSON.parse(raw));
  return Keypair.fromSecretKey(bytes);
}

function loadKeypairFromEnv(
  pathVar: string,
  keyVar: string
): { keypair: Keypair; source: string } | undefined {
  const filePath = optionalEnv(pathVar);
  if (filePath) {
    return { keypair: loadKeypairFromPath(filePath), source: pathVar };
  }

  const raw = optionalEnv(keyVar);
  if (!raw) return;

  try {
    return { keypair: Keypair.fromSecretKey(bs58.decode(raw)), source: `${keyVar}(base58)` };
  } catch {
    // fallthrough
  }

  try {
    return { keypair: Keypair.fromSecretKey(Buffer.from(raw, 'base64')), source: `${keyVar}(base64)` };
  } catch {
    // fallthrough
  }

  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error(`${keyVar} must be base58/base64 or a JSON array`);
  return { keypair: Keypair.fromSecretKey(new Uint8Array(arr)), source: `${keyVar}(json)` };
}

function loadSigner(label: string, fallbackToAgent: boolean): { keypair: Keypair; source: string } {
  const direct =
    loadKeypairFromEnv(`FEE_${label}_KEYPAIR_PATH`, `FEE_${label}_PRIVATE_KEY`) ??
    loadKeypairFromEnv(`${label}_KEYPAIR_PATH`, `${label}_PRIVATE_KEY`);
  if (direct) return direct;

  if (fallbackToAgent) {
    const agent =
      loadKeypairFromEnv('AGENT_KEYPAIR_PATH', 'AGENT_PRIVATE_KEY') ??
      loadKeypairFromEnv('DEPLOYER_KEYPAIR_PATH', 'DEPLOYER_PRIVATE_KEY');
    if (agent) return agent;

    const home = process.env.HOME?.trim();
    if (home) {
      const defaultPath = path.join(home, '.config/solana/id.json');
      if (fs.existsSync(defaultPath)) {
        return { keypair: loadKeypairFromPath(defaultPath), source: '~/.config/solana/id.json' };
      }
    }
  }

  throw new Error(
    `Missing ${label} key. Set FEE_${label}_KEYPAIR_PATH / FEE_${label}_PRIVATE_KEY (or ${label}_KEYPAIR_PATH / ${label}_PRIVATE_KEY).`
  );
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

async function main(): Promise<void> {
  const rpcUrl = optionalEnv('SOLANA_RPC_URL') ?? DEFAULT_RPC_URL;
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  const feeVault = new PublicKey(requiredEnv('METEORA_FEE_VAULT'));

  const client = new DynamicFeeSharingClient(connection, 'confirmed');

  const breakdown = formatFeeBreakdown(await client.getFeeBreakdown(feeVault));
  if (process.env.READ_ONLY === 'true') {
    console.log(JSON.stringify({ feeVault: feeVault.toBase58(), rpcUrl, ...breakdown }, null, 2));
    return;
  }

  const user = loadSigner('USER', true);
  const payer =
    loadKeypairFromEnv('FEE_PAYER_KEYPAIR_PATH', 'FEE_PAYER_PRIVATE_KEY') ??
    loadKeypairFromEnv('PAYER_KEYPAIR_PATH', 'PAYER_PRIVATE_KEY') ??
    user;

  console.log(
    JSON.stringify(
      {
        feeVault: feeVault.toBase58(),
        rpcUrl,
        user: user.keypair.publicKey.toBase58(),
        payer: payer.keypair.publicKey.toBase58(),
        ...breakdown,
      },
      null,
      2
    )
  );

  if (process.env.DRY_RUN === 'true') return;

  const tx = await client.claimUserFee({
    feeVault,
    user: user.keypair.publicKey,
    payer: payer.keypair.publicKey,
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = payer.keypair.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(...uniqKeypairs([payer.keypair, user.keypair]));

  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );

  const updated = formatFeeBreakdown(await client.getFeeBreakdown(feeVault));
  console.log(
    JSON.stringify(
      {
        signature: sig,
        feeVault: feeVault.toBase58(),
        rpcUrl,
        user: user.keypair.publicKey.toBase58(),
        payer: payer.keypair.publicKey.toBase58(),
        ...updated,
      },
      null,
      2
    )
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
