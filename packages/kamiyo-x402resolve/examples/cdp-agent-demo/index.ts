// CDP Autonomous Agent Demo
// Demand-side agent using CDP Embedded Wallets for autonomous x402 payments

import { Connection, PublicKey } from '@solana/web3.js';
import { CDPAutonomousAgent } from '@x402resolve/agent-client';
import * as dotenv from 'dotenv';

dotenv.config();

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const connection = new Connection('https://api.devnet.solana.com');

async function main() {
  const agent = new CDPAutonomousAgent({
    apiKeyName: process.env.CDP_API_KEY_NAME!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    connection,
    programId: ESCROW_PROGRAM_ID,
    qualityThreshold: 85,
    maxPrice: 0.01,
    autoDispute: true,
    networkId: 'solana-devnet'
  });

  await agent.initialize();

  const balance = await agent.getBalance();
  console.log(`Wallet balance: ${balance} SOL`);

  if (balance < 0.1) {
    console.log('Requesting devnet faucet...');
    await agent.requestFaucet();
  }

  const query = {
    chain: 'ethereum',
    severity: 'critical',
    min_amount: 1000000
  };

  const schema = {
    exploit_id: '',
    protocol: '',
    chain: '',
    amount_lost_usd: 0,
    timestamp: '',
    tx_hash: ''
  };

  const result = await agent.autonomousWorkflow(query, schema);

  console.log('\nFinal Results:');
  console.log('-'.repeat(60));

  result.results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.tool}`);
    if (r.error) {
      console.log(`   Error: ${r.error}`);
    } else {
      console.log(`   Quality: ${r.quality}%`);
      console.log(`   Cost: ${r.cost} SOL`);
      console.log(`   Records: ${r.data.length || 0}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Total Spent: ${result.totalCost} SOL`);
  console.log(`Average Quality: ${result.averageQuality.toFixed(0)}%`);
  console.log(`Tools Used: ${result.results.length}`);
}

main().catch(console.error);
