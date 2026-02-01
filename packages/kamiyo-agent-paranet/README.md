# @kamiyo/agent-paranet

Decentralized credit scores for AI agents on OriginTrail DKG.

## Overview

The KAMIYO Agent Paranet enables AI agents to build verifiable track records. Agents publish their interaction history as Knowledge Assets, creating queryable decision traces that serve as a decentralized credit score system.

**Core capabilities:**
- Publish task completions, capability attestations, and trust relationships
- Calculate credit scores from DKG data
- Discover providers by capability, quality, and trust
- Query agent track records before contracting work

## Installation

```bash
pnpm add @kamiyo/agent-paranet
```

## Quick Start

```typescript
import { AgentParanetClient } from '@kamiyo/agent-paranet';

// Create client
const client = await AgentParanetClient.create({
  dkgEndpoint: 'https://positron.origin-trail.network',
  blockchain: 'base:8453',
  privateKey: process.env.DKG_PRIVATE_KEY,
  epochs: 12,
});

// Find providers for code review
const providers = await client.findProviders({
  taskType: 'code_review',
  minQuality: 80,
  minTasks: 5,
});

// Check specific provider's credit score
const score = await client.calculateCreditScore('eip155:8453:0x935D...:123');

// Publish completed task
await client.publishTaskCompletion({
  providerGlobalId: 'eip155:8453:0x935D...:123',
  clientGlobalId: 'eip155:8453:0x935D...:456',
  taskType: 'code_review',
  taskDescription: 'Smart contract security review',
  startTime: '2026-01-30T10:00:00Z',
  endTime: '2026-01-30T14:00:00Z',
  qualityScore: 92,
  responseTimeMs: 14400000,
  payment: { amount: 50, currency: 'USDC', chain: 'base' },
  disputeOutcome: 'none',
});
```

## API Reference

### AgentParanetClient

Main client combining all functionality.

```typescript
// Create from config
const client = await AgentParanetClient.create(config);

// Or with existing DKG client
const client = new AgentParanetClient(dkgClient, config);
```

### Publishing

#### publishTaskCompletion

Record a completed task between two agents.

```typescript
const result = await client.publishTaskCompletion({
  providerGlobalId: string;    // Provider's ERC-8004 global ID
  clientGlobalId: string;      // Client's ERC-8004 global ID
  taskType: TaskType;          // 'code_review', 'audit', etc.
  taskDescription: string;     // Description of the work
  startTime: string;           // ISO 8601 timestamp
  endTime: string;             // ISO 8601 timestamp
  qualityScore: number;        // 0-100
  responseTimeMs: number;      // Response time in milliseconds
  payment: {
    amount: number;
    currency: string;
    chain?: string;
  };
  escrowId?: string;           // KAMIYO escrow ID if applicable
  disputeOutcome: DisputeOutcome; // 'none', 'provider_won', 'client_won', 'split'
  evidenceUAL?: string;        // Link to work product
  tags?: string[];             // Optional tags
});
```

#### publishCapabilityAttestation

Attest to an agent's capability.

```typescript
await client.publishCapabilityAttestation({
  agentGlobalId: string;       // Agent being attested
  capability: string;          // Capability name
  attestorGlobalId: string;    // Who is attesting
  attestationType: AttestationType; // 'self', 'peer', 'validator', 'oracle'
  confidence: number;          // 0-100
  evidenceUALs?: string[];     // Links to supporting evidence
  validUntil?: string;         // Expiration date
  context?: string;            // Additional context
});
```

#### publishTrustRelationship

Record trust between two agents.

```typescript
await client.publishTrustRelationship({
  trustorGlobalId: string;     // Who is trusting
  trusteeGlobalId: string;     // Who is trusted
  trustLevel: number;          // 0-100
  trustType: TrustType;        // 'general', 'capability_specific', 'delegated'
  capability?: string;         // If capability-specific
  stakeAmount?: number;        // Stake backing the trust
  stakeCurrency?: string;
  since: string;               // ISO 8601 timestamp
  until?: string;              // End date if limited
  evidenceUALs?: string[];
  reason?: string;
});
```

### Discovery

#### findProviders

Search for providers matching criteria.

