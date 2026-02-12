export { MeishiClient } from './client.js';

export { PassportManager } from './passport.js';
export { MandateManager } from './mandate.js';
export { LiabilityManager } from './liability.js';

export { MeishiExchange } from './exchange.js';
export { MeishiWriter } from './writer.js';

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

export {
  deriveKamonParams,
  generateKamonSVG,
  generateKamonFromPassport,
} from './kamon.js';
export {
  complianceRewardMultiplier,
  DEFAULT_COMPLIANCE_YIELD_BANDS,
} from './tokenomics.js';
export type {
  ComplianceYieldBand,
  ComplianceRewardOutcome,
} from './tokenomics.js';

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
