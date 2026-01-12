/**
 * Zod schemas for API input/output validation.
 */

import { z } from 'zod';

// Network validation
export const NetworkSchema = z.enum(['mainnet-beta', 'devnet', 'localnet']);

// Config schemas
export const ExtensionConfigSchema = z.object({
  network: NetworkSchema.optional(),
  rpcUrl: z.string().url().optional(),
  qualityThreshold: z.number().min(0).max(100).optional(),
  maxPrice: z.number().positive().optional(),
  autoDispute: z.boolean().optional(),
  disputeTimeoutMs: z.number().positive().optional(),
  privateKey: z.string().optional(),
  storage: z.any().optional(),
  circuitBreaker: z
    .object({
      failureThreshold: z.number().int().positive(),
      resetTimeoutMs: z.number().int().positive(),
      halfOpenRequests: z.number().int().positive(),
    })
    .optional(),
});

export const BatchConfigSchema = z.object({
  maxBatchSize: z.number().int().positive(),
  maxConcurrency: z.number().int().positive(),
  batchDelayMs: z.number().int().nonnegative(),
  continueOnError: z.boolean(),
});

export const RetryConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative(),
  baseDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive(),
  jitter: z.enum(['none', 'full', 'equal']),
  retryOn: z.any().optional(),
});

export const RateLimitConfigSchema = z.object({
  tokensPerSecond: z.number().positive(),
  bucketSize: z.number().int().positive(),
  initialTokens: z.number().int().nonnegative().optional(),
});

export const CacheConfigSchema = z.object({
  maxSize: z.number().int().positive(),
  maxEntries: z.number().int().positive(),
  defaultTTL: z.number().int().positive(),
  staleWhileRevalidate: z.number().int().positive().optional(),
});

// API input schemas
export const ConsumeAPIInputSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  provider: z.string().min(1),
  expectedPrice: z.number().positive(),
  expectedQuality: z.record(z.string(), z.unknown()).optional(),
});

export const CreateEscrowInputSchema = z.object({
  provider: z.string().min(1),
  amount: z.number().positive(),
  expirationMs: z.number().int().positive().optional(),
});

export const FileDisputeInputSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export const CheckBalanceInputSchema = z.object({
  address: z.string().optional(),
});

export const DiscoverAPIsInputSchema = z.object({
  category: z.string().optional(),
  minQuality: z.number().min(0).max(100).optional(),
  maxPrice: z.number().positive().optional(),
});

// ZK reputation schemas
export const GenerateCommitmentInputSchema = z.object({
  score: z.number().int().min(0).max(100),
  salt: z.string().optional(),
});

export const ProveReputationInputSchema = z.object({
  threshold: z.number().int().min(0).max(100),
  tier: z.number().int().min(0).max(4),
});

export const VerifyProofInputSchema = z.object({
  proof: z.string(),
  publicInputs: z.array(z.string()),
  commitment: z.string(),
});

