const fs = require('fs');
const path = require('path');

const { Keypair } = require('@solana/web3.js');

const ANCHOR_TOML_PATH = path.join(process.cwd(), 'Anchor.toml');
const DEPLOY_DIR = path.join(process.cwd(), 'target', 'deploy');
const MEISHI_LIB_PATH = path.join(process.cwd(), 'programs', 'meishi', 'src', 'lib.rs');

function loadProgramIdFromKeypair(programName) {
  const keypairPath = path.join(DEPLOY_DIR, `${programName}-keypair.json`);
  if (!fs.existsSync(keypairPath)) return null;

  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
  return Keypair.fromSecretKey(secretKey).publicKey.toBase58();
}

function syncLocalnetProgramIds(anchorToml) {
  const lines = anchorToml.split(/\r?\n/);
  let inLocalnet = false;
  let updated = 0;
  const missing = new Set();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '[programs.localnet]') {
      inLocalnet = true;
      continue;
    }

    if (inLocalnet && trimmed.startsWith('[')) {
      inLocalnet = false;
      continue;
    }

    if (!inLocalnet) continue;

    const match = raw.match(/^(\s*)([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
    if (!match) continue;

    const [, indent, programName, current] = match;
    const programId = loadProgramIdFromKeypair(programName);
    if (!programId) {
      missing.add(programName);
      continue;
    }

    if (current === programId) continue;
    lines[i] = `${indent}${programName} = "${programId}"`;
    updated++;
  }

  return {
    content: lines.join('\n'),
    updated,
    missing: [...missing].sort(),
  };
}

function extractLocalnetProgramId(anchorToml, programName) {
  const lines = anchorToml.split(/\r?\n/);
  let inLocalnet = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '[programs.localnet]') {
      inLocalnet = true;
      continue;
    }

    if (inLocalnet && trimmed.startsWith('[')) {
      inLocalnet = false;
      continue;
    }

    if (!inLocalnet) continue;

    const match = raw.match(/^(\s*)([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
    if (!match) continue;

    const [, , parsedProgramName, programId] = match;
    if (parsedProgramName === programName) {
      return programId;
    }
  }

  return null;
}

function syncMeishiKamiyoProgramId(kamiyoProgramId) {
  if (!fs.existsSync(MEISHI_LIB_PATH)) {
    throw new Error(`Meishi source not found at ${MEISHI_LIB_PATH}`);
  }

  const source = fs.readFileSync(MEISHI_LIB_PATH, 'utf8');
  const pattern = /(pub const KAMIYO_PROGRAM_ID_LOCAL: Pubkey = pubkey!\(")([^"]+)("\);)/;
  const match = source.match(pattern);
  if (!match) {
    throw new Error('KAMIYO_PROGRAM_ID_LOCAL constant not found in Meishi source');
  }

  const currentProgramId = match[2];
  if (currentProgramId === kamiyoProgramId) {
    return false;
  }

  const next = source.replace(pattern, `$1${kamiyoProgramId}$3`);
  fs.writeFileSync(MEISHI_LIB_PATH, next, 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(ANCHOR_TOML_PATH)) {
    throw new Error(`Anchor.toml not found at ${ANCHOR_TOML_PATH}`);
  }

  const anchorToml = fs.readFileSync(ANCHOR_TOML_PATH, 'utf8');
  const result = syncLocalnetProgramIds(anchorToml);

  if (result.missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: missing keypairs in ${DEPLOY_DIR} for: ${result.missing.join(', ')}`
    );
  }

  let anchorUpdated = false;
  if (result.updated > 0) {
    fs.writeFileSync(ANCHOR_TOML_PATH, result.content, 'utf8');
    anchorUpdated = true;
    // eslint-disable-next-line no-console
    console.log(`Updated Anchor.toml localnet program IDs for ${result.updated} program(s).`);
  }

  const kamiyoLocalnetProgramId = extractLocalnetProgramId(result.content, 'kamiyo');
  let meishiUpdated = false;
  if (kamiyoLocalnetProgramId) {
    meishiUpdated = syncMeishiKamiyoProgramId(kamiyoLocalnetProgramId);
    if (meishiUpdated) {
      // eslint-disable-next-line no-console
      console.log(`Updated Meishi local Kamiyo allowlist program ID to ${kamiyoLocalnetProgramId}.`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('Warning: could not locate [programs.localnet].kamiyo in Anchor.toml.');
  }

  if (!anchorUpdated && !meishiUpdated) {
    // eslint-disable-next-line no-console
    console.log('Anchor.toml localnet IDs and Meishi local Kamiyo ID already match target/deploy keypairs.');
  }
}

main();
