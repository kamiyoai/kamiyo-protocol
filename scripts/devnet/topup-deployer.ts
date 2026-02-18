import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import bs58 from 'bs58';

const LAMPORTS_PER_SOL = 1_000_000_000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function loadKeypairFromPath(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const bytes = new Uint8Array(JSON.parse(raw));
  return Keypair.fromSecretKey(bytes);
}

function loadKeypairFromEnv(name: string): Keypair {
  const raw = requiredEnv(name);
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    // fallthrough
  }

  try {
    return Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
  } catch {
    // fallthrough
  }

  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error(`${name} must be base58/base64 or a JSON array`);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

function resolveTarget(): { target: PublicKey; source: string } {
  const explicit = optionalEnv('TOPUP_TARGET');
  if (explicit) return { target: new PublicKey(explicit), source: 'TOPUP_TARGET' };

  const keypairPath = optionalEnv('DEPLOYER_KEYPAIR_PATH') || path.join(process.env.HOME || '', '.config/solana/id.json');
  if (fs.existsSync(keypairPath)) {
    return { target: loadKeypairFromPath(keypairPath).publicKey, source: 'DEPLOYER_KEYPAIR_PATH(or default)' };
  }

  if (optionalEnv('DEPLOYER_PRIVATE_KEY')) {
    return { target: loadKeypairFromEnv('DEPLOYER_PRIVATE_KEY').publicKey, source: 'DEPLOYER_PRIVATE_KEY' };
  }

  throw new Error('Missing TOPUP_TARGET and no deployer keypair found. Set TOPUP_TARGET or DEPLOYER_KEYPAIR_PATH.');
}

function parseRpcUrls(): string[] {
  const raw = optionalEnv('SOLANA_RPC_URLS') || 'https://api.devnet.solana.com';
  const urls = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!urls.length) throw new Error('SOLANA_RPC_URLS must contain at least 1 RPC url');
  return urls;
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function requestAirdropWithRetries(connection: Connection, pubkey: PublicKey, lamports: number): Promise<string> {
  const tries = optionalInt('AIRDROP_TRIES', 4);
  const baseDelayMs = optionalInt('AIRDROP_BACKOFF_MS', 700);

  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const sig = await connection.requestAirdrop(pubkey, lamports);
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch (err) {
      lastErr = err;
      await sleep(baseDelayMs * (i + 1));
    }
  }

  throw lastErr;
}

async function transferAllBut(connection: Connection, from: Keypair, to: PublicKey, keepLamports: number): Promise<string> {
  const bal = await connection.getBalance(from.publicKey);
  const sendLamports = Math.max(0, bal - keepLamports);
  if (sendLamports === 0) throw new Error('swarm wallet has no lamports to transfer');

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: sendLamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = from.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(from);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function main() {
  const rpcs = parseRpcUrls();
  const { target, source } = resolveTarget();

  const targetTotalSol = optionalNumber('TOPUP_TARGET_TOTAL_SOL', 7);
  const swarmWallets = optionalInt('SWARM_WALLETS', 8);
  const airdropSol = optionalNumber('AIRDROP_SOL_PER_WALLET', 1);
  const keepSol = optionalNumber('KEEP_SOL_PER_WALLET', 0.002);

  const primary = new Connection(rpcs[0], { commitment: 'confirmed', disableRetryOnRateLimit: true });
  const startingLamports = await primary.getBalance(target);
  const neededLamports = Math.max(0, Math.floor(targetTotalSol * LAMPORTS_PER_SOL) - startingLamports);

  const results: any = {
    ok: true,
    target: target.toBase58(),
    targetSource: source,
    startingSol: startingLamports / LAMPORTS_PER_SOL,
    targetTotalSol,
    neededSol: neededLamports / LAMPORTS_PER_SOL,
    rpcUrls: rpcs,
    swarmWallets,
    airdropSolPerWallet: airdropSol,
    keepSolPerWallet: keepSol,
    attempts: [] as any[],
  };

  if (neededLamports === 0) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  let remaining = neededLamports;

  for (let i = 0; i < swarmWallets && remaining > 0; i++) {
    const wallet = Keypair.generate();
    const wantLamports = Math.min(remaining, Math.floor(airdropSol * LAMPORTS_PER_SOL));

    let airdropSig: string | undefined;
    let airdropRpc: string | undefined;
    let error: string | undefined;

    for (const rpcUrl of rpcs) {
      const conn = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });
      try {
        airdropSig = await requestAirdropWithRetries(conn, wallet.publicKey, wantLamports);
        airdropRpc = rpcUrl;
        break;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    const attempt: any = {
      index: i,
      swarmWallet: wallet.publicKey.toBase58(),
      requestedSol: wantLamports / LAMPORTS_PER_SOL,
      airdropSig,
      airdropRpc,
      transferSig: undefined as string | undefined,
      error,
    };

    if (airdropSig && airdropRpc) {
      const conn = new Connection(airdropRpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
      try {
        attempt.transferSig = await transferAllBut(conn, wallet, target, Math.floor(keepSol * LAMPORTS_PER_SOL));
        remaining -= wantLamports;
      } catch (err) {
        attempt.error = err instanceof Error ? err.message : String(err);
      }
    }

    results.attempts.push(attempt);
  }

  const endingLamports = await primary.getBalance(target);
  results.endingSol = endingLamports / LAMPORTS_PER_SOL;
  results.remainingSol = Math.max(0, (Math.floor(targetTotalSol * LAMPORTS_PER_SOL) - endingLamports) / LAMPORTS_PER_SOL);

  if (results.remainingSol > 0) {
    results.ok = false;
    results.hint =
      'Devnet airdrops are often rate-limited. If this fails, use a browser wallet (Phantom/Solflare devnet airdrop) or ask a teammate to transfer devnet SOL to the target address.';
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