// Output schemas
export const QualityCheckResultSchema = z.object({
  score: z.number().min(0).max(100),
  passesThreshold: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ConsumeAPIOutputSchema = z.object({
  success: z.boolean(),
  response: z.unknown(),
  paymentId: z.string(),
  qualityScore: z.number().min(0).max(100),
  latencyMs: z.number().nonnegative(),
});

export const CreateEscrowOutputSchema = z.object({
  escrowAddress: z.string(),
  transactionId: z.string(),
  expiresAt: z.number().int().positive(),
});

export const FileDisputeOutputSchema = z.object({
  disputeId: z.string(),
  status: z.enum(['pending', 'reviewing', 'resolved', 'rejected']),
  submittedAt: z.number().int().positive(),
});

export const CheckBalanceOutputSchema = z.object({
  balance: z.number().nonnegative(),
  address: z.string(),
});

export const DiscoveredAPISchema = z.object({
  endpoint: z.string().url(),
  provider: z.string(),
  category: z.string(),
  price: z.number().positive(),
  averageQuality: z.number().min(0).max(100),
  totalCalls: z.number().int().nonnegative(),
});

export const DiscoverAPIsOutputSchema = z.object({
  apis: z.array(DiscoveredAPISchema),
  totalCount: z.number().int().nonnegative(),
});

// Health check schemas
export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);

export const ComponentHealthSchema = z.object({
  name: z.string(),
  status: HealthStatusSchema,
  message: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  lastCheck: z.number().int().positive(),
  error: z.string().optional(),
});

export const HealthReportSchema = z.object({
  status: HealthStatusSchema,
  version: z.string(),
  uptime: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  components: z.array(ComponentHealthSchema),
});

// Event payload schemas
export const AgentInitializedEventSchema = z.object({
  agentId: z.string(),
  network: z.string(),
});

export const APIRequestEventSchema = z.object({
  endpoint: z.string(),
  method: z.string(),
  paymentId: z.string(),
});

export const APIResponseEventSchema = z.object({
  endpoint: z.string(),
  paymentId: z.string(),
  status: z.number().int(),
  latencyMs: z.number().nonnegative(),
});

export const EscrowCreatedEventSchema = z.object({
  escrowAddress: z.string(),
  transactionId: z.string(),
  amount: z.number().positive(),
});

export const DisputeResolvedEventSchema = z.object({
  disputeId: z.string(),
  outcome: z.string(),
  refundPercentage: z.number().min(0).max(100),
});

export const ReputationProvedEventSchema = z.object({
  threshold: z.number().int(),
  tier: z.number().int(),
  cached: z.boolean(),
});

// MCP message schemas
export const MCPToolCallRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const MCPToolCallResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z
    .object({
      content: z.array(
        z.object({
          type: z.enum(['text', 'image', 'resource']),
          text: z.string().optional(),
        })
      ),
      isError: z.boolean().optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.number().int(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

// Validation helpers
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function createValidator<T>(schema: z.ZodSchema<T>) {
  return {
    validate: (data: unknown) => validate(schema, data),
    validateOrThrow: (data: unknown) => validateOrThrow(schema, data),
    isValid: (data: unknown): data is T => schema.safeParse(data).success,
    schema,
  };
}

// Pre-built validators
export const validators = {
  network: createValidator(NetworkSchema),
  extensionConfig: createValidator(ExtensionConfigSchema),
  batchConfig: createValidator(BatchConfigSchema),
  retryConfig: createValidator(RetryConfigSchema),
  rateLimitConfig: createValidator(RateLimitConfigSchema),
  cacheConfig: createValidator(CacheConfigSchema),
  consumeAPIInput: createValidator(ConsumeAPIInputSchema),
  createEscrowInput: createValidator(CreateEscrowInputSchema),
  fileDisputeInput: createValidator(FileDisputeInputSchema),
  checkBalanceInput: createValidator(CheckBalanceInputSchema),
  discoverAPIsInput: createValidator(DiscoverAPIsInputSchema),
  generateCommitmentInput: createValidator(GenerateCommitmentInputSchema),
  proveReputationInput: createValidator(ProveReputationInputSchema),
  verifyProofInput: createValidator(VerifyProofInputSchema),
  qualityCheckResult: createValidator(QualityCheckResultSchema),
  consumeAPIOutput: createValidator(ConsumeAPIOutputSchema),
  createEscrowOutput: createValidator(CreateEscrowOutputSchema),
  fileDisputeOutput: createValidator(FileDisputeOutputSchema),
  checkBalanceOutput: createValidator(CheckBalanceOutputSchema),
  discoverAPIsOutput: createValidator(DiscoverAPIsOutputSchema),
  healthReport: createValidator(HealthReportSchema),
  mcpToolCallRequest: createValidator(MCPToolCallRequestSchema),
  mcpToolCallResponse: createValidator(MCPToolCallResponseSchema),
};

// Schema type inference
export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;
export type ConsumeAPIInput = z.infer<typeof ConsumeAPIInputSchema>;
export type CreateEscrowInput = z.infer<typeof CreateEscrowInputSchema>;
export type FileDisputeInput = z.infer<typeof FileDisputeInputSchema>;
export type CheckBalanceInput = z.infer<typeof CheckBalanceInputSchema>;
export type DiscoverAPIsInput = z.infer<typeof DiscoverAPIsInputSchema>;
export type GenerateCommitmentInput = z.infer<typeof GenerateCommitmentInputSchema>;
export type ProveReputationInput = z.infer<typeof ProveReputationInputSchema>;
export type VerifyProofInput = z.infer<typeof VerifyProofInputSchema>;
export type HealthReport = z.infer<typeof HealthReportSchema>;
export type MCPToolCallRequest = z.infer<typeof MCPToolCallRequestSchema>;
export type MCPToolCallResponse = z.infer<typeof MCPToolCallResponseSchema>;