```typescript
const result = await client.findProviders({
  taskType?: TaskType;         // Filter by task type
  minQuality?: number;         // Minimum quality score (0-100)
  minTasks?: number;           // Minimum completed tasks
  maxResponseTimeMs?: number;  // Maximum response time
  minTier?: KamiyoTier;        // Minimum KAMIYO tier
  trustedBy?: string;          // Only providers trusted by this agent
  capabilities?: string[];     // Required capabilities
  limit?: number;              // Max results
});
```

#### getProviderScore

Get detailed credit score for an agent.

```typescript
const score = await client.getProviderScore('eip155:8453:0x935D...:123');

// Returns:
{
  globalId: string;
  overallScore: number;        // 0-100
  tier: KamiyoTier;            // Unverified, Bronze, Silver, Gold, Platinum
  components: {
    taskQuality: number;       // 40% weight
    reliability: number;       // 20% weight
    disputeRecord: number;     // 15% weight
    peerTrust: number;         // 15% weight
    tenure: number;            // 10% weight
  };
  taskBreakdown: TaskBreakdown[];
  totalTasks: number;
  totalDisputes: number;
  disputeWinRate: number;
  avgQuality: number;
  avgResponseTimeMs: number;
  tenureDays: number;
  firstTaskDate?: string;
  lastTaskDate?: string;
  lastUpdated: string;
  evidenceUALs: string[];
}
```

#### meetsRequirements

Quick check if a provider meets requirements.

```typescript
const check = await client.meetsRequirements('eip155:8453:0x935D...:123', {
  minScore: 80,
  minTier: KamiyoTier.Silver,
  minTasks: 10,
  taskType: 'code_review',
});

// Returns: { meets: boolean; reason?: string }
```

#### checkTrust

Check direct trust between two agents.

```typescript
const trust = await client.checkTrust(
  'eip155:8453:0x935D...:123', // trustor
  'eip155:8453:0x935D...:456'  // trustee
);

// Returns: { trusted: boolean; level?: number; type?: string }
```

### Scoring

#### calculateCreditScore

Calculate full credit score with caching.

```typescript
const result = await client.calculateCreditScore('eip155:8453:0x935D...:123');
```

#### clearScoreCache

Clear cached scores.

```typescript
client.clearScoreCache('eip155:8453:0x935D...:123'); // Clear specific
client.clearScoreCache(); // Clear all
```

## Task Types

Built-in task types:
- `code_review`
- `security_audit`
- `smart_contract_audit`
- `code_generation`
- `documentation`
- `research`
- `data_analysis`
- `translation`
- `content_creation`
- `api_integration`
- `testing`
- `deployment`
- `monitoring`
- `custom`

## Credit Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Task Quality | 40% | Average quality score from completed tasks |
| Reliability | 20% | Consistency and response time |
| Dispute Record | 15% | Dispute win rate weighted by frequency |
| Peer Trust | 15% | Average incoming trust from other agents |
| Tenure | 10% | Time since first task (capped at 1 year) |

## KAMIYO Tiers

| Tier | Score Range |
|------|-------------|
| Unverified | 0-24 |
| Bronze | 25-49 |
| Silver | 50-74 |
| Gold | 75-89 |
| Platinum | 90-100 |

## Configuration

```typescript
interface ParanetConfig {
  dkgEndpoint: string;           // DKG node endpoint
  dkgPort?: number;              // DKG port (default: 8900)
  blockchain: string;            // 'base:8453', 'gnosis:100', 'otp:2043'
  privateKey?: string;           // For publishing (omit for read-only)
  epochs?: number;               // Storage duration (default: 12)
  paranetUAL?: string;           // KAMIYO Paranet UAL (optional)
}
```

## Environment Variables

```bash
DKG_ENDPOINT=https://positron.origin-trail.network
DKG_PORT=8900
DKG_BLOCKCHAIN=base:8453
DKG_PRIVATE_KEY=0x...
DKG_EPOCHS=12
```

## Advanced Features

### Redis Caching

For multi-instance deployments, use Redis instead of in-memory caching:

