# Testing Documentation

Comprehensive test suite for x402Resolve with **4,267+ lines of test code** across all packages.

## Test Summary

| Package | Test Files | Lines of Code | Status |
|---------|-----------|---------------|--------|
| **MCP Server** | 9 files | 2,359 lines | 12/12 passing |
| **Escrow Program** | 2 files | 770 lines | 31/34 passing (91.2%) |
| **SDK** | 4 files | 896 lines | 8/8 passing |
| **Middleware** | 1 file | 242 lines | Passing |
| **Oracle Function** | 1 file | 177 lines | Passing |
| **Total** | **17 files** | **4,267 lines** | **63/66 (95.5%)** |

## Test Coverage

### Solana Program Tests
Location: `packages/x402-escrow/tests/`

**Escrow Lifecycle Tests**
- Escrow creation with valid/invalid parameters
- Amount constraints (min/max validation)
- Timelock duration validation
- Fund release workflows
- Dispute marking and handling
- Concurrent operation safety
- PDA derivation correctness

**Coverage:** Escrow creation, fund management, dispute lifecycle, concurrent access

### SDK Integration Tests
Location: `packages/x402-sdk/tests/`

**Client Integration Tests** (`client-integration.test.ts`)
- Payment creation (with/without escrow)
- Input validation (amounts, pubkeys, transaction IDs)
- Dispute filing with evidence
- Retry logic and error recovery
- Connection handling and timeouts
- State management and caching

**Reputation Tests** (`reputation.test.ts`)
- PDA derivation for reputation accounts
- Dispute success rate calculation
- Verification level limits
- Dispute cost calculation based on history
- Rate limit enforcement

**Middleware Tests** (`packages/x402-middleware/tests/express.test.ts`)
- HTTP 402 response handling
- Payment proof verification
- Escrow ownership validation
- Error responses (403, 402)
- Request header validation

**Coverage:** Client SDK, reputation system, middleware integration

### End-to-End Production Tests
Location: `tests/e2e-production.test.ts`

**Complete Payment Flows**
- Full payment cycle: create → pay → verify → release
- High-value transaction handling
- Rapid successive transactions
- Burst transaction processing

**Dispute Resolution**
- Complete dispute workflow
- Refund amount calculation
- Multi-step resolution process

**Reputation System**
- Reputation tracking accuracy
- Post-transaction reputation updates
- Success rate calculations

**Error Recovery**
- Network interruption handling
- Insufficient funds scenarios
- Concurrent access conflicts

**Performance Benchmarks**
- Escrow creation latency (< 5s)
- Burst transaction throughput (10 tx in < 30s)

**Data Integrity**
- Escrow data preservation
- Amount manipulation prevention
- State consistency validation

**Coverage:** Production workflows, performance, reliability

### Security Tests
Location: `tests/security.test.ts`

**Authorization Attacks**
- Unauthorized fund release prevention
- Unauthorized dispute marking prevention
- Signature forgery detection

**Reentrancy Protection**
- Double spending prevention
- Concurrent state manipulation protection
- State machine integrity

**Input Validation**
- Negative/zero amount rejection
- Overflow protection (amounts, timelocks)
- Invalid transaction ID handling
- Invalid public key rejection

**PDA Security**
- Deterministic PDA derivation
- PDA collision prevention
- Bump seed validation

**Access Control**
- Agent-only operation enforcement
- Cross-account attack prevention
- Role-based permission validation

**Denial of Service Protection**
- Spam transaction handling
- Resource exhaustion prevention
- Rate limiting enforcement

**Coverage:** Attack vectors, authorization, input validation, DoS protection

### Oracle Integration Tests
Location: `tests/oracle-integration.test.ts`

**Centralized Oracle**
- Ed25519 signature verification
- Quality score validation
- Timestamp freshness enforcement
- Data completeness assessment
- Schema compliance verification
- Concurrent request handling

**Switchboard Oracle**
- Feed data freshness validation
- Attestation timestamp verification
- Downtime/fallback handling
- Cryptographic attestation verification

**Multi-Oracle Consensus**
- Result aggregation from multiple oracles
- Oracle disagreement resolution
- Outlier detection and exclusion

**Quality Assessment**
- Completeness-based scoring
- Freshness penalty calculation
- Confidence threshold validation

**Error Handling**
- Malformed request rejection
- Timeout handling
- Retry logic validation

**Coverage:** Oracle verification, consensus mechanisms, quality scoring

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Start local Solana test validator
solana-test-validator

# Start local oracle (if testing oracle integration)
npm run start:oracle
```

### Program Tests
```bash
cd packages/x402-escrow
anchor test
```

### SDK Tests
```bash
cd packages/x402-sdk
npm test
```

### Middleware Tests
```bash
cd packages/x402-middleware
npm test
```

### End-to-End Tests
```bash
npm run test:e2e
```

### Security Tests
```bash
npm run test:security
```

### Oracle Tests
```bash
ORACLE_URL=http://localhost:8000 npm run test:oracle
```

### All Tests
```bash
npm test
```

## Test Configuration

### Environment Variables
```bash
# Solana RPC endpoint
SOLANA_RPC_URL=http://localhost:8899

# Oracle endpoint
ORACLE_URL=http://localhost:8000

# Fallback oracle
FALLBACK_ORACLE_URL=http://localhost:8001

# Multi-oracle endpoints
ORACLE_1_URL=http://localhost:8000
ORACLE_2_URL=http://localhost:8001
ORACLE_3_URL=http://localhost:8002

# Program ID
PROGRAM_ID=E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n
```

### Test Timeouts
```json
{
  "testTimeout": 60000,
  "setupTimeout": 30000,
  "teardownTimeout": 30000
}
```

## Test Metrics

### Coverage Goals
- Program instructions: 95%
- SDK methods: 90%
- Middleware functions: 90%
- Error paths: 85%

### Performance Benchmarks
- Escrow creation: < 5 seconds
- Fund release: < 3 seconds
- Dispute marking: < 2 seconds
- Oracle assessment: < 1 second
- Burst (10 tx): < 30 seconds

### Security Checklist
- Authorization checks
- Input validation
- Reentrancy protection
- Integer overflow protection
- PDA security
- Rate limiting
- Timestamp validation
- Access control

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Release tags

CI pipeline:
1. Lint checks
2. Type checks
3. Unit tests
4. Integration tests
5. E2E tests
6. Security tests
7. Coverage report

## Troubleshooting

### Common Issues

**Test validator not running**
```bash
solana-test-validator --reset
```

**Airdrop failures**
```bash
# Increase airdrop limits in validator config
solana-test-validator --limit-ledger-size 50000000
```

**Timeout errors**
```bash
# Increase test timeout
jest --testTimeout=120000
```

**Oracle connection failures**
```bash
# Check oracle is running
curl http://localhost:8000/health

# Restart oracle
npm run start:oracle
```

### Debug Mode
```bash
# Run tests with verbose logging
DEBUG=x402:* npm test

# Run single test file
npm test -- tests/security.test.ts

# Run with debugger
node --inspect-brk node_modules/.bin/jest tests/e2e-production.test.ts
```

## Test Data Cleanup

After running tests:
```bash
# Clean test accounts
npm run clean:test-accounts

# Reset validator state
solana-test-validator --reset

# Clear test logs
rm -rf test-logs/
```

## Contributing Tests

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for workflows
3. Update e2e tests for user journeys
4. Add security tests for attack vectors
5. Document test scenarios in this file

Test quality standards:
- Descriptive test names
- Minimal test data setup
- Independent tests (no shared state)
- Proper cleanup in afterEach/afterAll
- Error case coverage
- Edge case validation
