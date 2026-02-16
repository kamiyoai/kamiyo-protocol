import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import bs58 from 'bs58';

const DEFAULT_RPC = 'https://api.devnet.solana.com';
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_SECONDARY_KEYPAIR = '.anchor/devnet-keys/kamiyo-secondary.json';
const DEFAULT_TERTIARY_KEYPAIR = '.anchor/devnet-keys/kamiyo-tertiary.json';

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

function loadSigner(): { keypair: Keypair; source: string } {
  const filePath = optionalEnv('DEPLOYER_KEYPAIR_PATH') || path.join(process.env.HOME || '', '.config/solana/id.json');
  if (fs.existsSync(filePath)) {
    return { keypair: loadKeypairFromPath(filePath), source: filePath };
  }

  const raw = optionalEnv('DEPLOYER_PRIVATE_KEY');
  if (!raw) throw new Error('Missing DEPLOYER_KEYPAIR_PATH or DEPLOYER_PRIVATE_KEY');

  try {
    return { keypair: Keypair.fromSecretKey(bs58.decode(raw)), source: 'DEPLOYER_PRIVATE_KEY(base58)' };
  } catch {
    // fallthrough
  }

  try {
    return { keypair: Keypair.fromSecretKey(Buffer.from(raw, 'base64')), source: 'DEPLOYER_PRIVATE_KEY(base64)' };
  } catch {
    // fallthrough
  }

  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('DEPLOYER_PRIVATE_KEY must be base58/base64 or a JSON array');
  return { keypair: Keypair.fromSecretKey(new Uint8Array(arr)), source: 'DEPLOYER_PRIVATE_KEY(json)' };
}

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function u8(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

function derivePda(programId: PublicKey, seed: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from(seed)], programId);
  return pda;
}

async function ensureDevnetSol(connection: Connection, pubkey: PublicKey): Promise<void> {
  const balance = await connection.getBalance(pubkey);
  if (balance >= 2 * LAMPORTS_PER_SOL) return;

  const rpc = connection.rpcEndpoint;
  if (!rpc.includes('devnet')) return;

  if (process.env.DEVNET_AIRDROP !== 'true') {
    const sol = balance / LAMPORTS_PER_SOL;
    throw new Error(
      `Insufficient devnet SOL (${sol.toFixed(3)} SOL). Top up ${pubkey.toBase58()} or set DEVNET_AIRDROP=true.`
    );
  }

  const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, 'confirmed');
}

async function sendIx(connection: Connection, payer: Keypair, ix: TransactionInstruction): Promise<string> {
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function main() {
  const rpcUrl = optionalEnv('SOLANA_RPC_URL') || DEFAULT_RPC;
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  const { keypair: payer } = loadSigner();
  await ensureDevnetSol(connection, payer.publicKey);

  const programId = new PublicKey(requiredEnv('KAMIYO_PROGRAM_ID'));

  const protocolConfig = derivePda(programId, 'protocol_config');
  const treasury = derivePda(programId, 'treasury');
  const oracleRegistry = derivePda(programId, 'oracle_registry');
  const blacklistRegistry = derivePda(programId, 'blacklist_registry');

  const secondaryKey = resolveOrCreateAuthority(
    'KAMIYO_SECONDARY_SIGNER',
    DEFAULT_SECONDARY_KEYPAIR
  );
  const tertiaryKey = resolveOrCreateAuthority(
    'KAMIYO_TERTIARY_SIGNER',
    DEFAULT_TERTIARY_KEYPAIR
  );

  const steps: Array<{
    name: string;
    pda: PublicKey;
    buildIx: () => TransactionInstruction;
  }> = [
    {
      name: 'initialize_protocol',
      pda: protocolConfig,
      buildIx: () =>
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: protocolConfig, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([
            anchorDiscriminator('initialize_protocol'),
            secondaryKey.toBuffer(),
            tertiaryKey.toBuffer(),
          ]),
        }),
    },
    {
      name: 'initialize_treasury',
      pda: treasury,
      buildIx: () =>
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: treasury, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: anchorDiscriminator('initialize_treasury'),
        }),
    },
    {
      name: 'initialize_oracle_registry',
      pda: oracleRegistry,
      buildIx: () =>
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: oracleRegistry, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([anchorDiscriminator('initialize_oracle_registry'), u8(3), u8(15)]),
        }),
    },
    {
      name: 'initialize_blacklist_registry',
      pda: blacklistRegistry,
      buildIx: () =>
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: blacklistRegistry, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: anchorDiscriminator('initialize_blacklist_registry'),
        }),
    },
  ];

  const results: Record<string, unknown> = {
    rpcUrl,
    programId: programId.toBase58(),
    payer: payer.publicKey.toBase58(),
    secondarySigner: secondaryKey.toBase58(),
    tertiarySigner: tertiaryKey.toBase58(),
  };

  for (const step of steps) {
    const exists = (await connection.getAccountInfo(step.pda)) !== null;
    if (exists) {
      results[step.name] = { skipped: true, pda: step.pda.toBase58() };
      continue;
    }

    const sig = await sendIx(connection, payer, step.buildIx());
    results[step.name] = { skipped: false, pda: step.pda.toBase58(), signature: sig };
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

function resolveOrCreateAuthority(envVar: string, fallbackPath: string): PublicKey {
  const explicit = optionalEnv(envVar);
  if (explicit) return new PublicKey(explicit);

  const filePath = path.isAbsolute(fallbackPath)
    ? fallbackPath
    : path.join(process.cwd(), fallbackPath);

  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    const kp = Keypair.generate();
    fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
    fs.chmodSync(filePath, 0o600);
    return kp.publicKey;
  }

  return loadKeypairFromPath(filePath).publicKey;
}