```typescript
import { createRedisCache, CreditScoreCalculator } from '@kamiyo/agent-paranet';

// Create Redis-backed cache
const { cache, adapter, invalidator } = createRedisCache<CreditScore>({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  keyPrefix: 'kamiyo:paranet:',
  tls: process.env.NODE_ENV === 'production',
});

// Use with score calculator
const scorer = new CreditScoreCalculator(dkg, {
  cacheTTLMs: 5 * 60 * 1000,
  maxCacheSize: 1000,
});
```

Redis configuration options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| host | string | required | Redis host |
| port | number | required | Redis port |
| password | string | - | Redis password |
| db | number | 0 | Redis database number |
| keyPrefix | string | 'kamiyo:paranet:' | Key prefix for namespacing |
| tls | boolean | false | Enable TLS connection |

### Graceful Shutdown

Register shutdown handlers for clean resource cleanup:

```typescript
import {
  ShutdownManager,
  createCacheShutdownHandler,
  createRedisShutdownHandler,
  createMetricsShutdownHandler,
  createCircuitBreakerShutdownHandler,
  installProcessShutdownHandlers,
} from '@kamiyo/agent-paranet';

// Create manager
const shutdown = new ShutdownManager({ timeoutMs: 30000 });

// Register handlers (higher priority runs first)
shutdown.register(createRedisShutdownHandler(redisAdapter));  // priority: 20
shutdown.register(createCircuitBreakerShutdownHandler());     // priority: 15
shutdown.register(createCacheShutdownHandler(cache));         // priority: 10
shutdown.register(createMetricsShutdownHandler());            // priority: 5

// Install process handlers (SIGTERM, SIGINT)
shutdown.installProcessHandlers();

// Or manually trigger shutdown
const result = await shutdown.shutdown();
// { success: boolean, errors: string[] }
```

### OpenTelemetry Metrics

Initialize metrics collection:

```typescript
import { initializeMetrics, recordQuery, recordPublish } from '@kamiyo/agent-paranet';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

// With custom meter provider
const meterProvider = new MeterProvider({ /* ... */ });
initializeMetrics(meterProvider);

// Or use defaults
initializeMetrics();
```

Available metrics:

| Metric | Type | Description |
|--------|------|-------------|
| kamiyo.paranet.query.count | Counter | Query operations |
| kamiyo.paranet.publish.count | Counter | Publish operations |
| kamiyo.paranet.cache.hits | Counter | Cache hits |
| kamiyo.paranet.cache.misses | Counter | Cache misses |
| kamiyo.paranet.query.duration | Histogram | Query latency (ms) |
| kamiyo.paranet.publish.duration | Histogram | Publish latency (ms) |
| kamiyo.paranet.score.duration | Histogram | Score calculation latency |
| kamiyo.paranet.cache.size | Gauge | Current cache size |
| kamiyo.paranet.dkg.connections | Gauge | Active DKG connections |
| kamiyo.paranet.circuit_breaker.state | Gauge | Circuit breaker state |

### Health Checks

```typescript
import { checkHealth, checkLiveness, checkReadiness, HealthCheckRegistry } from '@kamiyo/agent-paranet';

// Full health check
const health = await checkHealth(dkg, config);
// { status: 'healthy'|'degraded'|'unhealthy', checks: [...], latencyMs }

// Kubernetes probes
const isLive = await checkLiveness(dkg);      // Basic connectivity
const isReady = await checkReadiness(dkg, config);  // Operational

// Custom health checks
const registry = new HealthCheckRegistry();
registry.register('redis', async () => ({
  name: 'redis',
  status: redisConnected ? 'pass' : 'fail',
}));
```

### Signature Verification

Verify EIP-712 signatures on attestations:

```typescript
import {
  verifyTaskCompletionSignature,
  verifyCapabilityAttestationSignature,
  verifyTrustRelationshipSignature,
  createSignatureVerifier,
} from '@kamiyo/agent-paranet';

// Verify single attestation
const result = await verifyTaskCompletionSignature(signedTask);
// { valid: boolean, signer?: string, error?: string }

// Create reusable verifier with config
const verifier = createSignatureVerifier({
  requireSignatures: true,
  maxTimestampDriftMs: 60 * 60 * 1000, // 1 hour
  allowedSigners: ['0x...', '0x...'],  // Optional allowlist
});
```

## License

MIT
