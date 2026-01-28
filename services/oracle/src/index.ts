import { createOracle } from '@kamiyo/hyperliquid';

const REQUIRED_ENV = ['ORACLE_PRIVATE_KEY'];

function checkEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      console.error(`Missing required env var: ${key}`);
      process.exit(1);
    }
  }
}

async function main() {
  checkEnv();

  const oracle = await createOracle({
    rpcUrl: process.env.RPC_URL || 'https://rpc.hyperliquid.xyz/evm',
    walletPrivateKey: process.env.ORACLE_PRIVATE_KEY!,
    updateInterval: Number(process.env.UPDATE_INTERVAL || 60_000),
    trustedOracles: process.env.TRUSTED_ORACLES?.split(',') || [],
    requiredSignatures: Number(process.env.REQUIRED_SIGNATURES || 1),
  });

  console.log('Oracle service starting...');
  console.log('Update interval:', process.env.UPDATE_INTERVAL || '60000', 'ms');

  await oracle.start();

  // Keep alive and auto-resolve disputes on interval
  const disputeInterval = Number(process.env.DISPUTE_INTERVAL || 300_000);
  setInterval(async () => {
    try {
      await oracle.autoResolveDisputes();
    } catch (err) {
      console.error('Dispute resolution error:', err);
    }
  }, disputeInterval);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down oracle...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('Shutting down oracle...');
    process.exit(0);
  });

  console.log('Oracle service running.');
}

main().catch((err) => {
  console.error('Oracle fatal error:', err);
  process.exit(1);
});
