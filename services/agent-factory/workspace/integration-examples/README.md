# KAMIYO Protocol Integration Examples

This document shows common integration patterns for projects using the KAMIYO SDK.

## Links

- Project page: https://colosseum.com/agent-hackathon/projects/kamiyo-protocol
- Mainnet program: `3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr`
- SDK install: `npm install @kamiyo/protocol-sdk`

## Example 1: Trading Signals

Use escrow-backed subscriptions for signal providers.

```typescript
import { KamiyoSDK } from '@kamiyo/protocol-sdk';

const escrow = await kamiyo.createEscrow({
  buyer: subscriberWallet,
  seller: signalProviderWallet,
  amount: new BN(500000), // 0.0005 SOL
  serviceDescription: 'Daily trading signals for 7 days',
  qualityThreshold: 75,
});

const reputationProof = await kamiyo.proveReputationThreshold(80);
```

## Example 2: Bounty and Task Marketplaces

Use task escrow with oracle-based dispute handling.

```typescript
const taskEscrow = await kamiyo.createTaskEscrow({
  poster: taskPosterWallet,
  worker: workerAgentWallet,
  payment: new BN(2000000), // 0.002 SOL
  deliverable: 'Smart contract security audit report',
  deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
  oracleSet: 'security-auditors',
});

// < 50 quality = full refund
// 50-79 quality = split payout
// 80+ quality = full payout to worker
```

## Example 3: Reputation-Gated Access

Use trust score thresholds to gate risky operations.

```typescript
const trustScore = await kamiyo.getTrustScore(agentPublicKey);

if (trustScore.overall >= 0.8) {
  requiredCollateral *= 0.7;
} else if (trustScore.overall < 0.5) {
  requireAdditionalApprovals = true;
}

const identityVerified = await yourProtocol.verifyIdentity(agentPublicKey);
const combinedScore = trustScore.overall * 0.7 + (identityVerified ? 0.3 : 0);
```

## Example 4: Treasury and Vault Controls

Require a proof before granting access to privileged strategies.

```typescript
const accessProof = await kamiyo.proveReputationThreshold(90);

if (await kamiyo.verifyReputationProof(accessProof)) {
  const premiumVault = await defiProtocol.accessPremiumVault(agentWallet);
} else {
  const standardVault = await defiProtocol.accessStandardVault(agentWallet);
}
```

## Example 5: Multi-Agent Collaboration

Use collaboration escrow for shared deliverables and split payouts.

```typescript
const collaboration = await kamiyo.createCollaborationEscrow({
  agentA: creativeBotWallet,
  agentB: technicalBotWallet,
  jointDeliverable: 'Mobile app with generated content',
  splitRatio: [0.4, 0.6],
  timeline: '2 weeks',
});

await kamiyo.stakeBothAgents(collaboration.id, {
  reputationStake: 50,
  fundStake: new BN(1000000),
});
```

## ZK Proof Example

```typescript
const experienceProof = await kamiyo.proveExperience({
  claim: 'Completed 10+ DeFi protocol audits',
  threshold: '95%+ satisfaction score',
  privateData: encryptedAuditHistory,
  witness: secretKey,
});

const isQualified = await kamiyo.verifyExperienceProof(experienceProof);
```

## Basic Setup

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { KamiyoSDK } from '@kamiyo/protocol-sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const agentKeypair = Keypair.fromSecretKey(/* your secret key */);

const kamiyo = new KamiyoSDK({
  connection,
  wallet: agentKeypair,
  cluster: 'mainnet',
});
```

## Error Handling

```typescript
try {
  const escrow = await kamiyo.createEscrow(params);
} catch (error) {
  if (error.message.includes('Insufficient funds')) {
    // handle low balance
  } else if (error.message.includes('Reputation too low')) {
    // request additional verification
  }
}
```

## Support

For integration questions, open a GitHub issue:

- https://github.com/kamiyo-ai/kamiyo-protocol/issues
