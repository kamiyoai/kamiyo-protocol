import express from 'express';

const app = express();
app.use(express.json());

// Mock escrow store (in production, this verifies on-chain)
const escrows = new Map<string, {
  amount: number;
  threshold: number;
  status: 'pending' | 'settled' | 'refunded';
}>();

// Mock reputation store
const reputations = new Map<string, number>();

// === KAMIYO Integration Points ===

// 1. Verify escrow exists and is valid
function verifyEscrow(escrowId: string): { valid: boolean; amount?: number; threshold?: number; error?: string } {
  const escrow = escrows.get(escrowId);
  if (!escrow) return { valid: false, error: 'Escrow not found' };
  if (escrow.status !== 'pending') return { valid: false, error: 'Escrow not pending' };
  return { valid: true, amount: escrow.amount, threshold: escrow.threshold };
}

// 2. Report quality and settle
function reportQuality(escrowId: string, score: number): { userRefund: number; providerPayment: number } {
  const escrow = escrows.get(escrowId);
  if (!escrow) throw new Error('Escrow not found');

  const { amount, threshold } = escrow;
  let userRefund: number;
  let providerPayment: number;

  if (score >= threshold) {
    userRefund = 0;
    providerPayment = amount;
  } else if (score < 50) {
    userRefund = amount;
    providerPayment = 0;
  } else {
    providerPayment = (amount * score) / threshold;
    userRefund = amount - providerPayment;
  }

  escrow.status = 'settled';
  return { userRefund, providerPayment };
}

// 3. Verify reputation proof (ZK - proves score >= minThreshold without revealing actual score)
function verifyReputationProof(proof: string, minThreshold: number): boolean {
  // In production: snarkjs.groth16.verify()
  // Demo: decode and check claimed threshold
  try {
    const decoded = JSON.parse(Buffer.from(proof, 'base64').toString());
    return decoded.threshold >= minThreshold;
  } catch {
    return false;
  }
}

// === Mock TITS Endpoints ===

// Standard inference
app.post('/v1/inference', async (req, res) => {
  const escrowId = req.headers['x-kamiyo-escrow'] as string;

  if (escrowId) {
    const escrow = verifyEscrow(escrowId);
    if (!escrow.valid) {
      return res.status(402).json({ error: escrow.error });
    }
    console.log(`[ESCROW] Verified: ${escrowId} (${escrow.amount} SOL, threshold: ${escrow.threshold})`);
  }

  // Simulate inference
  const prompt = req.body.prompt || '';
  const response = `Response to: "${prompt.slice(0, 50)}..."`;
  const qualityScore = 70 + Math.floor(Math.random() * 30); // 70-99

  if (escrowId) {
    const settlement = reportQuality(escrowId, qualityScore);
    console.log(`[SETTLE] Score: ${qualityScore}, Provider: ${settlement.providerPayment.toFixed(4)} SOL, Refund: ${settlement.userRefund.toFixed(4)} SOL`);

    return res.json({
      response,
      quality: qualityScore,
      settlement: {
        providerPayment: settlement.providerPayment,
        userRefund: settlement.userRefund,
      },
    });
  }

  res.json({ response, quality: qualityScore });
});

// Premium inference (requires reputation proof)
app.post('/v1/inference/pro', async (req, res) => {
  const repProof = req.headers['x-kamiyo-rep-proof'] as string;

  if (!repProof) {
    return res.status(403).json({ error: 'Reputation proof required' });
  }

  const verified = verifyReputationProof(repProof, 80);
  if (!verified) {
    return res.status(403).json({ error: 'Insufficient reputation (need >= 80)' });
  }

  console.log('[PRO] Reputation proof verified');

  const prompt = req.body.prompt || '';
  const response = `[PRO] Premium response to: "${prompt.slice(0, 50)}..."`;

  res.json({ response, tier: 'pro' });
});

// === Demo Helpers ===

// Create mock escrow (simulates on-chain tx)
app.post('/demo/escrow', (req, res) => {
  const { amount, threshold } = req.body;
  const escrowId = `escrow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  escrows.set(escrowId, {
    amount: amount || 0.01,
    threshold: threshold || 70,
    status: 'pending',
  });

  console.log(`[DEMO] Created escrow: ${escrowId}`);
  res.json({ escrowId, amount, threshold });
});

// Create mock reputation proof
app.post('/demo/reputation-proof', (req, res) => {
  const { score, threshold } = req.body;

  if (score < threshold) {
    return res.status(400).json({ error: `Score ${score} below threshold ${threshold}` });
  }

  // In production: actual Groth16 proof
  const proof = Buffer.from(JSON.stringify({
    threshold,
    commitment: '0x' + Math.random().toString(16).slice(2),
  })).toString('base64');

  console.log(`[DEMO] Created reputation proof: score=${score}, threshold=${threshold}`);
  res.json({ proof });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mock TITS API running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  POST /v1/inference        - Standard inference (optional: X-Kamiyo-Escrow header)');
  console.log('  POST /v1/inference/pro    - Premium inference (requires: X-Kamiyo-Rep-Proof header)');
  console.log('');
  console.log('Demo helpers:');
  console.log('  POST /demo/escrow         - Create mock escrow');
  console.log('  POST /demo/reputation-proof - Create mock reputation proof');
});
