import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type AgentLearningControlMode = 'auto' | 'paused';
export type AgentLearningCommandKind = 'pause_auto' | 'resume_auto' | 'rollback_active_canary';
export type AgentLearningCommandStatus = 'pending' | 'applied' | 'failed' | 'expired';
export type AgentLearningCanaryStatus = 'inactive' | 'active' | 'promoted' | 'rolled_back';
export type AgentLearningAlertLevel = 'info' | 'warning' | 'error';
export type AgentLearningControlLoopStatus = 'started' | 'succeeded' | 'failed';

export interface AgentLearningAlert {
  code: string;
  level: AgentLearningAlertLevel;
  message: string;
  detectedAt: string;
}

export interface AgentLearningControlState {
  service: string;
  taskType: string;
  mode: AgentLearningControlMode;
  updatedBy: string | null;
  note: string | null;
  updatedAt: string | null;
}

export interface AgentLearningCommand {
  id: string;
  service: string;
  taskType: string;
  kind: AgentLearningCommandKind;
  status: AgentLearningCommandStatus;
  requestedBy: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  result: Record<string, unknown>;
}

export interface AgentLearningCanarySnapshot {
  service: string;
  taskType: string;
  rolloutId: string | null;
  status: AgentLearningCanaryStatus;
  canaryVariantId: string | null;
  baselineVariantId: string | null;
  trafficPct: number | null;
  decisionKind: string | null;
  decisionReason: string | null;
  canarySamples: number | null;
  baselineSamples: number | null;
  uplift: number | null;
  pValue: number | null;
  alerts: AgentLearningAlert[];
  updatedAt?: number | null;
}

export interface AgentLearningControlLoopRun {
  id: string;
  service: string;
  taskType: string;
  trigger: string;
  status: AgentLearningControlLoopStatus;
  processed: number;
  finalized: number;
  requeued: number;
  skipped: number;
  commandsApplied: number;
  commandsFailed: number;
  startedAt: number;
  completedAt?: number | null;
  result: Record<string, unknown>;
}

export interface AgentLearningAlertInput {
  pendingReconciliations: number;
  canarySnapshot: Pick<
    AgentLearningCanarySnapshot,
    'status' | 'decisionKind' | 'decisionReason' | 'canarySamples' | 'baselineSamples'
  > | null;
  unsafeStateReason?: string | null;
  backlogThreshold?: number;
  now?: number | Date;
}

export interface AgentLearningDbPathSafety {
  resolvedPath: string;
  unsafe: boolean;
  reason: string | null;
}

export interface DelayedLearningAutoAdvanceDecision {
  shouldAdvance: boolean;
  blockedReason: string | null;
}

export interface AgentLearningControlLoopAlertInput {
  lastSuccessAt?: string | number | Date | null;
  expectedIntervalMinutes?: number;
  pendingCommandAgeSeconds?: number | null;
  now?: number | Date;
}

export async function fetchAgentLearningControlState(input: {
  service: string;
  taskType: string;
}): Promise<AgentLearningControlState | null> {
  return learningRequest<AgentLearningControlState>(
    `/api/internal/agent-learning/controls?service=${encodeURIComponent(input.service)}&taskType=${encodeURIComponent(input.taskType)}`
  );
}

export async function fetchPendingAgentLearningCommands(input: {
  service: string;
  taskType: string;
  limit?: number;
}): Promise<AgentLearningCommand[]> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const payload = await learningRequest<{ commands?: AgentLearningCommand[] }>(
    `/api/internal/agent-learning/commands?service=${encodeURIComponent(input.service)}&taskType=${encodeURIComponent(input.taskType)}&status=pending&limit=${limit}`
  );
  return Array.isArray(payload?.commands) ? payload.commands : [];
}

export async function acknowledgeAgentLearningCommand(input: {
  id: string;
  status: Exclude<AgentLearningCommandStatus, 'pending'>;
  result?: Record<string, unknown>;
  processedAt?: number | null;
}): Promise<boolean> {
  return learningWrite(
    `/api/internal/agent-learning/commands/${encodeURIComponent(input.id)}/ack`,
    {
      method: 'POST',
      body: {
        status: input.status,
        result: input.result ?? {},
        processedAt:
          typeof input.processedAt === 'number' && Number.isFinite(input.processedAt)
            ? Math.floor(input.processedAt)
            : undefined,
      },
    }
  );
}

export async function publishAgentLearningCanarySnapshot(
  payload: AgentLearningCanarySnapshot
): Promise<boolean> {
  return learningWrite('/api/internal/agent-learning/canary-snapshots', {
    method: 'POST',
    body: {
      ...payload,
      updatedAt:
        typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt)
          ? Math.floor(payload.updatedAt)
          : undefined,
    },
  });
}

export function createAgentLearningControlLoopRunId(service: string): string {
  return `${service}:${randomUUID()}`;
}

export async function publishAgentLearningControlLoopRun(
  payload: AgentLearningControlLoopRun
): Promise<boolean> {
  return learningWrite('/api/internal/agent-learning/control-loop-runs', {
    method: 'POST',
    body: {
      ...payload,
      startedAt: Math.floor(payload.startedAt),
      completedAt:
        typeof payload.completedAt === 'number' && Number.isFinite(payload.completedAt)
          ? Math.floor(payload.completedAt)
          : undefined,
    },
  });
}

