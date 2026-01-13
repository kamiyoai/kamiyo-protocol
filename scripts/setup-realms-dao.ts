/*
 * KAMIYO Realms DAO Setup
 *
 * $KAMIYO uses Token-2022 (pump.fun). SPL Governance SDK doesn't support
 * Token-2022 for realm creation - use Realms UI instead:
 * https://app.realms.today
 *
 * This script validates the token and outputs the config to use.
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  GoverningTokenType,
  getGovernanceProgramVersion,
  withCreateRealm,
  MintMaxVoteWeightSource,
  GoverningTokenConfigAccountArgs,
} from '@solana/spl-governance';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import * as fs from 'fs';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const CONFIG = {
  name: 'KAMIYO Protocol',
  minTokensToPropose: 100_000,
  votingDays: 3,
  coolOffHours: 12,
  threshold: 60,
};

async function detectTokenProgram(connection: Connection, mint: PublicKey) {
  try {
    const info = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return { info, isToken2022: true };
  } catch {
    const info = await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID);
    return { info, isToken2022: false };
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const keyPath = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  if (!fs.existsSync(keyPath)) {
    console.error('Keypair not found:', keyPath);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf-8')))
  );

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('KAMIYO Realms DAO Setup');
  console.log('-----------------------');
  console.log('Authority:', keypair.publicKey.toBase58());
  console.log('Token:', KAMIYO_MINT.toBase58());
  if (dryRun) console.log('Mode: dry-run');
  console.log('');

  const { info: mintInfo, isToken2022 } = await detectTokenProgram(connection, KAMIYO_MINT);
  console.log('Decimals:', mintInfo.decimals);
  console.log('Supply:', mintInfo.supply.toString());
  console.log('Program:', isToken2022 ? 'Token-2022' : 'SPL Token');

  if (isToken2022 && !force) {
    console.log('');
    console.log('Token-2022 detected. Use Realms UI for creation:');
    console.log('https://app.realms.today');
    console.log('');
    console.log('Config:');
    console.log('  Name:', CONFIG.name);
    console.log('  Token:', KAMIYO_MINT.toBase58());
    console.log('  Min tokens to propose:', CONFIG.minTokensToPropose.toLocaleString());
    console.log('  Voting period:', CONFIG.votingDays, 'days');
    console.log('  Threshold:', CONFIG.threshold + '%');
    console.log('');
    console.log('Pass --force to attempt SDK creation (will fail for Token-2022).');
    return;
  }

  let programVersion = 3;
  try {
    const detected = await getGovernanceProgramVersion(connection, GOVERNANCE_PROGRAM_ID);
    if (detected > 1) programVersion = detected;
  } catch {
    // default to v3
  }

  const [realmPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('governance'), Buffer.from(CONFIG.name)],
    GOVERNANCE_PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(realmPda);
  if (existing) {
    console.log('');
    console.log('Realm exists:', realmPda.toBase58());
    console.log('https://app.realms.today/dao/' + realmPda.toBase58());
    return;
  }

  console.log('');
  console.log('Realm PDA:', realmPda.toBase58());
  console.log('Program version:', programVersion);

  const tokenConfig: GoverningTokenConfigAccountArgs = {
    voterWeightAddin: undefined,
    maxVoterWeightAddin: undefined,
    tokenType: GoverningTokenType.Liquid,
  };

  const instructions: any[] = [];
  await withCreateRealm(
    instructions,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    CONFIG.name,
    keypair.publicKey,
    KAMIYO_MINT,
    keypair.publicKey,
    undefined,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1e10),
    tokenConfig,
    undefined,
  );

  const tx = new Transaction().add(...instructions);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;

  console.log('Simulating...');
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    console.error('Simulation failed:', sim.value.err);
    if (sim.value.logs) {
      console.error('Logs:');
      sim.value.logs.forEach(l => console.error('  ' + l));
    }
    process.exit(1);
  }
  console.log('CU:', sim.value.unitsConsumed);

  if (dryRun) {
    console.log('');
    console.log('Dry run complete. Realm would be at:', realmPda.toBase58());
    return;
  }

  console.log('Sending...');
  tx.sign(keypair);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  console.log('');
  console.log('Done');
  console.log('Signature:', sig);
  console.log('Realm:', realmPda.toBase58());
  console.log('https://app.realms.today/dao/' + realmPda.toBase58());

  fs.writeFileSync('./scripts/realms-dao-result.json', JSON.stringify({
    realm: realmPda.toBase58(),
    token: KAMIYO_MINT.toBase58(),
    authority: keypair.publicKey.toBase58(),
    signature: sig,
    config: CONFIG,
    created: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
