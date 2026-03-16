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
  const isMainnet = process.env.DKG_MAINNET === 'true';
  const network = isMainnet ? 'mainnet' : 'testnet';
  console.log(`\n=== KAMIYO DKG ${network} Deployment ===\n`);

  const privateKey = process.env.DKG_PRIVATE_KEY;
  if (!privateKey) {
    console.log('Set DKG_PRIVATE_KEY to deploy to mainnet');
    console.log('  DKG_MAINNET=true DKG_PRIVATE_KEY=0x... npx ts-node --esm scripts/deploy-mainnet.ts\n');
    return;
  }

  const DKG = await import('dkg.js');
  const DKGClass = DKG.default || DKG;

  // DKG config - production should always use a dedicated OT node.
  const endpoint = process.env.DKG_ENDPOINT ||
    (isMainnet ? undefined : 'https://v6-pegasus-node-02.origin-trail.network');
  if (!endpoint) {
    console.log('Set DKG_ENDPOINT to your dedicated OT node for mainnet deploys\n');
    return;
  }
  const blockchain = isMainnet ? 'base:8453' : 'otp:20430';

  const client = new DKGClass({
    endpoint,
    port: 8900,
    blockchain: {
      name: blockchain,
      privateKey,
    },
  });

  // Test connection
  console.log(`1. Connecting to DKG ${network} (${endpoint})...`);
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
      solanaPrograms: {
        escrow: 'FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u',
        staking: '9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N',
        mitama: 'DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km',
      },
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
      { epochsNum: 5 }
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
