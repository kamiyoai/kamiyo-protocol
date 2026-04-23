export type AgentLearningControlMode = 'auto' | 'paused';
export type AgentLearningCommandKind = 'pause_auto' | 'resume_auto' | 'rollback_active_canary';
export type AgentLearningCommandStatus = 'pending' | 'applied' | 'failed' | 'expired';
export type AgentLearningCanaryStatus = 'inactive' | 'active' | 'promoted' | 'rolled_back';
export type AgentLearningAlertLevel = 'info' | 'warning' | 'error';

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

export interface AgentLearningAlertInput {
  pendingReconciliations: number;
  canarySnapshot: Pick<
    AgentLearningCanarySnapshot,
    'status' | 'decisionKind' | 'decisionReason' | 'canarySamples' | 'baselineSamples'
  > | null;
  backlogThreshold?: number;
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
