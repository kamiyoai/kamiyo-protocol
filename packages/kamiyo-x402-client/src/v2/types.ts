export interface PaymentRequirementV2 {
  x402Version: 2;
  scheme: 'exact';
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface ExtensionDeclaration {
  info: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

export interface PaymentRequired402 {
  x402Version: 2;
  accepts: PaymentRequirementV2[];
  error: string;
  facilitator: string;
  extensions?: Record<string, ExtensionDeclaration>;
}

export interface PaymentPayload {
  x402Version: 2;
  scheme: 'exact';
  network: string;
  payment: {
    payer: string;
    payTo: string;
    amount: string;
    asset: string;
    timestamp: number;
    nonce: string;
  };
  extensions?: Record<string, ExtensionDeclaration>;
}

export interface KamiyoReputationInfo {
  minThreshold: number;
  proofType: 'groth16-bn254';
  tiers: KamiyoReputationTier[];
  creditEnabled: boolean;
}

export interface KamiyoReputationTier {
  name: string;
  minThreshold: number;
  discountPercent: number;
}

export interface KamiyoReputationPayload {
  proof: string;
  commitment: string;
  threshold: number;
  agentPk: string;
  publicSignals: string[];
}

export interface KamiyoEscrowInfo {
  required: boolean;
  timelockSeconds: number;
  qualityThreshold: number;
  programId: string;
  refundSchedule: KamiyoRefundEntry[];
}

export interface KamiyoRefundEntry {
  minQuality: number;
  maxQuality: number;
  refundPercent: number;
}

export interface KamiyoEscrowPayload {
  escrowPda: string;
  transactionId: string;
  agentPk: string;
}

export interface CreditScoringWeights {
  disputeHistory: number;
  paymentHistory: number;
  escrowOutcomes: number;
  tenure: number;
}

export interface KamiyoCreditInfo {
  creditEnabled: boolean;
  maxCollateralMultiplier: number;
  agingHalfLifeDays: number;
  minHistoryForCredit: number;
  scoringWeights: CreditScoringWeights;
}

export interface KamiyoCreditPayload {
  agentPk: string;
  commitment: string;
  requestedCredit: number;
  collateralEscrowPda?: string;
  collateralAmount?: number;
}
