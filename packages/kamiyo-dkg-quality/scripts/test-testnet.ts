#!/usr/bin/env npx ts-node
/**
 * Integration test against DKG testnet
 *
 * Usage:
 *   DKG_ENDPOINT=https://v6-pegasus-node-02.origin-trail.network npx ts-node --esm scripts/test-testnet.ts
 */

async function main() {
  console.log('\n=== DKG Testnet Integration Test ===\n');

  const endpoint = process.env.DKG_ENDPOINT;
  if (!endpoint) {
    console.log('Set DKG_ENDPOINT to run against testnet:');
    console.log('  DKG_ENDPOINT=https://v6-pegasus-node-02.origin-trail.network npx ts-node --esm scripts/test-testnet.ts\n');
    return;
  }

  // Direct dkg.js test
  const DKG = await import('dkg.js');
  const DKGClass = DKG.default || DKG;

  const client = new DKGClass({
    endpoint,
    port: parseInt(process.env.DKG_PORT || '8900'),
    blockchain: { name: 'otp:20430' },
  });

  // Test 1: Node info
  console.log('1. Testing node.info()...');
  try {
    const info = await client.node.info();
    console.log(`   Node version: ${info?.version || 'unknown'}`);
    console.log(`   PASS\n`);
  } catch (err: any) {
    console.log(`   FAIL: ${err?.message}\n`);
  }

  // Test 2: SPARQL query
  console.log('2. Testing graph.query()...');
  try {
    const result = await client.graph.query(
      'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 3',
      'SELECT'
    );
    console.log(`   Returned ${result?.data?.length || 0} results`);
    if (result?.data?.[0]) {
      console.log(`   Sample: ${JSON.stringify(result.data[0]).slice(0, 80)}...`);
    }
    console.log(`   PASS\n`);
  } catch (err: any) {
    console.log(`   FAIL: ${err?.message}\n`);
  }

  // Test 3: Get asset (if we have a known UAL)
  console.log('3. Testing asset.get()...');
  try {
    // Try to get one of the assets from the query
    const queryResult = await client.graph.query(
      `SELECT ?ual WHERE { ?ual a <https://schema.org/Thing> } LIMIT 1`,
      'SELECT'
    );
    if (queryResult?.data?.[0]?.ual) {
      const asset = await client.asset.get(queryResult.data[0].ual);
      console.log(`   Got asset with keys: ${Object.keys(asset || {}).join(', ')}`);
      console.log(`   PASS\n`);
    } else {
      console.log(`   SKIP: No assets found to test\n`);
    }
  } catch (err: any) {
    console.log(`   FAIL: ${err?.message}\n`);
  }

  // Test 4: Publish (requires private key)
  if (process.env.DKG_PRIVATE_KEY) {
    console.log('4. Testing asset.create()...');
    try {
      const result = await client.asset.create(
        {
          public: {
            '@context': 'https://schema.org/',
            '@type': 'Thing',
            name: 'KAMIYO Test Asset',
            dateCreated: new Date().toISOString(),
          },
        },
        { epochsNum: 2 }
      );
      console.log(`   Published: ${result?.UAL}`);
      console.log(`   PASS\n`);
    } catch (err: any) {
      console.log(`   FAIL: ${err?.message}\n`);
    }
  } else {
    console.log('4. Skipping asset.create() (no DKG_PRIVATE_KEY)\n');
  }

  console.log('=== Complete ===\n');
}

main().catch(console.error);
