// Core client
export { MeishiClient } from './client.js';

// Managers
export { PassportManager } from './passport.js';
export { MandateManager } from './mandate.js';
export { LiabilityManager } from './liability.js';

// Exchange protocol
export { MeishiExchange } from './exchange.js';

// Compliance scoring
export {
  calculateComplianceScore,
  toOnChainScore,
  fromOnChainScore,
  classifyCompliance,
  scoreIdentityVerification,
  scoreAuthorizationValidity,
  scoreTransactionHistory,
  scoreAuditTrail,
  generateComplianceReport,
  DEFAULT_WEIGHTS,
} from './compliance-score.js';
export type { DimensionWeights } from './compliance-score.js';

// Kamon visual identity
export {
  deriveKamonParams,
  generateKamonSVG,
  generateKamonFromPassport,
} from './kamon.js';

// Types
export type {
  MeishiPassport,
  MeishiMandate,
  MeishiAudit,
  LiabilityAllocation,
  MeishiConfig,
  CreatePassportParams,
  UpdateMandateParams,
  RecordAuditParams,
  SetLiabilityParams,
  RecordTransactionParams,
  MeishiPresentation,
  MeishiHeaders,
  VerificationResult,
  ExchangeResult,
  ComplianceDimension,
  ComplianceReport,
  KamonParams,
  KamonRenderOptions,
} from './types.js';

export {
  ComplianceClass,
  Jurisdiction,
  SuspensionReason,
  AuditType,
} from './types.js';
