const API = process.env.TITS_API || 'http://localhost:3001';

async function post(endpoint: string, body?: object, headers?: Record<string, string>) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function log(label: string, data: unknown) {
  console.log(`\n[${label}]`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function main() {
  console.log('=== KAMIYO x TETSUO Demo ===\n');

  // 1. Standard inference without escrow
  console.log('--- 1. Standard Inference (no escrow) ---');
  const basic = await post('/v1/inference', { prompt: 'What is the meaning of life?' });
  log('Response', basic);

  // 2. Create escrow and call inference
  console.log('\n--- 2. Escrowed Inference ---');

  const escrow = await post('/demo/escrow', { amount: 0.05, threshold: 75 });
  log('Escrow Created', escrow);

  const escrowed = await post(
    '/v1/inference',
    { prompt: 'Explain quantum computing' },
    { 'X-Kamiyo-Escrow': escrow.escrowId }
  );
  log('Response', escrowed);
  log('Settlement', `Quality ${escrowed.quality}: Provider gets ${escrowed.settlement.providerPayment.toFixed(4)} SOL`);

  // 3. Premium inference with reputation proof
  console.log('\n--- 3. Premium Inference (ZK reputation proof) ---');

  // Try without proof
  const denied = await post('/v1/inference/pro', { prompt: 'Premium query' });
  log('Without Proof', denied);

  // Generate proof and retry
  const repProof = await post('/demo/reputation-proof', { score: 92, threshold: 80 });
  log('Proof Generated', { threshold: 80, proving: 'score >= 80 (actual: 92, hidden)' });

  const premium = await post(
    '/v1/inference/pro',
    { prompt: 'Premium query with proof' },
    { 'X-Kamiyo-Rep-Proof': repProof.proof }
  );
  log('With Proof', premium);

  // 4. Low quality scenario
  console.log('\n--- 4. Low Quality Refund ---');

  const escrow2 = await post('/demo/escrow', { amount: 0.1, threshold: 95 });
  log('Escrow Created', { ...escrow2, note: 'High threshold (95) likely triggers refund' });

  const lowQuality = await post(
    '/v1/inference',
    { prompt: 'Test low quality scenario' },
    { 'X-Kamiyo-Escrow': escrow2.escrowId }
  );
  log('Response', lowQuality);

  if (lowQuality.quality < escrow2.threshold) {
    log('Partial Refund', `Score ${lowQuality.quality} < threshold ${escrow2.threshold}`);
    log('User Refund', `${lowQuality.settlement.userRefund.toFixed(4)} SOL`);
  }

  console.log('\n=== Demo Complete ===');
}

main().catch(console.error);
