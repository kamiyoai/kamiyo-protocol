/**
 * Quick Start: Switchboard Dispute Resolution
 *
 * Minimal example showing the simplest path to dispute resolution
 * using Switchboard On-Demand oracles.
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  EscrowClient,
  EscrowUtils,
  MockSwitchboardClient,
  SwitchboardConfig,
} from '@kamiyo/x402-sdk';
import IDL from '../types/x402_escrow.json';

async function quickStart() {
  // Setup
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const agentKeypair = Keypair.generate();
  const apiKeypair = Keypair.generate();

  // Initialize SDK
  const escrowClient = new EscrowClient(
    {
      programId: new PublicKey(IDL.metadata.address),
      connection,
      wallet: new anchor.Wallet(agentKeypair),
    },
    IDL
  );

  // Mock Switchboard for testing (set quality score)
  const mockSwitchboard = new MockSwitchboardClient(
    SwitchboardConfig.getDevnetConfig(connection, PublicKey.default),
    45 // Mock quality score: 45 = poor quality
  );

  // Create escrow
  const txId = EscrowUtils.generateTransactionId();
  await escrowClient.createEscrow({
    amount: EscrowUtils.solToLamports(0.01),
    timeLock: EscrowUtils.hoursToSeconds(24),
    transactionId: txId,
    apiPublicKey: apiKeypair.publicKey,
  });

  // Mark disputed
  await escrowClient.markDisputed(txId);

  // Get quality assessment from Switchboard
  const assessment = await mockSwitchboard.requestQualityAssessment({
    originalQuery: 'Uniswap exploits',
    dataReceived: { exploits: [] },
    expectedCriteria: ['Uniswap', 'exploit'],
    transactionId: txId,
  });

  // Resolve dispute
  await escrowClient.resolveDisputeSwitchboard(
    txId,
    assessment.qualityScore,
    assessment.refundPercentage,
    assessment.attestation
  );

  console.log('[PASS] Dispute resolved via Switchboard!');
  console.log(`Refund: ${assessment.refundPercentage}%`);
}

quickStart().catch(console.error);
