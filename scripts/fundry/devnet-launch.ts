import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { BN, Wallet } from '@coral-xyz/anchor';
import { KamiyoClient } from '../../packages/kamiyo-sdk/src/client';
import { AgentType } from '../../packages/kamiyo-sdk/src/types';
import { FundryManager } from '../../packages/kamiyo-sdk/src/fundry';

const LAMPORTS_PER_SOL = 1_000_000_000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
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

function optionalPositiveNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function loadKeypair(): Keypair {
  const path = process.env.AGENT_KEYPAIR_PATH?.trim();
  if (path) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const raw = fs.readFileSync(path, 'utf-8');
    const bytes = new Uint8Array(JSON.parse(raw));
    return Keypair.fromSecretKey(bytes);
  }

  const raw = requiredEnv('AGENT_PRIVATE_KEY');
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
  if (!Array.isArray(arr)) throw new Error('AGENT_PRIVATE_KEY must be base58/base64 or a JSON array');
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

function makeWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx: Transaction | VersionedTransaction) {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
        return tx;
      }
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs: Array<Transaction | VersionedTransaction>) {
      return Promise.all(txs.map(tx => this.signTransaction(tx)));
    },
  } as Wallet;
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

async function ensureAgent(client: KamiyoClient): Promise<void> {
  const owner = client.wallet.publicKey;
  const [agentPda] = client.getAgentPDA(owner);
  const agent = await client.getAgent(agentPda);
  if (agent?.isActive) return;

  const stakeSol = optionalNumber('KAMIYO_AGENT_STAKE_SOL', 0.5);
  if (stakeSol <= 0) throw new Error('KAMIYO_AGENT_STAKE_SOL must be positive');

  await client.createAgent({
    name: process.env.KAMIYO_AGENT_NAME?.trim() || 'fundry-devnet-launcher',
    agentType: AgentType.Trading,
    stakeAmount: new BN(Math.floor(stakeSol * LAMPORTS_PER_SOL)),
  });
}

function parseAllowedProgramIds(): string[] | undefined {
  const raw = process.env.FUNDRY_TX_ALLOWED_PROGRAM_IDS;
  if (!raw) return;
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  const keypair = loadKeypair();
  const wallet = makeWallet(keypair);

  await ensureDevnetSol(connection, wallet.publicKey);

  const programId = new PublicKey(requiredEnv('KAMIYO_PROGRAM_ID'));
  const client = new KamiyoClient({ connection, wallet, programId });

  await ensureAgent(client);

  const creatorAddress = process.env.FUNDRY_CREATOR_ADDRESS?.trim() || wallet.publicKey.toBase58();
  const configType = (process.env.FUNDRY_CONFIG_TYPE?.trim() || 'community') as any;
  const initialBuySol = optionalPositiveNumber('FUNDRY_INITIAL_BUY_SOL');
  const escrowAmountSol = optionalNumber('FUNDRY_ESCROW_SOL', 0.5);
  const migrationTargetSol = optionalNumber('FUNDRY_MIGRATION_TARGET_SOL', 40);
  const creatorAllocationBps = optionalInt('FUNDRY_CREATOR_ALLOCATION_BPS', 500);

  if (process.env.FUNDRY_SKIP_TOKEN_CREATION === 'true') {
    const mint = new PublicKey(requiredEnv('FUNDRY_MINT_ADDRESS'));
    const coinId = requiredEnv('FUNDRY_COIN_ID');

    const sig = await client.createTrustedLaunch({
      mint,
      fundryCoinId: coinId,
      configType,
      escrowAmount: new BN(Math.floor(escrowAmountSol * LAMPORTS_PER_SOL)),
      migrationTargetSol: new BN(Math.floor(migrationTargetSol * LAMPORTS_PER_SOL)),
      creatorAllocationBps,
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          mode: 'onchain_only',
          txSignature: sig,
          mint: mint.toBase58(),
          coinId,
          configType,
          escrowAmountSol,
          migrationTargetSol,
          creatorAllocationBps,
          creatorAddress,
        },
        null,
        2
      )
    );
    return;
  }

  if (process.env.FUNDRY_CONFIRM !== 'true') {
    throw new Error('Refusing to call Fundry without FUNDRY_CONFIRM=true');
  }

  const fundry = new FundryManager({
    connection,
    wallet,
    programId,
    fundryMcpEndpoint: process.env.FUNDRY_MCP_ENDPOINT?.trim(),
    fundryTxAllowedProgramIds: parseAllowedProgramIds(),
    enforceFundryTxAllowlist: process.env.FUNDRY_TX_ALLOWLIST_ENFORCE === 'true',
  });

  const result = await fundry.secureLaunch({
    name: requiredEnv('FUNDRY_TOKEN_NAME'),
    ticker: requiredEnv('FUNDRY_TOKEN_TICKER'),
    description: requiredEnv('FUNDRY_TOKEN_DESCRIPTION'),
    imageUrl: requiredEnv('FUNDRY_TOKEN_IMAGE_URL'),
    configType,
    initialBuySol,
    escrowAmountSol,
    migrationTargetSol,
    creatorAllocationBps,
    creatorAddress,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
