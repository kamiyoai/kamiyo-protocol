# x402Resolve API Examples

Comprehensive examples for using x402Resolve in production.

## Table of Contents

1. [Agent/Consumer Examples](#agentconsumer-examples)
2. [API Provider Examples](#api-provider-examples)
3. [Dispute Resolution](#dispute-resolution)
4. [Reputation Management](#reputation-management)

## Agent/Consumer Examples

### Basic API Consumption with Escrow

```typescript
import { KamiyoClient } from '@kamiyo/x402-sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your secret key */);
const apiProvider = new PublicKey('API_PROVIDER_PUBKEY');

const client = new KamiyoClient({
  apiUrl: 'https://api.example.com',
  chain: 'solana',
  rpcUrl: 'https://api.devnet.solana.com',
  walletPublicKey: wallet.publicKey,
  enablex402Resolve: true
});

// Step 1: Create escrow and pay
const payment = await client.pay({
  amount: 0.001,
  recipient: apiProvider,
  enableEscrow: true,
  metadata: { purpose: 'data-query' }
});

// Step 2: Use access token to call API
const response = await fetch('https://api.example.com/data', {
  headers: {
    'X-Payment-Proof': payment.escrowAddress,
    'Authorization': `Bearer ${payment.token}`
  }
});

const data = await response.json();

// Step 3: Validate quality
if (data.quality_score < 80) {
  await client.fileDispute({
    transactionId: payment.transactionId,
    reason: 'Low quality response',
    qualityScore: data.quality_score,
    evidence: { expectedFields: 10, receivedFields: data.fieldCount }
  });
}
```

### Autonomous Agent with Quality Checks

```typescript
import { EscrowClient } from '@kamiyo/x402-sdk';
import { Connection, Keypair } from '@solana/web3.js';

class AIAgent {
  private escrowClient: EscrowClient;
  private qualityThreshold: number;

  constructor(wallet: Keypair, qualityThreshold = 85) {
    const connection = new Connection('https://api.devnet.solana.com');
    const programId = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
    
    this.escrowClient = new EscrowClient(connection, wallet, programId);
    this.qualityThreshold = qualityThreshold;
  }

  async consumeAPI(apiUrl: string, params: any) {
    const transactionId = `tx_${Date.now()}`;
    
    // Create escrow
    const escrow = await this.escrowClient.createEscrow({
      api: new PublicKey(params.provider),
      amount: 0.001,
      timeLock: 3600,
      transactionId
    });

    // Call API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'X-Payment-Proof': escrow.toBase58() },
      body: JSON.stringify(params)
    });

    const result = await response.json();

    // Automated quality check
    const qualityScore = this.assessQuality(result, params.expectedSchema);

    if (qualityScore < this.qualityThreshold) {
      // Auto-dispute
      await this.escrowClient.markDisputed(escrow);
      
      // Submit evidence to oracle
      await this.submitDisputeEvidence(transactionId, {
        qualityScore,
        expected: params.expectedSchema,
        received: result
      });

      return { success: false, refundExpected: true, qualityScore };
    }

    // Release funds
    await this.escrowClient.releaseFunds(escrow);
    
    return { success: true, data: result, qualityScore };
  }

  private assessQuality(result: any, schema: any): number {
    let score = 100;
    
    // Schema validation
    for (const field of schema.required) {
      if (!result[field]) score -= 20;
    }
    
    // Data completeness
    const completeness = Object.keys(result).length / schema.requiredFieldCount;
    score = Math.min(score, completeness * 100);
    
    return Math.max(0, score);
  }

  private async submitDisputeEvidence(txId: string, evidence: any) {
    // Submit to oracle for verification
    await fetch('https://oracle.x402resolve.kamiyo.ai/submit-evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: txId, evidence })
    });
  }
}

// Usage
const agent = new AIAgent(wallet, 85);
const result = await agent.consumeAPI('https://api.example.com/query', {
  provider: 'PROVIDER_PUBKEY',
  query: 'market data',
  expectedSchema: {
    required: ['price', 'volume', 'timestamp'],
    requiredFieldCount: 3
  }
});
```

## API Provider Examples

### Express Server with x402 Middleware

```typescript
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { x402PaymentMiddleware, getEscrowInfo } from '@x402resolve/middleware';

const app = express();
const connection = new Connection('https://api.devnet.solana.com');
const programId = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');

// Apply middleware to protected routes
app.use('/api/premium/*', x402PaymentMiddleware({
  realm: 'premium-data',
  programId,
  connection,
  price: 0.001,
  qualityGuarantee: true
}));

// Protected endpoint
app.get('/api/premium/market-data', async (req, res) => {
  const escrow = getEscrowInfo(req);
  
  // Fetch data
  const data = await fetchMarketData();
  
  // Calculate quality score
  const qualityScore = calculateQualityScore(data);
  
  // Return with quality metadata
  res.json({
    data,
    quality_score: qualityScore,
    escrow_address: escrow.pubkey.toString(),
    timestamp: Date.now()
  });
});

app.listen(3000);
```

### Quality Score Calculation

```typescript
function calculateQualityScore(data: any): number {
  let score = 100;
  
  // Completeness (40%)
  const expectedFields = ['price', 'volume', 'timestamp', 'source', 'confidence'];
  const presentFields = expectedFields.filter(f => data[f] !== undefined);
  const completeness = (presentFields.length / expectedFields.length) * 40;
  
  // Freshness (30%)
  const age = Date.now() - data.timestamp;
  const freshness = Math.max(0, 30 - (age / 60000) * 5); // Decay 5pts/min
  
  // Confidence (30%)
  const confidence = (data.confidence || 0) * 30;
  
  return Math.round(completeness + freshness + confidence);
}
```

## Dispute Resolution

### Filing a Dispute

```typescript
import { KamiyoClient } from '@kamiyo/x402-sdk';

const client = new KamiyoClient({
  apiUrl: 'https://api.example.com',
  chain: 'solana',
  verifierUrl: 'https://oracle.x402resolve.kamiyo.ai'
});

// File dispute with detailed evidence
await client.fileDispute({
  transactionId: 'tx_123',
  reason: 'Incomplete data',
  qualityScore: 45,
  evidence: {
    expectedFields: ['price', 'volume', 'timestamp', 'source'],
    receivedFields: ['price', 'timestamp'],
    missingData: ['volume', 'source'],
    dataAge: 3600000, // 1 hour old
    schemaViolations: ['missing required field: volume']
  }
});
```

### Monitoring Dispute Status

```typescript
// Poll for dispute resolution
const checkStatus = async (txId: string) => {
  const status = await client.getDisputeStatus(txId);
  
  console.log(`Status: ${status.status}`);
  console.log(`Refund: ${status.refundPercentage}%`);
  
  if (status.status === 'Resolved') {
    console.log(`Received ${status.refundAmount} SOL refund`);
  }
};

setInterval(() => checkStatus('tx_123'), 5000);
```

## Reputation Management

### Checking Reputation Before Transaction

```typescript
import { Hyoban } from '@kamiyo/x402-sdk';

const hyoban = new Hyoban(connection, program, programId);

// Check API provider reputation
const providerRep = await hyoban.getReputation(providerPubkey);

if (providerRep) {
  const successRate = hyoban.getDisputeSuccessRate(providerRep);
  
  console.log(`Provider Stats:`);
  console.log(`- Total Transactions: ${providerRep.totalTransactions}`);
  console.log(`- Reputation Score: ${providerRep.reputationScore}/1000`);
  console.log(`- Dispute Success Rate: ${successRate}%`);
  console.log(`- Avg Quality: ${providerRep.averageQualityReceived}`);
  
  if (providerRep.reputationScore < 500) {
    console.warn('Low reputation provider!');
  }
}

// Check rate limits
const canTransact = await hyoban.canPerformAction(agentPubkey);
if (!canTransact) {
  console.error('Rate limit exceeded');
}
```

### Calculating Dispute Costs

```typescript
const agentRep = await hyoban.getReputation(agentPubkey);
const disputeCost = hyoban.calculateDisputeCost(agentRep);

console.log(`Dispute will cost: ${disputeCost} SOL`);
// Higher dispute rate = higher cost (0.001 to 0.01 SOL)
```

## Complete End-to-End Example

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { KamiyoClient, EscrowClient, Hyoban } from '@kamiyo/x402-sdk';

async function completeWorkflow() {
  // Setup
  const connection = new Connection('https://api.devnet.solana.com');
  const agent = Keypair.fromSecretKey(/* ... */);
  const programId = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
  
  const client = new KamiyoClient({
    apiUrl: 'https://api.example.com',
    chain: 'solana',
    walletPublicKey: agent.publicKey,
    enablex402Resolve: true
  });

  // 1. Check reputation
  const hyoban = new Hyoban(connection, program, programId);
  const providerRep = await hyoban.getReputation(apiProviderPubkey);
  
  if (!providerRep || providerRep.reputationScore < 500) {
    throw new Error('Provider reputation too low');
  }

  // 2. Create escrow and pay
  const payment = await client.pay({
    amount: 0.001,
    recipient: apiProviderPubkey,
    enableEscrow: true
  });

  // 3. Call API
  const response = await fetch('https://api.example.com/data', {
    headers: { 'X-Payment-Proof': payment.escrowAddress }
  });
  
  const result = await response.json();

  // 4. Quality check
  if (result.quality_score < 80) {
    // File dispute
    await client.fileDispute({
      transactionId: payment.transactionId,
      reason: 'Low quality',
      qualityScore: result.quality_score,
      evidence: result
    });

    // Wait for resolution
    let resolved = false;
    while (!resolved) {
      await new Promise(r => setTimeout(r, 10000));
      const status = await client.getDisputeStatus(payment.transactionId);
      resolved = status.status === 'Resolved';
      
      if (resolved) {
        console.log(`Refund: ${status.refundPercentage}%`);
      }
    }
  } else {
    // Release funds (quality OK)
    console.log('Quality acceptable, funds released');
  }
}
```

## License

MIT | KAMIYO
