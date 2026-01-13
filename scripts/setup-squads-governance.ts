/*
 * KAMIYO Squads Governance Setup
 *
 * Creates a multisig for protocol governance.
 * Council executes community-approved proposals.
 *
 * Usage:
 *   npx tsx scripts/setup-squads-governance.ts --dry-run
 *   npx tsx scripts/setup-squads-governance.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import * as fs from 'fs';

const { Permission, Permissions } = multisig.types;

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Council members - update these before running
const COUNCIL_MEMBERS = [
  // Add council member pubkeys here
  // { key: 'pubkey1', role: 'all' },      // full permissions
  // { key: 'pubkey2', role: 'voter' },    // vote only
];

const CONFIG = {
  threshold: 1, // Start with 1-of-1, add members via Squads UI
  timeLock: 0,  // no timelock (add later via proposal)
};

function getPermissions(role: string) {
  switch (role) {
    case 'all':
      return Permissions.all();
    case 'voter':
      return Permissions.fromPermissions([Permission.Vote]);
    case 'proposer':
      return Permissions.fromPermissions([Permission.Initiate]);
    case 'executor':
      return Permissions.fromPermissions([Permission.Execute]);
    default:
      return Permissions.fromPermissions([Permission.Vote]);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const keyPath = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  if (!fs.existsSync(keyPath)) {
    console.error('Keypair not found:', keyPath);
    process.exit(1);
  }

  const creator = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf-8')))
  );

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('KAMIYO Squads Governance Setup');
  console.log('------------------------------');
  console.log('Creator:', creator.publicKey.toBase58());
  console.log('Threshold:', CONFIG.threshold);
  if (dryRun) console.log('Mode: dry-run');
  console.log('');

  // Check balance
  const balance = await connection.getBalance(creator.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  if (!dryRun && balance < 0.15 * LAMPORTS_PER_SOL) {
    console.error('Insufficient balance. Need ~0.15 SOL for deployment.');
    process.exit(1);
  }

  // Generate createKey for PDA derivation
  const createKey = Keypair.generate();

  // Derive multisig PDA
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });

  // Derive vault PDA (where funds go)
  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: 0,
  });

  console.log('Multisig PDA:', multisigPda.toBase58());
  console.log('Vault PDA:', vaultPda.toBase58());
  console.log('');

  // Build member list
  const members: multisig.types.Member[] = [
    {
      key: creator.publicKey,
      permissions: Permissions.all(),
    },
  ];

  // Add configured council members
  for (const member of COUNCIL_MEMBERS) {
    try {
      members.push({
        key: new PublicKey(member.key),
        permissions: getPermissions(member.role),
      });
    } catch (e) {
      console.error('Invalid member pubkey:', member.key);
      process.exit(1);
    }
  }

  console.log('Members:');
  members.forEach((m, i) => {
    const perms = [];
    if (m.permissions.mask & Permission.Initiate) perms.push('propose');
    if (m.permissions.mask & Permission.Vote) perms.push('vote');
    if (m.permissions.mask & Permission.Execute) perms.push('execute');
    console.log(`  ${i + 1}. ${m.key.toBase58().slice(0, 8)}... [${perms.join(', ')}]`);
  });
  console.log('');

  if (!dryRun && members.length < CONFIG.threshold) {
    console.error(`Need at least ${CONFIG.threshold} members for threshold.`);
    console.error('Add council members to COUNCIL_MEMBERS array.');
    process.exit(1);
  }

  // Get program config for treasury
  const programConfigPda = multisig.getProgramConfigPda({})[0];
  let configTreasury: PublicKey;
  try {
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda
    );
    configTreasury = programConfig.treasury;
  } catch {
    console.error('Failed to fetch Squads program config');
    process.exit(1);
  }

  if (dryRun) {
    console.log('Dry run complete.');
    console.log('');
    console.log('To deploy:');
    console.log('  1. Add council member pubkeys to COUNCIL_MEMBERS');
    console.log('  2. Run without --dry-run');
    console.log('');
    console.log('Result would be:');
    console.log('  Multisig:', multisigPda.toBase58());
    console.log('  Vault:', vaultPda.toBase58());
    console.log('  Squads UI: https://v4.squads.so/squads/' + multisigPda.toBase58());
    return;
  }

  console.log('Creating multisig...');

  const signature = await multisig.rpc.multisigCreateV2({
    connection,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    timeLock: CONFIG.timeLock,
    members,
    threshold: CONFIG.threshold,
    treasury: configTreasury,
    rentCollector: null,
  });

  console.log('');
  console.log('Done');
  console.log('Signature:', signature);
  console.log('Multisig:', multisigPda.toBase58());
  console.log('Vault:', vaultPda.toBase58());
  console.log('');
  console.log('Squads UI: https://v4.squads.so/squads/' + multisigPda.toBase58());

  // Save result
  const result = {
    multisig: multisigPda.toBase58(),
    vault: vaultPda.toBase58(),
    createKey: createKey.publicKey.toBase58(),
    creator: creator.publicKey.toBase58(),
    members: members.map(m => m.key.toBase58()),
    threshold: CONFIG.threshold,
    signature,
    created: new Date().toISOString(),
    ui: 'https://v4.squads.so/squads/' + multisigPda.toBase58(),
  };

  fs.writeFileSync('./scripts/squads-governance-result.json', JSON.stringify(result, null, 2));
  console.log('Result saved to scripts/squads-governance-result.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
