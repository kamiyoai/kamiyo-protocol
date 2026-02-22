# KAMIYO Trust Layer Primitive Map

This reference maps the trust-layer Solana primitive surface exposed by the current codebase.

## 1. `@kamiyo/sdk` core client primitives

### `KamiyoClient` PDA derivation primitives

- `getAgentPDA(owner)`
- `getAgreementPDA(agent, transactionId)`
- `deriveAgreementAddress(agent, transactionId)`
- `getOracleRegistryPDA()`
- `getReputationPDA(entity)`
- `getProtocolConfigPDA()`
- `getTreasuryPDA()`
- `getFeeVaultPDA()`
- `getBlacklistRegistryPDA()`
- `getLaunchRecordPDA(agent, mint)`
- `getLaunchRateLimitPDA(agent)`
- `getTraderSessionPDA(agent, elfaSessionId)`
- `getTradeEscrowPDA(session, tradeId)`

### `KamiyoClient` read/account primitives

- `getAgent(agentPDA)`
- `getAgentByOwner(owner)`
- `getAgreement(agreementPDA)`
- `getAgreementByTransactionId(agent, transactionId)`
- `getReputation(entity)`
- `getOracleRegistry()`
- `getProtocolConfig()`
- `getProtocolFees()`
- `getBlacklistRegistry()`
- `getBlacklistRoot()`
- `calculateAgreementFee(amount)`
- `calculateDisputeFee(amount)`

### `KamiyoClient` instruction builder primitives

- `buildCreateAgentInstruction(owner, params)`
- `buildCreateAgreementInstruction(agent, params)`
- `buildReleaseFundsInstruction(agent, transactionId, provider)`
- `buildInitializeOracleRegistryInstruction(admin, params)`
- `buildMarkDisputedInstruction(agent, transactionId)`
- `buildDeactivateAgentInstruction(owner)`
- `buildCreateTrustedLaunchInstruction(owner, params)`
- `buildCreateTraderSessionInstruction(owner, params)`
- `buildCreateTradeEscrowInstruction(trader, params)`
- `buildCloseTraderSessionInstruction(owner, params)`

### `KamiyoClient` transaction primitives

- `createAgent(params)`
- `createAgreement(params)`
- `releaseFunds(transactionId, provider)`
- `markDisputed(transactionId)`
- `deactivateAgent()`
- `initializeOracleRegistry(params)`
- `createTrustedLaunch(params)`
- `createTraderSession(params)`
- `createTradeEscrow(params)`
- `closeTraderSession(params)`

## 2. `@kamiyo/sdk` high-level trust managers

### `AgentManager`

- `create(name, agentType, stakeAmountSol)`
- `getByOwner(owner)`
- `getMine()`
- `isActive(owner)`
- `getReputationScore(owner)`
- `getPDA(owner)`
- `calculateTrustLevel(agent)`
- `getStats(agent)`

### `AgreementManager`

- `create(provider, amountSol, timeLockHours, transactionId, tokenMint?)`
- `getByTransactionId(transactionId, agent?)`
- `releaseFunds(transactionId, provider)`
- `dispute(transactionId)`
- `getStatus(transactionId)`
- `isExpired(transactionId)`
- `getTimeRemaining(transactionId)`
- `getPDA(transactionId, agent?)`
- `calculateResolution(amount, qualityScore)`
- `generateTransactionId()`
- `getStatusLabel(status)`
- `formatTimeRemaining(seconds)`

### `OracleManager`

- `getRegistry()`
- `getOracles()`
- `isRegistered(oracle)`
- `getRegistryPDA()`
- `calculateConsensus(scores, maxDeviation?)`
- `calculateWeightedConsensus(submissions)`
- `validateOracleCount(currentCount)`
- `getOracleTypeLabel(type)`
- `validateQualityScore(score)`
- `formatConsensusResult(result)`
- `isPublicRegistrationEnabled()`
- `getTotalStake()`
- `getActiveOracles()`
- `getOracle(pubkey)`
- `getOracleStatusLabel(status)`
- `calculateSuccessRate(oracle)`
- `isWithdrawalReady(oracle)`
- `getWithdrawalAvailableAt(oracle)`
- `validateStakeAmount(lamports)`
- `calculateWeightFromStake(lamports)`
- `formatOracleInfo(oracle)`
- `generateSalt()`
- `computeCommitmentHash(transactionId, score, salt)`
- `isInCommitPhase(commitPhaseEndsAt)`
- `isInRevealPhase(commitPhaseEndsAt)`
- `getCommitPhaseTimeRemaining(commitPhaseEndsAt)`

### `ReputationManager`

