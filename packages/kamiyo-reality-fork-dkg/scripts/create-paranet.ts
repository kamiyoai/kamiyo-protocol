// One-time script to bootstrap the Reality Fork paranet on DKG.
// Usage: DKG_ENDPOINT=... DKG_BLOCKCHAIN=... DKG_PRIVATE_KEY=... npx tsx scripts/create-paranet.ts

import { createHash } from 'crypto';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeDkgEndpoint(endpoint: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(endpoint)) {
    return endpoint;
  }
  return `http://${endpoint}`;
}

async function main() {
  const endpoint = required('DKG_ENDPOINT');
  const blockchain = required('DKG_BLOCKCHAIN') as 'base:8453' | 'gnosis:100' | 'otp:2043';
  const privateKey = required('DKG_PRIVATE_KEY');

  const port = parseInt(process.env.DKG_PORT || '8900', 10);
  const rpc = process.env.DKG_RPC_URL?.trim();
  const epochsNum = parseInt(process.env.DKG_DEFAULT_EPOCHS || '2', 10) || 2;

  // Check for existing paranet
  const existing = process.env.DKG_PARANET_UAL?.trim();
  if (existing) {
    console.log(`Paranet already exists: ${existing}`);
    return;
  }

  const DKG = await import('dkg.js').then(m => m.default || m);

  const dkg = new (DKG as any)({
    endpoint: normalizeDkgEndpoint(endpoint),
    port,
    blockchain: {
      name: blockchain,
      ...(rpc ? { rpc } : {}),
      privateKey,
    },
    maxNumberOfRetries: 10,
    frequency: 2,
    contentType: 'all',
    nodeApiVersion: '/v1',
  });

  // Build a deterministic content hash for the root asset
  const rootContent = JSON.stringify({
    name: 'KAMIYO Reality Fork Paranet',
    description: 'Paranet for Reality Fork hypothesis simulation and evidence Knowledge Assets.',
    version: '1.0.0',
  });
  const contentHash = createHash('sha256').update(rootContent).digest('hex');

  // Step 1: Create root Knowledge Asset
  console.log('Creating root Knowledge Asset...');
  const created = await dkg.asset.create(
    {
      public: {
        '@context': 'https://schema.org',
        '@id': `urn:kamiyo:rf:paranet:${contentHash.slice(0, 16)}`,
        '@type': 'Paranet',
        name: 'KAMIYO Reality Fork Paranet',
        description:
          'Paranet for Reality Fork hypothesis simulation and evidence Knowledge Assets.',
      },
    },
    { epochsNum }
  );

  if (!created?.UAL) {
    throw new Error('DKG asset.create returned no UAL');
  }

  const paranetUAL = `${created.UAL}/1`;
  console.log(`Root asset UAL: ${created.UAL}`);

  // Step 2: Create paranet with open access policies
  console.log('Creating paranet...');
  await dkg.paranet.create(paranetUAL, {
    paranetName: 'kamiyo-reality-fork',
    paranetDescription: 'Reality Fork hypothesis simulation and evidence Knowledge Assets',
    paranetNodesAccessPolicy: 0,
    paranetMinersAccessPolicy: 0,
    paranetKcSubmissionPolicy: 0,
  });

  console.log(`\nParanet created successfully!`);
  console.log(`Paranet UAL: ${paranetUAL}`);
  console.log(`\nAdd to your .env:\nDKG_PARANET_UAL=${paranetUAL}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
