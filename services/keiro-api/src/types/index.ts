import { z } from 'zod';

export const AgentPersonalitySchema = z.enum([
  'professional',
  'creative',
  'efficient',
  'balanced',
]);

export const AgentSkillSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*[a-zA-Z0-9]$/, 'Invalid skill tag');

export const AgentTierSchema = z.enum([
  'unverified',
  'bronze',
  'silver',
  'gold',
  'platinum',
]);

export const AgentSchema = z.object({
  id: z.string(),
  walletAddress: z.string(),
  name: z.string(),
  personality: AgentPersonalitySchema,
  skills: z.array(AgentSkillSchema),
  tier: AgentTierSchema,
  creditScore: z.number().min(0).max(100),
  tasksCompleted: z.number().min(0),
  disputeCount: z.number().min(0),
  tenureDays: z.number().min(0),
  avgQuality: z.number().min(0).max(100),
  isActive: z.boolean(),
  createdAt: z.string(),
  globalId: z.string().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentPersonality = z.infer<typeof AgentPersonalitySchema>;
export type AgentSkill = z.infer<typeof AgentSkillSchema>;
export type AgentTier = z.infer<typeof AgentTierSchema>;

export const JobStatusSchema = z.enum([
  'open',
  'assigned',
  'in_progress',
  'submitted',
  'completed',
  'disputed',
  'cancelled',
]);

export const ObjectiveVerificationSchema = z.enum([
  'objective',
  'hybrid',
  'manual',
]);

export const ObjectiveSpecSchema = z.object({
  acceptanceCriteria: z.array(z.string().min(4).max(180)).min(1).max(8),
  verification: ObjectiveVerificationSchema,
  evidenceRequired: z.boolean(),
});

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  requiredSkills: z.array(AgentSkillSchema),
  requiredTier: AgentTierSchema,
  payment: z.number().positive(),
  paymentToken: z.enum(['SOL', 'USDC']),
  estimatedTime: z.string(),
  poster: z.string(),
  posterAddress: z.string(),
  status: JobStatusSchema,
  assignedAgent: z.string().optional(),
  escrowId: z.string().optional(),
  objectiveSpec: ObjectiveSpecSchema,
  minimumCreditScore: z.number().min(0).max(100),
  createdAt: z.string(),
  deadline: z.string().optional(),
});

export type Job = z.infer<typeof JobSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ObjectiveSpec = z.infer<typeof ObjectiveSpecSchema>;

export const TaskSubmissionSchema = z.object({
  jobId: z.string(),
  agentId: z.string(),
  result: z.string().min(1).max(50000),
  proof: z.string().max(10000).optional(),
  submittedAt: z.string(),
});

export type TaskSubmission = z.infer<typeof TaskSubmissionSchema>;

export const EarningSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  jobId: z.string(),
  amount: z.number(),
  token: z.enum(['SOL', 'USDC']),
  status: z.enum(['pending', 'released', 'disputed']),
  createdAt: z.string(),
  releasedAt: z.string().optional(),
});

export type Earning = z.infer<typeof EarningSchema>;

export const CreateAgentRequestSchema = z.object({
  walletAddress: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address'),
  name: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[\w\s-]+$/, 'Name can only contain letters, numbers, spaces, and hyphens'),
  personality: AgentPersonalitySchema,
  skills: z.array(AgentSkillSchema).min(1).max(24),
});

export const AcceptJobRequestSchema = z.object({
  agentId: z.string().min(1).max(64),
  walletAddress: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address'),
});

export const StartJobRequestSchema = z.object({
  agentId: z.string().min(1).max(64),
  walletAddress: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address'),
});

export const SubmitTaskRequestSchema = z.object({
  agentId: z.string().min(1).max(64),
  result: z.string().min(1).max(50000),
  proof: z.string().max(10000).optional(),
});

export const RateTaskRequestSchema = z.object({
  rating: z.number().min(1).max(5),
  feedback: z.string().optional(),
});

export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;
export type AcceptJobRequest = z.infer<typeof AcceptJobRequestSchema>;
export type StartJobRequest = z.infer<typeof StartJobRequestSchema>;
export type SubmitTaskRequest = z.infer<typeof SubmitTaskRequestSchema>;
export type RateTaskRequest = z.infer<typeof RateTaskRequestSchema>;

export const JurisdictionSchema = z.enum(['global', 'eu', 'us', 'uk', 'apac']);
export const ComplianceClassSchema = z.enum([
  'unclassified',
  'minimal',
  'limited',
  'high',
  'unacceptable',
]);
export const SuspensionReasonSchema = z.enum([
  'none',
  'compliance_failure',
  'fraud_detected',
  'mandate_expired',
  'oracle_consensus',
]);

export const MeishiPassportSchema = z.object({
  agentIdentity: z.string(),
  issuer: z.string(),
  principal: z.string(),
  kamonHash: z.string(),
  complianceClass: ComplianceClassSchema,
  complianceScore: z.number(),
  jurisdiction: JurisdictionSchema,
  mandateHash: z.string(),
  mandateExpires: z.string(),
  mandateVersion: z.number(),
  totalTransactions: z.number(),
  totalVolumeUsd: z.number(),
  disputesFiled: z.number(),
  disputesLost: z.number(),
  lastAudit: z.string(),
  auditNonce: z.number(),
  suspended: z.boolean(),
  suspensionReason: SuspensionReasonSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MeishiMandateSchema = z.object({
  version: z.number(),
  spendingLimitUsd: z.number(),
  dailyLimitUsd: z.number(),
  monthlyLimitUsd: z.number(),
  requiresHumanApprovalAbove: z.number(),
  geoRestrictions: z.array(JurisdictionSchema),
  validFrom: z.string(),
  validUntil: z.string(),
  revoked: z.boolean(),
});

export type MeishiPassport = z.infer<typeof MeishiPassportSchema>;
export type MeishiMandate = z.infer<typeof MeishiMandateSchema>;
