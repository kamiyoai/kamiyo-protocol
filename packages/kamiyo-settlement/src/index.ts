export { SettlementClient } from './client.js';

export {
  ViolationType,
  Severity,
  type Violation,
  type SeverityInfo,
  getSeverity,
  calculateRefund,
  calculateLatencyRefund,
  hashEvidence,
  createViolation,
  validateViolation,
} from './violations.js';

export {
  SettlementStatus,
  type SettlementClientConfig,
  type SettlementRequest,
  type SettlementResult,
  type SettlementState,
  type SettlementResponse,
  type EligibilityResult,
} from './types.js';

export {
  KAMIYO_PROGRAM_ID,
  RESPONSE_TIMEOUT_MS,
  deriveSettlementPDA,
  generateSettlementId,
  isValidPublicKey,
  toPublicKey,
  isExpired,
} from './utils.js';

export {
  MIN_ORACLES,
  MAX_SCORE_DEVIATION,
  COMMIT_PHASE_DURATION,
  REVEAL_PHASE_DURATION,
  type OracleCommitment,
  type OracleSubmission,
  type ConsensusResult,
  computeCommitmentHash,
  verifyCommitment,
  calculateConsensus,
  isCommitPhaseActive,
  isRevealPhaseActive,
  canFinalize,
} from './oracle.js';