- `get(entity)`
- `getPDA(entity)`
- `calculateScore(reputation)`
- `getTrustTier(score)`
- `getDisputeRate(reputation)`
- `getDisputeWinRate(reputation)`
- `getSummary(reputation)`
- `compare(a, b)`
- `getEntityTypeLabel(type)`
- `formatReputation(reputation)`

## 3. Dispute and quality primitives

### `EscrowDisputeManager`

- PDA and phase helpers:
  - `getEscrowPDA(sessionId)`
  - `getOracleConfigPDA()`
  - `generateSalt()`
  - `computeCommitmentHash(sessionId, oracle, qualityScore, salt)`
  - `getClusterTime()`
  - `isInCommitPhase(escrow)`
  - `isInCommitPhaseAsync(escrow)`
  - `isInRevealPhase(escrow)`
  - `isInRevealPhaseAsync(escrow)`
  - `isReadyForFinalization(escrow)`
  - `isReadyForFinalizationAsync(escrow)`
  - `getPhaseTimeRemaining(escrow)`
  - `getPhaseTimeRemainingAsync(escrow)`
- consensus and economics:
  - `calculateConsensus(submissions, maxDeviation?)`
  - `calculateRefundPercentage(qualityScore)`
  - `calculateAmounts(totalAmount, refundPercentage)`
- oracle vote state helpers:
  - `hasCommitted(escrow, oracle)`
  - `hasRevealed(escrow, oracle)`
  - `hasSubmitted(escrow, oracle)`
  - `getCommitment(escrow, oracle)`
  - `getSubmission(escrow, oracle)`
  - `verifyCommitment(...)`
- formatting and validation:
  - `getStatusLabel(status)`
  - `formatEscrowInfo(escrow)`
  - `formatPhaseInfo(escrow)`
  - `validateQualityScore(score)`
  - `validateSalt(salt)`
- on-chain transaction primitives:
  - `fetchEscrow(escrowPda)`
  - `fetchOracleConfig()`
  - `markDisputed(escrowPda)`
  - `commitVote(escrowPda, commitmentHash)`
  - `revealVote(escrowPda, qualityScore, salt)`
  - `finalizeDispute(escrowPda)`
  - `commitVoteWithScore(escrowPda, qualityScore)`
  - `disputedTimeoutRelease(escrowPda)`

### `QualityOracle`

- `assessQuality(response, spec)`
- `generateVote(escrowPda, sessionId, response, spec)`
- `shouldVote(escrow)`
- `shouldReveal(escrow)`
- `filterPendingDisputes(escrows)`
- `previewConsensus(escrow)`
- `estimateOutcome(report, amount)`
- `getDisputeManager()`
- `setWeights(weights)`
- `setThreshold(threshold)`
- `getConfig()`
- `createServiceSpec(params)`

### `DisputeMonitor`

- `on(type, listener)`
- `onAll(listener)`
- `off(type, listener)`
- `start()`
- `stop()`
- `isRunning()`
- `refresh()`
- `getTrackedEscrows()`
- `getActionableDisputes(oraclePubkey)`

## 4. Privacy and shield primitives

### `PrivateReputation` (`@kamiyo/sdk/privacy/reputation`)

- `setStats(stats)`
- `getSuccessRate()`
- `meetsThreshold(threshold)`
- `getCommitment()`
- `prepareProof(threshold)`
- `getProverInput(threshold)`
- `fromOnChain(agentPubkey, data)`
- `verifyOnChain(connection, verifierProgram, proof, inputs)`

### `Shield` and related (`@kamiyo/sdk/shield/*`)

- `Shield`:
  - `setRep(data)`
  - `successRate()`
  - `meetsThreshold(threshold)`
  - `commitment()`
  - `issue(blacklistRoot, ttl?)`
  - `credential()`
  - `valid()`
  - `proverInput(threshold)`
  - `prove(threshold, smtProof?)`
  - `fetch(connection, agent, programId)`
  - `emptySmtSiblings()`
  - `emptySmtRoot()`
  - `exclusionProof(root, agentPk, siblings)`
- credential helpers:
  - `verifyCredential(c, expectedRoot)`
  - `serialize(c)`
  - `deserialize(data)`
- `CredentialManager`:
  - `issue(cred)`
  - `revoke(cred)`
  - `isRevoked(cred)`
  - `verify(cred)`
  - `refresh(cred, newTtl?)`
  - `getIssued()`
  - `getRevoked()`
- `Blacklist`:
  - `add(agent, reason?)`
  - `remove(agent)`
  - `contains(agent)`
  - `getRoot()`
  - `size()`
  - `list()`
  - `proof(agent)`
  - `exclusionProof(agent)`
  - `export()`
