import type { IAgentRuntime } from '../types';

export type TrustEvidenceType =
  | 'PROMISE_KEPT'
  | 'PROMISE_BROKEN'
  | 'HELPFUL_ACTION'
  | 'HARMFUL_ACTION'
  | 'CONSISTENT_BEHAVIOR'
  | 'VERIFIED_IDENTITY'
  | 'COMMUNITY_CONTRIBUTION'
  | 'SUCCESSFUL_TRANSACTION'
  | 'INCONSISTENT_BEHAVIOR'
  | 'SUSPICIOUS_ACTIVITY'
  | 'FAILED_VERIFICATION'
  | 'SPAM_BEHAVIOR'
  | 'SECURITY_VIOLATION'
  | 'IDENTITY_CHANGE'
  | 'ROLE_CHANGE'
  | 'CONTEXT_SWITCH';

export interface TrustContext {
  evaluatorId: string;
  roomId?: string;
  worldId?: string;
  platform?: string;
  action?: string;
  [key: string]: unknown;
}

export interface TrustInteraction {
  sourceEntityId: string;
  targetEntityId: string;
  type: TrustEvidenceType;
  timestamp: number;
  impact: number;
  details?: {
    description?: string;
    messageId?: string;
    roomId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  context?: TrustContext;
}

export interface TrustEngine {
  recordInteraction?: (interaction: TrustInteraction) => Promise<void>;
  calculateTrust?: (entityId: string, context: TrustContext) => Promise<{ overallTrust: number } | null>;
}

export function getTrustEngine(runtime: IAgentRuntime): TrustEngine | null {
  const service = (runtime as any).getService?.('trust-engine') as unknown;
  if (!service || typeof service !== 'object') return null;

  const recordInteraction =
    pickFn<TrustEngine['recordInteraction']>(service, 'recordInteraction') ??
    pickFn<TrustEngine['recordInteraction']>((service as any).trustEngine, 'recordInteraction');

  const calculateTrust =
    pickFn<TrustEngine['calculateTrust']>(service, 'calculateTrust') ??
    pickFn<TrustEngine['calculateTrust']>((service as any).trustEngine, 'calculateTrust');

  if (!recordInteraction && !calculateTrust) return null;
  return {
    recordInteraction: recordInteraction ?? undefined,
    calculateTrust: calculateTrust ?? undefined,
  };
}

function pickFn<T extends ((...args: any[]) => any) | undefined>(owner: unknown, key: string): T | null {
  if (!owner || typeof owner !== 'object') return null;
  const fn = (owner as any)[key];
  if (typeof fn !== 'function') return null;
  return fn.bind(owner) as T;
}
