#!/usr/bin/env tsx

import DKG from 'dkg.js';
import 'dotenv/config';

const DKG_ENV_KEYS = {
  endpoint: ['KAMIYO_DKG_ENDPOINT', 'DKG_ENDPOINT', 'PARANET_DKG_ENDPOINT', 'OT_NODE_ENDPOINT'],
  blockchain: ['KAMIYO_DKG_BLOCKCHAIN', 'DKG_BLOCKCHAIN', 'PARANET_BLOCKCHAIN'],
  port: ['KAMIYO_DKG_PORT', 'DKG_PORT', 'PARANET_DKG_PORT'],
  privateKey: ['KAMIYO_DKG_PRIVATE_KEY', 'DKG_PRIVATE_KEY', 'PARANET_PRIVATE_KEY'],
  rpc: ['KAMIYO_DKG_RPC_URL', 'DKG_RPC_URL', 'PARANET_DKG_RPC_URL'],
} as const;

const PARANET_HINT_KEYS = ['PARANET_NAME_HINT', 'KAMIYO_PARANET_NAME_HINT', 'DKG_PARANET_NAME_HINT'] as const;

const DEFAULT_RPC_BY_CHAIN: Record<string, string> = {
  'base:8453': 'https://base-rpc.publicnode.com',
  'base:84532': 'https://base-sepolia-rpc.publicnode.com',
};

type ParanetCandidate = {
  index: number;
  paranetId: string;
  name: string;
  description: string;
  kcStorage: string;
  kcTokenId: string;
  kaTokenId: string;
  ual: string;
};

function resolveEnvValue(keys: readonly string[]): { value: string | undefined; source: string | null } {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    return { value, source: key };
  }

  return { value: undefined, source: null };
}

function parseChainId(blockchain: string): string {
  const parts = blockchain.split(':');
  return parts[1] || '8453';
}

