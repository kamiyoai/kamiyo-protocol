#!/usr/bin/env npx ts-node
/**
 * Deploy quality-staked Knowledge Asset to DKG mainnet
 *
 * Prerequisites:
 *   - TRAC tokens on Base mainnet
 *   - Base ETH for gas
 *   - Private key with access to both
 *
 * Usage:
 *   DKG_MAINNET=true DKG_PRIVATE_KEY=0x... npx ts-node --esm scripts/deploy-mainnet.ts
 */

async function main() {
  console.log('\n=== KAMIYO DKG Mainnet Deployment ===\n');

  const privateKey = process.env.DKG_PRIVATE_KEY;
  if (!privateKey) {
    console.log('Set DKG_PRIVATE_KEY to deploy to mainnet');
    console.log('  DKG_MAINNET=true DKG_PRIVATE_KEY=0x... npx ts-node --esm scripts/deploy-mainnet.ts\n');
    return;
  }

  const DKG = await import('dkg.js');
  const DKGClass = DKG.default || DKG;

  // Base mainnet config
  const client = new DKGClass({
    endpoint: process.env.DKG_ENDPOINT || 'https://dkg-mainnet.origintrail.io',
    port: 8900,
    blockchain: {
      name: 'base:8453',
      privateKey,
    },
  });

  // Test connection
  console.log('1. Connecting to DKG mainnet...');
  try {
    const info = await client.node.info();
    console.log(`   Connected to node v${info?.version}\n`);
  } catch (err: any) {
    console.log(`   Failed: ${err?.message}\n`);
    return;
  }

  // Publish KAMIYO quality oracle manifest
  console.log('2. Publishing KAMIYO Quality Oracle manifest...');
  try {
    const manifest = {
      '@context': [
        'https://schema.org/',
        { kamiyo: 'https://kamiyo.ai/schema/' },
      ],
      '@type': 'kamiyo:QualityOracleManifest',
      name: 'KAMIYO Quality Oracle',
      description: 'Economic quality layer for AI agents consuming DKG Knowledge Assets',
      version: '0.1.0',
      repository: 'https://github.com/kamiyo-ai/kamiyo-protocol',
      features: [
        'Quality staking with SOL escrow',
        'Multi-oracle commit/reveal assessments',
        'Inference provenance tracking',
        'Dispute resolution with slashing',
      ],
      qualityDimensions: [
        { name: 'factualAccuracy', weight: 0.35 },
        { name: 'sourceQuality', weight: 0.25 },
        { name: 'completeness', weight: 0.20 },
        { name: 'consistency', weight: 0.20 },
      ],
      datePublished: new Date().toISOString(),
    };

    const result = await client.asset.create(
      { public: manifest },
      { epochs: 5 }
    );

    console.log(`   Published!`);
    console.log(`   UAL: ${result?.UAL}\n`);

    // Verify we can read it back
    console.log('3. Verifying asset...');
    const asset = await client.asset.get(result?.UAL);
    console.log(`   Retrieved: ${asset?.public?.assertion?.name || 'OK'}\n`);

    console.log('=== Deployment Complete ===');
    console.log(`\nKAMIYO Quality Oracle manifest: ${result?.UAL}\n`);

  } catch (err: any) {
    console.log(`   Failed: ${err?.message}\n`);
  }
}

main().catch(console.error);
