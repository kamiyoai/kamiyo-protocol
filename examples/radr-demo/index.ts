/**
 * Radr ShadowPay + Kamiyo Integration Demo
 *
 * Demonstrates:
 * 1. Private transfers via ShadowWire
 * 2. Private escrows with dispute protection
 * 3. Reputation-gated pool access
 *
 * Run: npx ts-node examples/radr-demo/index.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createShadowWireClient,
  createPrivateEscrowHandler,
  createShadowIdReputationGate,
  REPUTATION_TIERS,
  getTierBenefits,
} from '@kamiyo/radr';

const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

async function main() {
  console.log('=== Radr + Kamiyo Integration Demo ===\n');

  // Setup
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Generate test wallets
  const agent = Keypair.generate();
  const provider = Keypair.generate();

  console.log('Agent wallet:', agent.publicKey.toBase58());
  console.log('Provider wallet:', provider.publicKey.toBase58());
  console.log('');

  // Demo 1: ShadowWire Client
  console.log('--- Demo 1: ShadowWire Client ---');
  try {
    const shadowWire = await createShadowWireClient(connection, { debug: true });

    console.log('Supported tokens:', shadowWire.getSupportedTokens().join(', '));
    console.log('Relayer fee for 10 SOL:', shadowWire.calculateRelayerFee(10), 'SOL');

    // Check if provider can receive internal transfers
    const canInternal = await shadowWire.canReceiveInternal(provider.publicKey.toBase58());
    console.log('Provider can receive internal transfers:', canInternal);
    console.log('');
  } catch (err) {
    console.log('ShadowWire demo skipped (requires @radr/shadowwire)');
    console.log('Install with: npm install @radr/shadowwire');
    console.log('');
  }

  // Demo 2: Reputation Gate
  console.log('--- Demo 2: Reputation Gate ---');
  const gate = createShadowIdReputationGate(connection, KAMIYO_PROGRAM_ID);

  // Check reputation tiers
  console.log('Reputation Tiers:');
  for (const [tier, config] of Object.entries(REPUTATION_TIERS)) {
    console.log(`  ${config.label} (${tier}): score ${config.min}-${config.max}`);
    console.log(`    Benefits: ${getTierBenefits(tier as any)}`);
  }
  console.log('');

  // Check agent's reputation gate
  const gateResult = await gate.checkReputationGate({ publicKey: agent.publicKey }, 50);
  console.log('Agent reputation check (threshold=50):');
  console.log('  Eligible:', gateResult.eligible);
  console.log('  Tier:', gateResult.tier);
  console.log('  Error:', gateResult.error || 'none');
  console.log('');

  // Calculate effective rate limits
  console.log('Effective rate limits:');
  console.log('  Lite + Bronze:', gate.calculateEffectiveRateLimit('lite', 'bronze'), 'msg/epoch');
  console.log('  Active + Gold:', gate.calculateEffectiveRateLimit('active', 'gold'), 'msg/epoch');
  console.log('  Active + Platinum:', gate.calculateEffectiveRateLimit('active', 'platinum'), 'msg/epoch');
  console.log('');

  // Demo 3: Private Escrow
  console.log('--- Demo 3: Private Escrow ---');
  try {
    const escrow = await createPrivateEscrowHandler(connection, KAMIYO_PROGRAM_ID, {
      privateDeposit: true,
      privateSettlement: true,
      timeLockSeconds: 3600,
      qualityThreshold: 80,
    });

    // Generate amount commitment
    const commitment = escrow.generateAmountCommitment(5.0);
    console.log('Amount commitment generated:');
    console.log('  Amount:', commitment.amount, 'SOL');
    console.log('  Commitment:', commitment.commitment.slice(0, 16) + '...');
    console.log('  Blinding (32 bytes):', commitment.blinding.length, 'bytes');
    console.log('');

    // Calculate settlement for different quality scores
    console.log('Settlement calculations:');
    const scores = [95, 70, 55, 30];
    for (const score of scores) {
      const settlement = escrow.calculateSettlement(score, 100);
      console.log(`  Quality ${score}%: Agent ${settlement.agentRefund} / Provider ${settlement.providerPayout}`);
    }
    console.log('');
  } catch (err) {
    console.log('Private escrow demo skipped (requires @radr/shadowwire)');
    console.log('');
  }

  // Demo 4: Full Flow (simulated)
  console.log('--- Demo 4: Full Private Payment Flow ---');
  console.log('1. Agent checks reputation gate');
  console.log('   -> Reputation 75, threshold 50');
  console.log('   -> Access granted (Gold tier)');
  console.log('');
  console.log('2. Agent deposits 5 SOL to shielded pool');
  console.log('   -> Balance hidden from blockchain');
  console.log('');
  console.log('3. Agent creates private escrow');
  console.log('   -> Amount commitment: 0xabc123...');
  console.log('   -> Escrow PDA: 8xYz...');
  console.log('   -> Timelock: 24 hours');
  console.log('');
  console.log('4. Provider delivers service');
  console.log('');
  console.log('5a. Happy path: Agent releases funds');
  console.log('    -> Private transfer via ShadowWire');
  console.log('    -> Provider receives 5 SOL (minus 1% relayer fee)');
  console.log('');
  console.log('5b. Dispute path: Agent files dispute');
  console.log('    -> Oracles evaluate quality');
  console.log('    -> Settlement: Agent 35% / Provider 65%');
  console.log('    -> Private settlement preserves anonymity');
  console.log('');

  console.log('=== Demo Complete ===');
}

main().catch(console.error);
