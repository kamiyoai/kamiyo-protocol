# KAMIYO Event Horizon - Execution Plan

## Objective

Build a Grok/xAI-enabled, replayable truth-court workflow that strengthens KAMIYO dispute resolution with:

- Multi-oracle committee verdicts (not single-model authority)
- Deterministic evidence hashing for replay and audit
- Structured attributions and confidence outputs
- Slashing recommendations for inconsistent oracle behavior
- Tooling exposed through the MCP server for immediate use

This is positioned as a Mars-ops style trust layer while keeping protocol mechanics strict and verifiable.

## Scope

### In Scope

1. Implement an off-chain truth-court module inside `packages/kamiyo-mcp` with:
   - Canonical case hashing
   - Committee evaluation orchestration
   - Consensus and confidence calculation
   - Replay verification based on fixed feature vectors and digest checks
   - Slashing recommendation output for invalid or inconsistent oracle responses
2. Add xAI/Grok adapter support via environment-based configuration.
3. Integrate the truth-court module into dispute tooling with a new end-to-end function.
4. Expose this function as a new MCP tool route.
5. Add tests and run build/test commands for the modified package.

### Out of Scope (This Pass)

1. On-chain program changes for storing committee outputs directly in Solana accounts.
2. Full cryptographic attestation hardware for oracle signatures.
3. Production governance and economic parameter tuning.

## Architecture Decisions

1. **Committee over single model:** The system requires multiple oracle outputs and computes a majority verdict.
2. **Structured output contract:** Every oracle output must include verdict, confidence, factors, evidence hash, model hash, and reasoning reference.
3. **Replay-first design:** Case features are normalized and hashed before committee execution; replay checks compare hashes and outputs.
4. **Separation of concerns:** Truth-court logic is independent from on-chain transaction submission so it can be tested offline.
5. **Fail-closed behavior:** Invalid oracle outputs are rejected and counted toward slashing recommendations.

## Deliverables

1. `truth-court` module with strict data types and validation.
2. `grok` adapter for xAI-compatible chat completion calls.
3. Dispute integration function:
   - Runs truth-court committee
   - Returns on-chain anchor fields (`caseHash`, `evidenceHash`, committee summary)
   - Optionally marks dispute on-chain via existing escrow program flow
4. MCP tool definition and dispatch path for the truth-court dispute flow.
5. Automated tests for:
   - Consensus rules
   - Replay hash integrity
   - Invalid oracle output handling and slashing recommendations
   - Grok adapter request/response parsing (mocked transport)

## Execution Phases

### Phase 1 - Core Model and Hashing

1. Define interfaces for case input, oracle response, verdict bundle, replay report.
2. Implement canonical serialization and SHA-256 hashing utilities.
3. Add validation guards for numeric ranges and required fields.

### Phase 2 - Committee Engine

1. Implement oracle interface and committee runner.
2. Collect and validate oracle responses.
3. Compute majority verdict, weighted confidence, and explanation summary.
4. Emit slashing candidates when outputs are invalid or evidence hashes mismatch.

### Phase 3 - Grok/xAI Adapter

1. Build adapter with:
   - Base URL, API key, model from environment
   - Deterministic prompt template for dispute analysis
   - JSON parsing with strict field checks
2. Support dependency-injected `fetch` for testability.

### Phase 4 - Dispute and MCP Integration

1. Add `fileDisputeWithTruthCourt` to dispute tools.
2. Wire optional on-chain dispute mark call after committee evaluation.
3. Register a new MCP tool and route handler in server index.

### Phase 5 - Verification

1. Add new tests in package test suite.
2. Run `npm run build` for `packages/kamiyo-mcp`.
3. Run targeted test script for truth-court flow.

## Acceptance Criteria

1. A new MCP tool can evaluate disputes through a committee that includes Grok/xAI.
2. Result includes replayable hashes and structured factor attribution.
3. Replay function detects mutation of features/evidence.
4. Invalid oracle outputs do not silently pass and produce slashing recommendations.
5. Package build succeeds and tests pass.

## Risks and Mitigations

1. **Model output drift**
   - Mitigation: strict schema parsing and fail-closed validation.
2. **Network/API instability**
   - Mitigation: timeout and per-oracle failure handling; committee can continue with quorum policy.
3. **Over-centralization**
   - Mitigation: committee abstraction supports multiple providers and local verifier nodes.
4. **False confidence**
   - Mitigation: confidence derived from agreement and explicit vote distribution, not one model assertion.

## Rollout Notes

1. Start in shadow mode: run truth-court alongside current dispute flow without auto-enforcement.
2. Enable enforcement after replay consistency and disagreement metrics are stable.
3. Publish benchmark traces to demonstrate deterministic challenge and adjudication behavior.
