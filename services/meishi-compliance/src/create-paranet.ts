import DKG from 'dkg.js';
import 'dotenv/config';

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

  const existing = process.env.DKG_PARANET_UAL?.trim();
  if (existing) {
    console.log(existing);
    return;
  }

  const created = await dkg.asset.create(
    {
      public: {
        '@context': 'https://schema.org',
        '@id': 'urn:meishi:paranet',
        '@type': 'Paranet',
        name: 'Meishi paranet',
        description: 'Paranet scoping for Meishi compliance assets.',
      },
    },
    { epochsNum }
  );

  if (!created?.UAL) {
    throw new Error('DKG asset.create returned no UAL');
  }

  const paranetUal = `${created.UAL}/1`;

  await dkg.paranet.create(paranetUal, {
    paranetName: 'meishi',
    paranetDescription: 'Meishi compliance assets',
    paranetNodesAccessPolicy: 0,
    paranetMinersAccessPolicy: 0,
    paranetKcSubmissionPolicy: 0,
  });

  console.log(paranetUal);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
