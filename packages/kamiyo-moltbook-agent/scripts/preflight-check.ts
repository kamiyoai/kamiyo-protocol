#!/usr/bin/env npx tsx

import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PreflightResult {
  pass: boolean;
  checks: Array<{
    name: string;
    pass: boolean;
    value: string;
    required: boolean;
  }>;
  viableStrategies: string[];
}

async function check(
  name: string,
  fn: () => Promise<{ pass: boolean; value: string }>,
  required = true
): Promise<{ name: string; pass: boolean; value: string; required: boolean }> {
  try {
    const result = await fn();
    return { name, ...result, required };
  } catch (err) {
    return {
      name,
      pass: false,
      value: err instanceof Error ? err.message : 'Unknown error',
      required,
    };
  }
}

export async function runPreflightChecks(): Promise<PreflightResult> {
  const checks: Array<{ name: string; pass: boolean; value: string; required: boolean }> = [];
  const viableStrategies: string[] = [];

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const programId = process.env.KAMIYO_PROGRAM_ID || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
  const moltbookKey = process.env.MOLTBOOK_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  checks.push(await check('AGENT_PRIVATE_KEY', async () => ({
    pass: !!privateKey,
    value: privateKey ? 'Set' : 'Missing',
  })));

  checks.push(await check('MOLTBOOK_API_KEY', async () => ({
    pass: !!moltbookKey && moltbookKey.startsWith('moltbook_'),
    value: moltbookKey ? `Set (${moltbookKey.slice(0, 12)}...)` : 'Missing',
  })));

  checks.push(await check('ANTHROPIC_API_KEY', async () => ({
    pass: !!anthropicKey,
    value: anthropicKey ? 'Set' : 'Missing',
  })));

  if (!privateKey) {
    return { pass: false, checks, viableStrategies };
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

  checks.push(await check('Solana RPC', async () => {
    const version = await connection.getVersion();
    return { pass: true, value: `Connected (${rpcUrl.split('/')[2]}) v${version['solana-core']}` };
  }));

  checks.push(await check('Wallet Address', async () => ({
    pass: true,
    value: wallet.publicKey.toBase58(),
  }), false));

  const balanceCheck = await check('SOL Balance', async () => {
    const balance = await connection.getBalance(wallet.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    return {
      pass: solBalance >= 0.005,
      value: `${solBalance.toFixed(6)} SOL`,
    };
  });
  checks.push(balanceCheck);

  const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
  checks.push(await check('KAMIYO Token Balance', async () => {
    try {
      const tokenAccount = getAssociatedTokenAddressSync(
        KAMIYO_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const info = await connection.getTokenAccountBalance(tokenAccount);
      const amount = parseFloat(info.value.uiAmountString || '0');
      return {
        pass: amount >= 50,
        value: `${amount} KAMIYO (need >= 50 for raw escrow)`,
      };
    } catch {
      return { pass: false, value: 'No KAMIYO token account found' };
    }
  }, false));

  const programPubkey = new PublicKey(programId);
  checks.push(await check('KAMIYO Program', async () => {
    const info = await connection.getAccountInfo(programPubkey);
    return {
      pass: !!info,
      value: info ? `Deployed (${programId.slice(0, 12)}...)` : 'Not found',
    };
  }));

  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programPubkey
  );
  checks.push(await check('Protocol Config PDA', async () => {
    const info = await connection.getAccountInfo(protocolConfig);
    return {
      pass: !!info,
      value: info ? `Exists (${protocolConfig.toBase58().slice(0, 12)}...)` : 'Not initialized',
    };
  }));

  const protocolRoot = path.resolve(__dirname, '../../..');
  const idlPath = path.join(protocolRoot, 'target/idl/kamiyo.json');
  checks.push(await check('Anchor IDL', async () => {
    const exists = fs.existsSync(idlPath);
    return {
      pass: exists,
      value: exists ? `Found at target/idl/kamiyo.json` : 'Missing (run anchor build)',
    };
  }));

  checks.push(await check('Moltbook API', async () => {
    const res = await fetch('https://www.moltbook.com/api/v1/posts?sort=new&limit=1', {
      headers: { Authorization: `Bearer ${moltbookKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    return {
      pass: res.ok,
      value: res.ok ? `Connected (HTTP ${res.status})` : `Error (HTTP ${res.status})`,
    };
  }));

  const hasSOL = balanceCheck.pass;
  const hasProgramConfig = checks.find(c => c.name === 'Protocol Config PDA')?.pass;
  const hasIDL = checks.find(c => c.name === 'Anchor IDL')?.pass;
  const hasMoltbook = checks.find(c => c.name === 'Moltbook API')?.pass;

  if (hasMoltbook && hasSOL) {
    viableStrategies.push('job-poster', 'job-worker', 'direct-negotiation');
  }
  if (hasSOL) {
    viableStrategies.push('sol-transfer');
  }
  if (hasSOL && hasProgramConfig && hasIDL) {
    viableStrategies.push('self-escrow');
  }

  const requiredChecks = checks.filter(c => c.required);
  const allRequiredPass = requiredChecks.every(c => c.pass);

  return { pass: allRequiredPass, checks, viableStrategies };
}

async function main() {
  console.log('========================================');
  console.log('  48h Mission: Preflight Check');
  console.log('========================================');
  console.log('');

  const result = await runPreflightChecks();

  for (const c of result.checks) {
    const icon = c.pass ? '✓' : c.required ? '✗' : '○';
    const tag = c.required ? '' : ' (optional)';
    console.log(`  ${icon} ${c.name}${tag}: ${c.value}`);
  }

  console.log('');
  console.log(`Viable strategies: ${result.viableStrategies.join(', ') || 'NONE'}`);
  console.log(`Overall: ${result.pass ? 'READY' : 'NOT READY'}`);
  console.log('');

  if (!result.pass) {
    console.error('Fix required checks before launching the mission.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Preflight failed:', err);
  process.exit(1);
});
