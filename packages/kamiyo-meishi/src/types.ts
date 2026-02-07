import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export enum ComplianceClass {
  Unclassified = 0,
  Minimal = 1,
  Limited = 2,
  High = 3,
  Unacceptable = 4,
}

export enum Jurisdiction {
  Global = 0,
  EU = 1,
  US = 2,
  UK = 3,
  APAC = 4,
}

export enum SuspensionReason {
  None = 0,
  ComplianceFailure = 1,
  FraudDetected = 2,
  MandateExpired = 3,
  OracleConsensus = 4,
}

export enum AuditType {
  Initial = 0,
  Periodic = 1,
  Triggered = 2,
  Dispute = 3,
}

export interface MeishiPassport {
  agentIdentity: PublicKey;
  issuer: PublicKey;
  principal: PublicKey;
  kamonHash: number[];
  complianceClass: ComplianceClass;
  complianceScore: number;
  jurisdiction: Jurisdiction;
  mandateHash: number[];
  mandateExpires: BN;
  mandateVersion: number;
  totalTransactions: BN;
  totalVolumeUsd: BN;
  disputesFiled: number;
  disputesLost: number;
  lastAudit: BN;
  auditNonce: number;
  suspended: boolean;
  suspensionReason: SuspensionReason;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface MeishiMandate {
  meishi: PublicKey;
  version: number;
  principalSignature: number[];
  spendingLimitUsd: BN;
  dailyLimitUsd: BN;
  monthlyLimitUsd: BN;
  categoryWhitelist: number[];
  merchantWhitelistHash: number[];
  requiresHumanApprovalAbove: BN;
  geoRestrictions: number;
  validFrom: BN;
  validUntil: BN;
  revoked: boolean;
  revokedAt: BN;
  bump: number;
}

export interface MeishiAudit {
  meishi: PublicKey;
  auditor: PublicKey;
  auditType: AuditType;
  complianceScoreBefore: number;
  complianceScoreAfter: number;
  findingsHash: number[];
  findingsUal: string;
  passed: boolean;
  timestamp: BN;
  bump: number;
}

export interface LiabilityAllocation {
  meishi: PublicKey;
  counterparty: PublicKey;
  consumerLiabilityBps: number;
  developerLiabilityBps: number;
  merchantLiabilityBps: number;
  platformLiabilityBps: number;
  maxLiabilityUsd: BN;
  arbitrationOracle: PublicKey;
  agreedAt: BN;
  expiresAt: BN;
  bump: number;
}

export interface MeishiConfig {
  connection: Connection;
  keypair: Keypair;
  programId?: string;
}

export interface CreatePassportParams {
  agentIdentity: PublicKey;
  jurisdiction: Jurisdiction;
}

export interface UpdateMandateParams {
  passportAddress: PublicKey;
  spendingLimitUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  categoryWhitelist: number[];
  merchantWhitelistHash: number[];
  requiresHumanApprovalAbove: number;
  geoRestrictions: number;
  validFrom: number;
  validUntil: number;
}

export interface RecordAuditParams {
  passportAddress: PublicKey;
  auditType: AuditType;
  complianceScoreAfter: number;
  findingsHash: number[];
  findingsUal: string;
  passed: boolean;
}

export interface SetLiabilityParams {
  passportAddress: PublicKey;
  counterparty: PublicKey;
  consumerBps: number;
  developerBps: number;
  merchantBps: number;
  platformBps: number;
  maxLiabilityUsd: number;
  arbitrationOracle: PublicKey;
  expiresAt: number;
}

export interface RecordTransactionParams {
  passportAddress: PublicKey;
  volumeUsd: number;
  disputed: boolean;
  disputeLost: boolean;
}

export interface MeishiPresentation {
  passportAddress: string;
  mandateVersion: number;
  complianceProof?: string;
  signature: string;
  liabilityRef?: string;
}

export interface MeishiHeaders {
  'x-meishi-passport': string;
  'x-meishi-mandate-version': string;
  'x-meishi-compliance-proof'?: string;
  'x-meishi-signature': string;
  'x-meishi-liability-ref'?: string;
}

export interface VerificationResult {
  valid: boolean;
  passport?: MeishiPassport;
  errors: string[];
  warnings: string[];
}

export interface ExchangeResult {
  success: boolean;
  liabilityAddress?: string;
  error?: string;
}

export interface ComplianceDimension {
  name: string;
  weight: number;
  score: number;
  requirement: 'mandatory' | 'recommended' | 'optional';
  jurisdiction: Jurisdiction[];
  findings: string[];
}

export interface ComplianceReport {
  passportAddress: string;
  dimensions: ComplianceDimension[];
  overallScore: number;
  classification: ComplianceClass;
  jurisdiction: Jurisdiction;
  recommendations: string[];
  timestamp: number;
}

export interface KamonParams {
  symmetry: number;
  complexity: number;
  style: 'geometric' | 'organic' | 'radial' | 'lattice';
  primaryElement: string;
}

export interface KamonRenderOptions {
  size: number;
  complianceClass: ComplianceClass;
  jurisdiction: Jurisdiction;
  suspended: boolean;
}
