# Comprehensive Validation Suite

End-to-end validation that actually runs agents against real MCP tools and SDK to find issues and validate all capabilities work together.

## What This Tests

### Suite 1: MCP Tools (8 tools)
- create_escrow
- check_escrow_status
- verify_payment
- assess_data_quality
- estimate_refund
- get_api_reputation
- file_dispute
- call_api_with_escrow

### Suite 2: SDK Integration
- Escrow creation via SDK
- Fetch escrow data
- PDA derivation determinism
- Reputation initialization

### Suite 3: Agent Autonomous Behavior
- Quality assessment (high quality)
- Quality assessment (low quality)
- Quality assessment (incomplete data)
- Decision logic (execute)
- Decision logic (dispute)

### Suite 4: Multi-Agent Coordination
- Quality-weighted voting
- Consensus building
- Disagreement handling

### Suite 5: Performance and Edge Cases
- Balance verification
- RPC latency
- Invalid parameter handling
- Nonexistent escrow handling

## Running the Validation

```bash
# Install dependencies
npm install

# Set up environment
cp ../../packages/mcp-server/.env.example .env
# Edit .env with your AGENT_PRIVATE_KEY

# Run comprehensive validation (simplified)
npm run validate

# Or run full validation (requires workspace setup)
npm run validate:full
```

## What It Finds

The validation automatically:

1. **Tests all integrations** - MCP + SDK + Agents
2. **Measures performance** - RPC latency, test duration
3. **Handles edge cases** - Invalid inputs, missing data
4. **Identifies failures** - With specific error messages
5. **Suggests improvements** - Actionable recommendations

## Example Output

```
======================================================================
COMPREHENSIVE VALIDATION - x402Resolve
======================================================================

Agent: 9W8Ry...xyz
RPC: https://api.devnet.solana.com
Program: E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n

Validating: MCP Tools + SDK + Agents + Multi-Agent + Performance

======================================================================
[SUITE 1] MCP TOOLS VALIDATION
======================================================================
Testing all 8 MCP tools against real infrastructure

  ✓ create_escrow (1823ms)
    Escrow: E7xQm3...abc
  ✓ check_escrow_status (1245ms)
  ✓ verify_payment (1156ms)
  ✓ assess_data_quality (89ms)
    Quality: 95%
  ✓ estimate_refund (45ms)
  ✓ get_api_reputation (567ms)
  ✓ file_dispute logic (12ms)
  ✓ call_api_with_escrow workflow (8ms)

======================================================================
[SUITE 2] SDK INTEGRATION
======================================================================
Testing SDK escrow creation and management

  ✓ Create escrow (1678ms)
    Tx: https://explorer.solana.com/tx/2Zx...def?cluster=devnet
  ✓ Fetch escrow data (1234ms)
  ✓ PDA derivation (5ms)
  ✓ Reputation initialization (1890ms)
    Initialized: 3Yq...ghi

======================================================================
[SUITE 3] AGENT AUTONOMOUS BEHAVIOR
======================================================================
Testing agent decision making and quality assessment

  ✓ Quality assessment (high) (3ms)
    Quality: 97%
  ✓ Quality assessment (low) (2ms)
    Quality: 68% (would dispute)
  ✓ Quality assessment (incomplete) (2ms)
    Quality: 72% (missing fields)
  ✓ Decision logic (execute) (1ms)
    Decision: Execute (95% > 80%)
  ✓ Decision logic (dispute) (1ms)
    Decision: Dispute (65% < 80%)

======================================================================
[SUITE 4] MULTI-AGENT COORDINATION
======================================================================
Testing quality consensus and voting mechanisms

  ✓ Quality-weighted voting (4ms)
    Valid agents: 2/3
    Weights: 51.9%, 48.1%
  ✓ Consensus building (2ms)
    Avg Quality: 92%
    Consensus: STRONG
  ✓ Disagreement handling (3ms)
    Disagreement detected: BUY vs SELL
    Action: HOLD (conflicting signals)

======================================================================
[SUITE 5] PERFORMANCE AND EDGE CASES
======================================================================
Testing system limits and error handling

  ✓ Sufficient balance (234ms)
    Balance: 0.9450 SOL
  ✓ RPC latency (156ms)
    Latency: 156ms
  ✓ Invalid amount (negative) (45ms)
    Correctly rejected: Invalid amount...
  ✓ Escrow not found (678ms)
    Correctly handled: Account not found

======================================================================
VALIDATION SUMMARY
======================================================================

MCP Tools:
  Passed: 8/8

SDK:
  Passed: 4/4

Agent:
  Passed: 5/5

Multi-Agent:
  Passed: 3/3

Performance:
  Passed: 4/4

Overall:
  Total Tests: 24
  Passed: 24
  Failed: 0
  Warnings: 0
  Success Rate: 100.0%
  Duration: 12.3s

======================================================================
IMPROVEMENT SUGGESTIONS
======================================================================

✓ All validations passed!
  System is production-ready for hackathon submission

Next Steps:
  1. Record demo video showing this validation
  2. Document test results in submission
  3. Highlight 100% success rate to judges

======================================================================
```

## If Tests Fail

The validator provides:

1. **Specific error messages** - Exact failure point
2. **Actionable suggestions** - How to fix
3. **Performance metrics** - Identify slow tests
4. **Component isolation** - Which part failed

Example failure output:
```
Failed Tests:

  1. [MCP Tools] create_escrow
     Error: Insufficient funds
     💡 Run: solana airdrop 1 <address> --url devnet

  2. [SDK] Fetch escrow data
     Error: Account not found
     💡 Initialize reputation first with init_reputation tool
```

## Improvement Areas

The validator identifies:

- **Slow tests** (>3s) - Optimize RPC calls
- **Failed components** - Which system needs work
- **Edge case handling** - Missing validations
- **Performance bottlenecks** - RPC latency, transaction time

## Value for Hackathon

This comprehensive validation:

1. **Proves everything works** - 24 tests across 5 suites
2. **Real Solana transactions** - Not mocked, actual devnet
3. **Finds issues early** - Before judges test
4. **Shows production quality** - Professional testing approach
5. **Demonstrates integration** - MCP + SDK + Agents all working

## Running Specific Suites

```bash
# Run just MCP tools
tsx run-validation.ts --suite mcp

# Run just SDK
tsx run-validation.ts --suite sdk

# Run just agents
tsx run-validation.ts --suite agents
```

## Continuous Validation

Add to CI/CD:

```yaml
name: Comprehensive Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run validate
```

## License

MIT
