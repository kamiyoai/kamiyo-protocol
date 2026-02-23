export type AutonomyTaskSource = 'x' | 'api' | 'manual' | 'system';

export type AutonomyTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';

export interface AutonomyTaskInput {
  source: AutonomyTaskSource;
  objective: string;
  requestor?: string;
  priority?: number;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface MeishiDecision {
  allowed: boolean;
  reason: string;
  score?: number;
  compliant?: boolean;
  suspended?: boolean;
  errors?: string[];
}

export interface OpenClawDispatchReceipt {
  accepted: boolean;
  statusCode: number;
  sessionKey: string;
  dispatchedAt: number;
  response?: unknown;
}

export interface AutonomyTask {
  id: string;
  source: AutonomyTaskSource;
  objective: string;
  requestor?: string;
  priority: number;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
  status: AutonomyTaskStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  gate?: MeishiDecision;
  receipt?: OpenClawDispatchReceipt;
  error?: string;
}

export interface AutonomyStatus {
  enabled: boolean;
  running: boolean;
  dryRun: boolean;
  queueSize: number;
  inFlightTaskId: string | null;
  totals: {
    queued: number;
    completed: number;
    blocked: number;
    failed: number;
  };
  lastRunAt: number | null;
  lastError: string | null;
}