- `ShieldVerifier`:
  - `verifyReputation(proof, agentPk, commitment, threshold)`
  - `verifyExclusion(proof, root, key, siblings)`
  - `submitProof(payer, data)`
  - `batchVerify(proofs)`
  - `localVerifyMerkle(proof, expectExists)`

### Privacy APIs (`@kamiyo/sdk/api`)

- `ReputationAPI`:
  - `proveThreshold(req)`
  - `verify(req)`
  - `computeCommitment(agentPubkey, stats)`
  - `getSuccessRate(stats)`
  - `meetsThreshold(stats, threshold)`
  - `clearCache()`
- `ShieldAPI`:
  - `verifyAgent(req)`
  - `issueCredential(req)`
  - `getEmptyBlacklist()`
  - `clearCache()`

## 5. Staking, governance, and voting primitives

### `StakingClient` and helpers

- `calculateMultiplier(durationSeconds)`
- `formatMultiplier(basisPoints)`
- `getPoolPDA()`
- `getPositionPDA(owner)`
- `getVaultPDA()`
- `getRewardsVaultPDA()`
- `getPool()`
- `getPosition(owner)`
- `getPositionMultiplier(owner)`
- `getPendingRewards(owner)`

### `UnifiedKamiyoClient`

- `agents` (embedded `KamiyoClient`)
- `staking` (embedded `StakingClient`)
- `getStakePositionPDA(owner)`
- `getStakeMultiplier(owner)`
- `hasStakePosition(owner)`

### Governance and voting

- `KamiyoGovernance`:
  - `init()`
  - `getRealm()`
  - `getTokenOwnerRecord()`
  - `depositTokens(amount)`
  - `withdrawTokens(amount)`
  - `createProposal(params)`
  - `vote(proposalAddress, choice)`
  - `getProposalState(proposalAddress)`
- `Voting`:
  - `create(id, options, commitSec, revealSec)`
  - `get(id)`
  - `phase(proposal)`
  - `vote(proposalId, choice, voter)`
  - `commit(proposalId, voter, commitment)`
  - `reveal(proposalId, vote)`
  - `tally(proposalId)`
  - `proverInput(proposalId)`
  - `serializeVote(vote)`
  - `deserializeVote(data)`
  - `voteInstruction(programId, proposal, voter, commitment)`

## 6. Productized trust primitives

### `FundryManager`

- `secureLaunch(params)`
- `getLaunchRecord(agent, mint)`
- `listConfigs()`

### `ElfaManager`

- `secureTrade(params)`
- `secureMcpCall(params)`
- `getSessionStatus(sessionPda)`

### `X402Client`

- `checkPaymentRequired(url)`
- `discoverActions(baseUrl)`
- `executeAction(actionUrl, params?)`
- `payForAccess(url, options?)`
- `request(url, options?)`
- `getPublicKey()`
- `getBalance()`
- `createX402Client(connection, wallet, programId, options?)`

### Reliability primitives

- `RpcPool`:
  - `fromEnv(cluster?)`
  - `init()`
  - `getConnection()`
  - `execute(fn)`
  - `reportError(connection)`
  - `getStats()`
  - `isInitialized()`
  - `shutdown()`
  - `createResilientConnection(endpoints, commitment?)`
- `CircuitBreaker`:
  - `execute(fn)`
  - `canExecute()`
  - `recordSuccess()`
  - `recordFailure()`
  - `getRetryAfterMs()`
  - `getState()`
  - `getStats()`
  - `reset()`
  - `createZkCircuitBreaker(...)`
  - `CircuitBreakerRegistry.get(name, config?)`
  - `CircuitBreakerRegistry.getStats()`
  - `CircuitBreakerRegistry.resetAll()`

## 7. Package-level trust primitives

### `@kamiyo/actions`

- `createEscrow(config, params)`
- `releaseFunds(config, params)`
- `disputeEscrow(config, params)`
- `getEscrowStatus(config, params)`
- `getBalance(config)`

### `@kamiyo/solana-reputation`

- `ReputationClient.getModelPDA(modelId)`
- `ReputationClient.getModelReputation(model)`
- `ReputationClient.getModelReputationByPDA(modelPda)`
- `ReputationClient.meetsThreshold(model, threshold)`
- `ReputationClient.getUserReputationPDA(user)`
- `ReputationClient.getUserReputation(user)`
- `ReputationClient.registerModel(modelName)`
- `ReputationClient.updateModelStats(modelName, qualityScore, successful)`

### `@kamiyo/solana-inference`

