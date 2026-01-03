/**
 * Mitama Switchboard Oracle Function
 *
 * Evaluates service quality for disputed escrows and submits scores.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

const MITAMA_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Quality assessment criteria
 */
const QUALITY_WEIGHTS = {
  responseTime: 0.2,      // API responded within expected time
  dataCompleteness: 0.3,  // All expected fields present
  dataAccuracy: 0.3,      // Data matches expected schema/values
  availability: 0.2,      // Service was available when called
};

/**
 * Evaluate service quality based on escrow metadata
 */
function evaluateQuality(escrowData, serviceResponse) {
  let score = 0;

  // Response time (0-100)
  if (serviceResponse.responseTimeMs) {
    const expectedMs = escrowData.expectedResponseMs || 5000;
    const timeScore = Math.max(0, 100 - (serviceResponse.responseTimeMs / expectedMs) * 50);
    score += timeScore * QUALITY_WEIGHTS.responseTime;
  }

  // Data completeness (0-100)
  if (serviceResponse.expectedFields && serviceResponse.receivedFields) {
    const completeness = (serviceResponse.receivedFields / serviceResponse.expectedFields) * 100;
    score += completeness * QUALITY_WEIGHTS.dataCompleteness;
  }

  // Data accuracy (0-100) - based on schema validation
  if (serviceResponse.schemaValid !== undefined) {
    score += (serviceResponse.schemaValid ? 100 : 0) * QUALITY_WEIGHTS.dataAccuracy;
  }

  // Availability (0-100)
  if (serviceResponse.available !== undefined) {
    score += (serviceResponse.available ? 100 : 0) * QUALITY_WEIGHTS.availability;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate refund percentage based on quality score
 */
function calculateRefund(qualityScore) {
  if (qualityScore >= 80) return 0;
  if (qualityScore >= 65) return 35;
  if (qualityScore >= 50) return 75;
  return 100;
}

/**
 * Main oracle function - called by Switchboard
 */
async function main() {
  console.log('Mitama Oracle Function started');

  // Get function params from Switchboard
  const params = JSON.parse(process.env.FUNCTION_PARAMS || '{}');
  const { escrowPubkey, serviceResponse } = params;

  if (!escrowPubkey) {
    console.error('Missing escrowPubkey in params');
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, 'confirmed');

  // Fetch escrow data
  const escrowAccount = await connection.getAccountInfo(new PublicKey(escrowPubkey));
  if (!escrowAccount) {
    console.error('Escrow not found');
    process.exit(1);
  }

  // Parse escrow (skip 8-byte discriminator)
  const escrowData = parseEscrowData(escrowAccount.data);

  // Verify escrow is in disputed state
  if (escrowData.status !== 'disputed') {
    console.error('Escrow not in disputed state');
    process.exit(1);
  }

  // Evaluate quality
  const qualityScore = evaluateQuality(escrowData, serviceResponse || {});
  const refundPercentage = calculateRefund(qualityScore);

  console.log(`Quality Score: ${qualityScore}`);
  console.log(`Refund Percentage: ${refundPercentage}`);

  // Build submit_oracle_score instruction
  const oracleRegistryPDA = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    MITAMA_PROGRAM_ID
  )[0];

  // Return result to Switchboard for on-chain submission
  const result = {
    escrow: escrowPubkey,
    qualityScore,
    refundPercentage,
    timestamp: Math.floor(Date.now() / 1000),
  };

  // Write result for Switchboard to pick up
  console.log('ORACLE_RESULT:', JSON.stringify(result));

  process.exit(0);
}

/**
 * Parse escrow account data
 */
function parseEscrowData(data) {
  // Skip 8-byte discriminator
  const offset = 8;

  return {
    agent: new PublicKey(data.slice(offset, offset + 32)),
    api: new PublicKey(data.slice(offset + 32, offset + 64)),
    amount: data.readBigUInt64LE(offset + 64),
    status: parseStatus(data[offset + 72]),
    transactionId: data.slice(offset + 73, offset + 137).toString('utf8').replace(/\0/g, ''),
  };
}

function parseStatus(statusByte) {
  const statuses = ['active', 'released', 'disputed', 'resolved', 'expired'];
  return statuses[statusByte] || 'unknown';
}

main().catch(err => {
  console.error('Oracle error:', err);
  process.exit(1);
});