function bigintFromMaybe(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function pickParanet(candidates: ParanetCandidate[], hint?: string): { selected: ParanetCandidate; reason: string } {
  if (candidates.length === 0) {
    throw new Error('No paranets are registered on this chain.');
  }

  const normalizedHint = hint?.trim().toLowerCase();

  if (normalizedHint) {
    const hinted = candidates.filter((candidate) =>
      `${candidate.name} ${candidate.description}`.toLowerCase().includes(normalizedHint),
    );
    if (hinted.length > 0) {
      hinted.sort((a, b) => Number(bigintFromMaybe(b.kcTokenId) - bigintFromMaybe(a.kcTokenId)));
      return { selected: hinted[0], reason: `matched PARANET_NAME_HINT=${hint}` };
    }
  }

  const branded = candidates.filter((candidate) =>
    /kamiyo|meishi|kani/i.test(`${candidate.name} ${candidate.description}`),
  );
  if (branded.length > 0) {
    branded.sort((a, b) => Number(bigintFromMaybe(b.kcTokenId) - bigintFromMaybe(a.kcTokenId)));
    return { selected: branded[0], reason: 'matched branded paranet name/description' };
  }

  const sorted = [...candidates].sort((a, b) =>
    Number(bigintFromMaybe(b.kcTokenId) - bigintFromMaybe(a.kcTokenId)),
  );
  return { selected: sorted[0], reason: 'selected latest by knowledge collection token id' };
}

async function main() {
  const endpoint = resolveEnvValue(DKG_ENV_KEYS.endpoint);
  const blockchain = resolveEnvValue(DKG_ENV_KEYS.blockchain);
  const port = resolveEnvValue(DKG_ENV_KEYS.port);
  const privateKey = resolveEnvValue(DKG_ENV_KEYS.privateKey);
  const rpc = resolveEnvValue(DKG_ENV_KEYS.rpc);
  const hint = resolveEnvValue(PARANET_HINT_KEYS);

  if (!endpoint.value) {
    throw new Error(`Missing DKG endpoint (checked: ${DKG_ENV_KEYS.endpoint.join(', ')})`);
  }
  if (!blockchain.value) {
    throw new Error(`Missing blockchain value (checked: ${DKG_ENV_KEYS.blockchain.join(', ')})`);
  }
  if (!privateKey.value) {
    throw new Error(`Missing private key (checked: ${DKG_ENV_KEYS.privateKey.join(', ')})`);
  }

  const rpcUrl = rpc.value ?? DEFAULT_RPC_BY_CHAIN[blockchain.value];
  const chainId = parseChainId(blockchain.value);

  const dkg = new (DKG as any)({
    endpoint: endpoint.value,
    port: Number(port.value || '8900'),
    blockchain: {
      name: blockchain.value,
      privateKey: privateKey.value,
      ...(rpcUrl ? { rpc: rpcUrl } : {}),
    },
    maxNumberOfRetries: 0,
    frequency: 2,
  });

  const chainConfig = dkg.paranet.inputService.getBlockchain({});
  await dkg.paranet.blockchainService.ensureBlockchainInfo(chainConfig);

  const web3 = await dkg.paranet.blockchainService.getWeb3Instance(chainConfig);
  const walletAddress = web3.eth.accounts.privateKeyToAccount(privateKey.value).address.toLowerCase();
  chainConfig.publicKey = walletAddress;

  const totalParanetsRaw = await dkg.paranet.blockchainService.callContractFunction(
    'ParanetsRegistry',
    'getParanetsCount',
    [],
    chainConfig,
  );

  const totalParanets = Number(totalParanetsRaw);
  if (!Number.isFinite(totalParanets) || totalParanets <= 0) {
    throw new Error('No registered paranets found on this chain.');
  }

  const candidates: ParanetCandidate[] = [];
  for (let index = 0; index < totalParanets; index += 1) {
    const paranetId = await dkg.paranet.blockchainService.callContractFunction(
      'ParanetsRegistry',
      'getParanetIdAtIndex',
      [index],
      chainConfig,
    );

    const metadata = await dkg.paranet.blockchainService.callContractFunction(
      'ParanetsRegistry',
      'getParanetMetadata',
      [paranetId],
      chainConfig,
    );

    const kcStorage = String(metadata.paranetKCStorageContract ?? metadata[0]).toLowerCase();
    const kcTokenId = String(metadata.paranetKCTokenId ?? metadata[1]);
    const kaTokenId = String(metadata.paranetKATokenId ?? metadata[2]);
    const name = String(metadata.name ?? metadata[3] ?? '');
    const description = String(metadata.description ?? metadata[4] ?? '');

    candidates.push({
      index,
      paranetId,
      name,
      description,
      kcStorage,
      kcTokenId,
      kaTokenId,
      ual: `did:dkg:${blockchain.value.toLowerCase()}/${kcStorage}/${kcTokenId}/${kaTokenId}`,
    });
  }

  const { selected, reason } = pickParanet(candidates, hint.value);
  const suggestedGlobalId = `eip155:${chainId}:${walletAddress}:1`;

  const report = {
    selected,
    reason,
    chain: blockchain.value,
    endpointSource: endpoint.source,
    blockchainSource: blockchain.source,
    privateKeySource: privateKey.source,
    rpcSource: rpc.source ?? (rpcUrl ? 'default' : null),
    hintSource: hint.source,
    totalParanets,
    walletAddress,
    suggestedGlobalId,
    candidates,
  };

  console.log(JSON.stringify(report, null, 2));
  console.log('');
  console.log('# Suggested exports');
  console.log(`export KAMIYO_DKG_PARANET_UAL='${selected.ual}'`);
  console.log(`export DKG_PARANET_UAL='${selected.ual}'`);
  console.log(`export PARANET_UAL='${selected.ual}'`);
  console.log(`export KAMIYO_DKG_AGENT_ID='${suggestedGlobalId}'`);
  console.log(`export DKG_AGENT_ID='${suggestedGlobalId}'`);
  console.log(`export PARANET_OPERATOR_GLOBAL_ID='${suggestedGlobalId}'`);
  console.log(`export PARANET_ATTESTOR_GLOBAL_ID='${suggestedGlobalId}'`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