- `InferenceClient.getInferenceEscrowPDA(user, modelId)`
- `InferenceClient.getModelPDA(modelId)`
- `InferenceClient.createInferenceEscrow(params)`
- `InferenceClient.getEscrow(escrowPda)`
- `InferenceClient.verifyEscrow(escrowId)`
- `InferenceClient.settleInference(escrowId, qualityScore, modelOwner)`
- `InferenceClient.refundExpired(escrowId)`
- `verifyEscrow(connection, escrowId, programId?)`
- `reportQuality(connection, escrowId, score)`

### `@kamiyo/solana-privacy`

- proof generation:
  - `PrivateInference.proveReputation(params)`
  - `PrivateInference.provePayment(params)`
  - `PrivateInference.encodeReputationProof(proof)`
  - `PrivateInference.encodePaymentProof(proof)`
  - `PrivateInference.decodeProof(encoded)`
  - `computeCommitment(score, secret)`
  - `generateSecret()`
  - `deserializeGroth16Proof(bytes)`
- verification:
  - `verifyReputationProof(encodedProof, options)`
  - `verifyPaymentProof(encodedProof, options?)`
  - `isSnarkjsVerificationAvailable(config?)`
- on-chain helpers:
  - `buildVerifyReputationTierInstruction(user, proof, threshold, commitment, programId?)`
  - `verifyReputationTierOnChain(connection, wallet, proof, threshold, commitment)`
  - `VERIFY_REPUTATION_TIER_CU`
- HTTP handlers:
  - `handleProveReputation(req, artifactsDir?)`
  - `handleVerifyReputation(req, artifactsDir?)`
  - `handleComputeCommitment(score, secret)`
  - `generateRandomSecret()`

## 8. Formal verification primitives (Kani)

### Kani command primitives

- baseline:
  - `./scripts/kani.sh`
  - `./scripts/kani.sh <package>`
- feature profiles:
  - `KANI_FULL=1 ./scripts/kani.sh`
  - `KANI_AGENT=1 ./scripts/kani.sh kani-solana`
  - `KANI_ACCOUNT_INFO=1 ./scripts/kani.sh kani-solana`
  - `KANI_AGENT=1 KANI_FULL=1 ./scripts/kani.sh`
  - `KANI_AGENT=1 KANI_FULL=1 KANI_ACCOUNT_INFO=1 ./scripts/kani.sh`
- CI parity:
  - `KANI_OUT_DIR=kani-results ./scripts/kani-ci.sh`
  - `./scripts/kani-audit.sh kani-results/kani.log`
  - `KANI_EXPECT_COVERS=1 ./scripts/kani-audit.sh kani-results/kani.log`
- automatic profile resolver:
  - `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh`
  - `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --run`
  - `skills/kamiyo-trust-layer/scripts/kani-required-profiles.sh --run --ci`

### Verified package targets

- default package set:
  - `kani-solana`
  - `kamiyo-trust-layer`
  - `kamiyo`
  - `hive`
  - `kamiyo-staking`
- direct commands:
  - `cargo kani -p kani-solana`
  - `cargo kani -p kamiyo-trust-layer`
  - `cargo kani -p kamiyo`
  - `cargo kani -p hive`
  - `cargo kani -p kamiyo-staking`

### Trust invariant proof surfaces

- trust-layer model invariants:
  - bounded score updates
  - bounded failure basis points
  - strict sequence monotonicity
  - strict policy-version monotonicity
  - allow-gate implies review-gate constraints
- escrow/dispute/economic invariants (`programs/kamiyo/src/kani_proofs.rs`):
  - refund mapping correctness
  - weighted consensus bounds
  - dispute cost cap
  - reputation score bounds
  - timelock release policy
  - value conservation across dispute settlement flows
- hive and staking invariants:
  - fee split conservation
  - multiplier set membership
  - multiplier monotonicity
  - bounded pending rewards arithmetic
- agent proof suite (`solana-agent` feature):
  - lamport conservation
  - no-reentrancy
  - CPI authorization
  - state-machine transition safety
  - PDA seed constraints
- account info proof suite (`solana-account-info` feature):
  - release authorization/timelock policy
  - lamport conservation for release transfer
  - no mutation on failed release

### Kani CI workflow primitives

- `.github/workflows/kani.yml`:
  - fast PR/push profile with target harness selection
- `.github/workflows/kani-full.yml`:
  - scheduled and dispatch full profile with cover audit gating
- `.github/workflows/kani-sarif.yml`:
  - SARIF output and code-scanning ingestion
- scripts:
  - `scripts/kani.sh`
  - `scripts/kani-ci.sh`
  - `scripts/kani-audit.sh`

## Coverage checklist

For each integration task, explicitly check off which primitive sets are used. A complete trust-layer implementation should include at least one primitive from each required domain touched by the product requirement.
