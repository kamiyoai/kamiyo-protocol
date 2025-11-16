// Autonomous Agent Demo - KAMIYO Security Intelligence with x402Resolve

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AutonomousServiceAgent } from '@x402resolve/agent-client';

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const connection = new Connection('https://api.devnet.solana.com');

async function runSecurityIntelligenceDemo() {
  const agentKeypair = Keypair.generate();

  console.log('Autonomous Security Intelligence Agent Demo\n');
  console.log('Agent Wallet:', agentKeypair.publicKey.toString(), '\n');

  const agent = new AutonomousServiceAgent({
    keypair: agentKeypair,
    connection,
    programId: ESCROW_PROGRAM_ID,
    qualityThreshold: 85,
    maxPrice: 0.001,
    autoDispute: true
  });

  console.log('Scenario 1: Query latest crypto exploits');
  console.log('Expected: High-quality data with all fields present\n');

  try {
    const result1 = await agent.consumeAPI(
      'https://x402resolve.kamiyo.ai/x402/exploits/latest',
      { chain: 'ethereum', severity: 'critical' },
      {
        exploit_id: '',
        protocol: '',
        chain: '',
        amount_lost_usd: 0,
        timestamp: '',
        tx_hash: ''
      }
    );

    console.log('Result:');
    console.log(`  Exploits found: ${result1.data.length || 1}`);
    console.log(`  Quality score: ${result1.quality}%`);
    console.log(`  Cost: ${result1.cost} SOL`);
    console.log(`  Status: ${result1.disputed ? 'DISPUTED' : 'ACCEPTED'}`);

    if (result1.disputed) {
      const refund = ((0.001 - result1.cost) / 0.001) * 100;
      console.log(`  Refund: ${refund.toFixed(0)}%`);
    }
  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  console.log('Scenario 2: Assess protocol security risk');
  console.log('Expected: Comprehensive risk assessment with audit data\n');

  try {
    const result2 = await agent.consumeAPI(
      'https://x402resolve.kamiyo.ai/x402/protocol/assess-risk',
      {
        protocol_address: '0x1234...abcd',
        chain: 'ethereum'
      },
      {
        risk_score: 0,
        risk_level: '',
        analysis: {},
        recommendations: []
      }
    );

    console.log('Result:');
    console.log(`  Risk score: ${result2.data.risk_score || 'N/A'}`);
    console.log(`  Quality score: ${result2.quality}%`);
    console.log(`  Cost: ${result2.cost} SOL`);
    console.log(`  Status: ${result2.disputed ? 'DISPUTED' : 'ACCEPTED'}`);
  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  console.log('Scenario 3: Check wallet involvement in exploits');
  console.log('Expected: Wallet analysis with flagged status\n');

  try {
    const result3 = await agent.consumeAPI(
      'https://x402resolve.kamiyo.ai/x402/wallet/check-involvement/0x1234...5678',
      {},
      {
        address: '',
        is_flagged: false,
        risk_level: '',
        involvement: {}
      }
    );

    console.log('Result:');
    console.log(`  Flagged: ${result3.data.is_flagged || false}`);
    console.log(`  Quality score: ${result3.quality}%`);
    console.log(`  Cost: ${result3.cost} SOL`);
    console.log(`  Status: ${result3.disputed ? 'DISPUTED' : 'ACCEPTED'}`);
  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\nDemo complete. All transactions executed autonomously.\n');
}

runSecurityIntelligenceDemo().catch(console.error);
