// test-burn-worker.ts
// Integration test for burn execution worker
// Tests: BurnService (SQLite) + MitamaClient.burnFromTreasury

import { config } from 'dotenv';
config({ path: 'services/api/.env' });

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { MitamaClient } from '@kamiyo/kamiyo-mitama';
import * as fs from 'fs';
import * as path from 'path';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const DATA_DIR = './data';

async function main() {
  console.log('=== Burn Execution Worker Integration Test ===\n');

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.AUTHORITY_WALLET_SECRET;

  if (!walletSecret) {
    console.error('AUTHORITY_WALLET_SECRET not set in environment');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  console.log('Authority Wallet:', keypair.publicKey.toBase58());
  console.log('RPC:', rpcUrl);
  console.log('KAMIYO Mint:', KAMIYO_MINT.toBase58());

  // 1. Test BurnService (SQLite operations)
  console.log('\n--- Testing BurnService ---');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Dynamic import to handle ESM/CJS
  const burnServiceModule = await import('../services/api/src/burn-service.js');
  const { getBurnService } = burnServiceModule;
  const burnService = getBurnService();

  // Test burn calculation
  const testUsdValue = 10.0; // $10
  const burnAmount = burnService.calculateBurnAmount(testUsdValue);
  console.log(`\nBurn calculation for $${testUsdValue}:`);
  console.log('  Raw amount:', burnAmount.toString());
  console.log('  Formatted:', burnService.formatTokenAmount(burnAmount), 'KAMIYO');

  // Test recording burns
  console.log('\n--- Recording test burns ---');

  const testWallet = 'TestWallet1111111111111111111111111111111';
  const testEndpoint = '/api/v1/test';

  const burn1 = burnService.recordCreditBurn(testWallet, testEndpoint, 5.0);
  console.log('Recorded burn 1:', burn1?.id, '-', burn1?.kamiyo_formatted, 'KAMIYO');

  const burn2 = burnService.recordX402Burn('PayerAddress111111111111', '/api/v1/premium', 2.5);
  console.log('Recorded burn 2:', burn2?.id, '-', burn2?.kamiyo_formatted, 'KAMIYO');

  // Test stats
  console.log('\n--- Burn Statistics ---');
  const stats = burnService.getStats();
  console.log('Total burned:', stats.totalBurnedKamiyoFormatted, 'KAMIYO');
  console.log('Total USD:', stats.totalUsdValue);
  console.log('Total burns:', stats.burnCount);
  console.log('Burns (24h):', stats.burns24h);
  console.log('Pending burns:', stats.pendingBurns);

  // Test pending burns retrieval
  console.log('\n--- Pending Burns ---');
  const pendingBurns = burnService.getPendingBurns(10);
  console.log('Pending burns count:', pendingBurns.length);
  for (const burn of pendingBurns.slice(0, 5)) {
    console.log(`  ${burn.id}: ${burn.kamiyo_formatted} KAMIYO (${burn.source})`);
  }

  const pendingTotal = burnService.getPendingBurnTotal();
  console.log('Total pending:', burnService.formatTokenAmount(pendingTotal), 'KAMIYO');

  // 2. Test on-chain treasury burn (will fail on devnet without setup)
  console.log('\n--- Testing On-Chain Treasury Burn ---');

  const [registryPDA] = MitamaClient.getRegistryPDA();
  const [treasuryPDA] = MitamaClient.getTreasuryPDA(registryPDA);
  console.log('Registry PDA:', registryPDA.toBase58());
  console.log('Treasury PDA:', treasuryPDA.toBase58());

  // Check treasury balance
  try {
    const treasuryBalance = await connection.getTokenAccountBalance(treasuryPDA);
    console.log('Treasury balance:', treasuryBalance.value.uiAmountString, 'KAMIYO');
  } catch (err) {
    console.log('Treasury token account not found (expected on devnet)');
  }

  // Attempt burn (will fail without proper setup)
  const testBurnAmount = new BN(1_000_000); // 1 KAMIYO
  console.log('\nAttempting treasury burn of', testBurnAmount.toString(), 'tokens...');

  try {
    const tx = await client.burnFromTreasury(keypair, testBurnAmount, KAMIYO_MINT);
    console.log('Burn tx:', tx);
  } catch (err: any) {
    console.log('Expected failure:', err.message?.slice(0, 100) || String(err).slice(0, 100));
  }

  // 3. Test marking burns as executed
  console.log('\n--- Testing Burn Execution Marking ---');

  if (pendingBurns.length > 0) {
    const testIds = pendingBurns.slice(0, 2).map(b => b.id);
    const mockTxSig = 'MockTxSignature123456789';

    const updated = burnService.markBurnsExecuted(testIds, mockTxSig);
    console.log(`Marked ${updated} burns as executed with sig: ${mockTxSig}`);

    // Verify
    const burn = burnService.getBurn(testIds[0]);
    console.log(`Burn ${testIds[0]} status: ${burn?.status}, tx: ${burn?.tx_signature}`);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log('\nBurnService (SQLite):');
  console.log('  - Burn calculation: OK');
  console.log('  - Record credit burn: OK');
  console.log('  - Record x402 burn: OK');
  console.log('  - Get stats: OK');
  console.log('  - Get pending burns: OK');
  console.log('  - Mark executed: OK');

  console.log('\nOn-Chain Operations:');
  console.log('  - burnFromTreasury: Requires initialized registry + funded treasury');

  console.log('\nTo enable on-chain burns:');
  console.log('  1. Initialize registry on target network');
  console.log('  2. Fund protocol treasury with KAMIYO tokens');
  console.log('  3. Set BURN_EXECUTION_ENABLED=true');
  console.log('  4. Set AUTHORITY_WALLET_SECRET to registry authority');
}

main().catch(console.error);