export function assessAgentLearningDbPath(input: {
  dbPath: string;
  cwd?: string;
  githubWorkspace?: string | null;
  githubActions?: boolean;
  allowWorkspaceDb?: boolean;
}): AgentLearningDbPathSafety {
  const cwd = input.cwd ?? process.cwd();
  const resolvedPath = path.isAbsolute(input.dbPath)
    ? path.normalize(input.dbPath)
    : path.resolve(cwd, input.dbPath);
  const workspace = input.githubWorkspace?.trim();
  const githubActions = input.githubActions ?? process.env.GITHUB_ACTIONS === 'true';
  const allowWorkspaceDb =
    input.allowWorkspaceDb ?? process.env.AGENT_LEARNING_ALLOW_WORKSPACE_DB === 'true';

  if (!githubActions || !workspace || allowWorkspaceDb) {
    return { resolvedPath, unsafe: false, reason: null };
  }

  const resolvedWorkspace = path.resolve(workspace);
  const relative = path.relative(resolvedWorkspace, resolvedPath);
  const insideWorkspace =
    relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));

  if (!insideWorkspace) {
    return { resolvedPath, unsafe: false, reason: null };
  }

  return {
    resolvedPath,
    unsafe: true,
    reason:
      'agent_db_inside_github_workspace; move the DB outside checkout cleanup or set AGENT_LEARNING_ALLOW_WORKSPACE_DB=true',
  };
}

export function decideDelayedLearningAutoAdvance(input: {
  controlState?: Pick<AgentLearningControlState, 'mode'> | null;
  commandsFailed?: number;
  rollbackApplied?: boolean;
  unsafeStateReason?: string | null;
}): DelayedLearningAutoAdvanceDecision {
  if (input.controlState?.mode === 'paused') {
    return { shouldAdvance: false, blockedReason: 'control_mode_paused' };
  }
  if ((input.commandsFailed ?? 0) > 0) {
    return { shouldAdvance: false, blockedReason: 'operator_command_failed' };
  }
  if (input.rollbackApplied) {
    return { shouldAdvance: false, blockedReason: 'rollback_command_applied' };
  }
  if (input.unsafeStateReason) {
    return { shouldAdvance: false, blockedReason: input.unsafeStateReason };
  }
  return { shouldAdvance: true, blockedReason: null };
}

export function deriveAgentLearningAlerts(input: AgentLearningAlertInput): AgentLearningAlert[] {
  const alerts: AgentLearningAlert[] = [];
  const backlogThreshold = Math.max(1, input.backlogThreshold ?? 5);
  const detectedAt = toIso(
    typeof input.now === 'number'
      ? input.now
      : input.now instanceof Date
        ? input.now.getTime()
        : Date.now()
  );

  if (input.pendingReconciliations >= backlogThreshold) {
    alerts.push({
      code: 'pending_reconciliation_backlog',
      level: 'warning',
      message: `${input.pendingReconciliations} receipts are still waiting on reconciliation.`,
      detectedAt,
    });
  }

  if (
    input.canarySnapshot?.status === 'active' &&
    input.canarySnapshot.decisionKind === 'hold' &&
    input.canarySnapshot.decisionReason
  ) {
    alerts.push({
      code: 'active_canary_stalled',
      level: 'warning',
      message: `Active canary is holding: ${input.canarySnapshot.decisionReason}.`,
      detectedAt,
    });
  }

  if (input.unsafeStateReason) {
    alerts.push({
      code: 'unsafe_agent_state_path',
      level: 'error',
      message: input.unsafeStateReason,
      detectedAt,
    });
  }

  return dedupeAlerts(alerts);
}

export function deriveAgentLearningControlLoopAlerts(
  input: AgentLearningControlLoopAlertInput
): AgentLearningAlert[] {
  const alerts: AgentLearningAlert[] = [];
  const expectedIntervalMinutes = Math.max(1, input.expectedIntervalMinutes ?? 30);
  const nowMs =
    typeof input.now === 'number'
      ? input.now
      : input.now instanceof Date
        ? input.now.getTime()
        : Date.now();
  const detectedAt = toIso(nowMs);
  const lastSuccessMs = parseMaybeTime(input.lastSuccessAt);

  if (lastSuccessMs !== null && nowMs - lastSuccessMs > expectedIntervalMinutes * 3 * 60 * 1000) {
    alerts.push({
      code: 'stale_control_loop',
      level: 'warning',
      message: `No successful learning control loop has reported in more than ${expectedIntervalMinutes * 3} minutes.`,
      detectedAt,
    });
  }

  if (
    typeof input.pendingCommandAgeSeconds === 'number' &&
    input.pendingCommandAgeSeconds > expectedIntervalMinutes * 60
  ) {
    alerts.push({
      code: 'pending_operator_command',
      level: 'warning',
      message: `An operator command has been pending for ${Math.round(input.pendingCommandAgeSeconds / 60)} minutes.`,
      detectedAt,
    });
  }

  return dedupeAlerts(alerts);
}

async function learningRequest<T>(path: string): Promise<T | null> {
  const config = getLearningApiConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function learningWrite(
  path: string,
  input: { method: 'POST'; body: Record<string, unknown> }
): Promise<boolean> {
  const config = getLearningApiConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input.body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getLearningApiConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.AGENT_LEARNING_API_URL?.trim();
  const token = process.env.AGENT_LEARNING_API_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
  };
}

function dedupeAlerts(alerts: AgentLearningAlert[]): AgentLearningAlert[] {
  const seen = new Set<string>();
  const deduped: AgentLearningAlert[] = [];
  for (const alert of alerts) {
    const key = `${alert.code}:${alert.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alert);
  }
  return deduped;
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function parseMaybeTime(value: string | number | Date | null | undefined): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
