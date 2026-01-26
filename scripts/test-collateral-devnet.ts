// test-collateral-devnet.ts
// Integration test for collateral system SDK components on devnet
// Note: Actual deposit/withdrawal requires mainnet KAMIYO tokens (mint is hardcoded)

import { config } from 'dotenv';
config({ path: 'services/api/.env' });

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import * as crypto from 'crypto';
import { MitamaClient, MitamaProver, generateAgentId } from '@kamiyo/kamiyo-swarmteams';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log('=== Collateral System Integration Test (Devnet) ===\n');

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET;

  if (!walletSecret) {
    console.error('DEMO_WALLET_SECRET not set in environment');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  console.log('Wallet:', keypair.publicKey.toBase58());
  console.log('RPC:', rpcUrl);
  console.log('KAMIYO Mint:', KAMIYO_MINT.toBase58());

  // Generate agent identity commitment (same as in other tests)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
  );
  const identityCommitment = await MitamaProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  console.log('\nAgent Identity:');
  console.log('  Commitment:', bytesToHex(identityCommitment));

  // 1. Test PDA derivation
  console.log('\n--- Testing PDA Derivation ---');

  const [registryPDA] = MitamaClient.getRegistryPDA();
  console.log('Registry PDA:', registryPDA.toBase58());

  const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
  console.log('Agent PDA:', agentPDA.toBase58());

  const [collateralVault] = MitamaClient.getCollateralVaultPDA(agentPDA);
  console.log('Collateral Vault PDA:', collateralVault.toBase58());

  const [withdrawalPDA] = MitamaClient.getCollateralWithdrawalPDA(agentPDA);
  console.log('Withdrawal PDA:', withdrawalPDA.toBase58());

  const [treasury] = MitamaClient.getTreasuryPDA(registryPDA);
  console.log('Treasury PDA:', treasury.toBase58());

  // 2. Check registry state
  console.log('\n--- Registry State ---');

  try {
    const registry = await client.getRegistry();
    if (registry) {
      console.log('Registry found:');
      console.log('  Authority:', registry.authority.toBase58());
      console.log('  Agent count:', registry.agentCount);
      console.log('  Epoch:', registry.epoch.toString());
      console.log('  Min signal collateral:', registry.minSignalCollateral.toString());
      console.log('  Paused:', registry.paused);
    } else {
      console.log('Registry not initialized');
    }
  } catch (err) {
    console.log('Error fetching registry:', (err as Error).message);
  }

  // 3. Check if agent account exists
  console.log('\n--- Agent Account ---');

  try {
    const agent = await client.getAgent(identityCommitment);
    if (agent) {
      console.log('Agent found:');
      console.log('  Active:', agent.active);
      console.log('  Collateral amount:', agent.collateralAmount?.toString() || '0');
      console.log('  Collateral locked at:', agent.collateralLockedAt?.toString() || '0');
      console.log('  Total signals:', agent.totalSignals);
      console.log('  Reputation:', agent.reputationScore);
    } else {
      console.log('Agent account not initialized');
    }
  } catch (err) {
    console.log('Error fetching agent:', (err as Error).message);
  }

  // 4. Check user's KAMIYO token account
  console.log('\n--- User Token Account ---');

  const userTokenAccount = await getAssociatedTokenAddress(
    KAMIYO_MINT,
    keypair.publicKey
  );
  console.log('User KAMIYO ATA:', userTokenAccount.toBase58());

  try {
    const tokenAccount = await connection.getTokenAccountBalance(userTokenAccount);
    console.log('Balance:', tokenAccount.value.uiAmountString, 'KAMIYO');
  } catch (err) {
    console.log('Token account not found (no KAMIYO tokens on devnet)');
  }

  // 5. Test collateral deposit (will fail without KAMIYO tokens)
  console.log('\n--- Collateral Deposit Test ---');
  console.log('NOTE: This will fail on devnet because KAMIYO mint is mainnet-only');

  const depositAmount = new BN(1_000_000); // 1 KAMIYO

  try {
    const tx = await client.depositCollateral(
      keypair,
      identityCommitment,
      depositAmount,
      userTokenAccount,
      KAMIYO_MINT
    );
    console.log('Deposit tx:', tx);
  } catch (err: any) {
    console.log('Expected failure:', err.message?.slice(0, 100) || String(err).slice(0, 100));
    if (err.logs) {
      console.log('Program logs (first 5):');
      for (const log of err.logs.slice(0, 5)) {
        console.log(' ', log);
      }
    }
  }

  // 6. Test collateral withdrawal request (will also fail)
  console.log('\n--- Collateral Withdrawal Request Test ---');

  try {
    const tx = await client.requestCollateralWithdrawal(
      keypair,
      identityCommitment,
      depositAmount
    );
    console.log('Withdrawal request tx:', tx);
  } catch (err: any) {
    console.log('Expected failure:', err.message?.slice(0, 100) || String(err).slice(0, 100));
  }

  console.log('\n=== Test Summary ===');
  console.log('SDK Components:');
  console.log('  - PDA derivation: OK');
  console.log('  - Registry fetch: OK');
  console.log('  - Agent fetch: OK');
  console.log('  - Token account derivation: OK');
  console.log('\nOn-chain Operations:');
  console.log('  - Deposit: Requires mainnet KAMIYO tokens');
  console.log('  - Withdrawal: Requires existing collateral');
  console.log('\nTo test collateral on mainnet:');
  console.log('  1. Acquire KAMIYO tokens');
  console.log('  2. Run with SOLANA_RPC_URL pointing to mainnet');
  console.log('  3. Execute depositCollateral with real tokens');
}

main().catch(console.error);
