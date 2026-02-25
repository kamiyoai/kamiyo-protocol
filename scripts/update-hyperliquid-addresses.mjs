#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage:
  node scripts/update-hyperliquid-addresses.mjs --network <mainnet|testnet> --broadcast <path>

Options:
  --network   Target network block in packages/kamiyo-hyperliquid/src/types.ts
  --broadcast Path to Foundry run-latest.json
`;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { network: '', broadcast: '' };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--network' && value) {
      args.network = value;
      i += 1;
      continue;
    }
    if (key === '--broadcast' && value) {
      args.broadcast = value;
      i += 1;
      continue;
    }
    if (key === '--help' || key === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    fail(`unknown option: ${key}`);
  }

  if (!args.network || !args.broadcast) {
    console.log(USAGE);
    process.exit(1);
  }
  if (args.network !== 'mainnet' && args.network !== 'testnet') {
    fail(`invalid network: ${args.network}`);
  }

  return args;
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function extractAddresses(broadcastPath) {
  const raw = fs.readFileSync(broadcastPath, 'utf8');
  const json = JSON.parse(raw);
  const transactions = Array.isArray(json.transactions) ? json.transactions : [];

  const map = {
    AgentRegistry: '',
    KamiyoVault: '',
    ReputationLimits: '',
  };

  for (const tx of transactions) {
    if (tx?.transactionType !== 'CREATE') continue;
    if (!tx.contractName || !tx.contractAddress) continue;
    if (!(tx.contractName in map)) continue;
    if (!isAddress(tx.contractAddress)) continue;
    map[tx.contractName] = tx.contractAddress;
  }

  for (const contractName of Object.keys(map)) {
    if (!map[contractName]) {
      fail(`missing deployed address for ${contractName} in ${broadcastPath}`);
    }
  }

  return {
    agentRegistry: map.AgentRegistry,
    kamiyoVault: map.KamiyoVault,
    reputationLimits: map.ReputationLimits,
  };
}

function replaceAddressLine(line, key, value) {
  const pattern = new RegExp(`(^\\s*${key}:\\s*)'0x[a-fA-F0-9]{40}'(,\\s*$)`);
  if (!pattern.test(line)) return line;
  return line.replace(pattern, `$1'${value}'$2`);
}

function updateTypesFile(filePath, network, addresses) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const out = [];

  let inNetwork = false;
  let inContracts = false;
  let networkDepth = 0;
  let contractsDepth = 0;

  const networkMarker = new RegExp(`^\\s*${network}:\\s*\\{\\s*$`);

  for (const originalLine of lines) {
    let line = originalLine;
    const openCount = (line.match(/\{/g) || []).length;
    const closeCount = (line.match(/\}/g) || []).length;

    if (!inNetwork && networkMarker.test(line)) {
      inNetwork = true;
      networkDepth = 1;
      out.push(line);
      continue;
    }

    if (inNetwork && !inContracts && /^\s*contracts:\s*\{\s*$/.test(line)) {
      inContracts = true;
      contractsDepth = 1;
      out.push(line);
      continue;
    }

    if (inContracts) {
      line = replaceAddressLine(line, 'agentRegistry', addresses.agentRegistry);
      line = replaceAddressLine(line, 'kamiyoVault', addresses.kamiyoVault);
      line = replaceAddressLine(line, 'reputationLimits', addresses.reputationLimits);
    }

    out.push(line);

    if (inContracts) {
      contractsDepth += openCount - closeCount;
      if (contractsDepth <= 0) {
        inContracts = false;
      }
    }

    if (inNetwork) {
      networkDepth += openCount - closeCount;
      if (networkDepth <= 0) {
        inNetwork = false;
      }
    }
  }

  const updated = out.join('\n');
  fs.writeFileSync(filePath, updated);
}

function main() {
  const { network, broadcast } = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const broadcastPath = path.resolve(process.cwd(), broadcast);
  const typesPath = path.join(repoRoot, 'packages/kamiyo-hyperliquid/src/types.ts');

  if (!fs.existsSync(broadcastPath)) {
    fail(`broadcast file not found: ${broadcastPath}`);
  }
  if (!fs.existsSync(typesPath)) {
    fail(`types file not found: ${typesPath}`);
  }

  const addresses = extractAddresses(broadcastPath);
  updateTypesFile(typesPath, network, addresses);

  console.log(`updated ${network} addresses in packages/kamiyo-hyperliquid/src/types.ts`);
  console.log(`agentRegistry=${addresses.agentRegistry}`);
  console.log(`kamiyoVault=${addresses.kamiyoVault}`);
  console.log(`reputationLimits=${addresses.reputationLimits}`);
}

main();
