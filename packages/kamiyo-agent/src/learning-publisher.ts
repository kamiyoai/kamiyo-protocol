import type { AgentRunReceipt } from './run-ledger';
import { getReceiptNumber, getReceiptString } from './reconcile';

export type AgentLearningReconcileStatus = 'not_required' | 'pending' | 'finalized';

export interface AgentLearningRunPayload {
  service: string;
  runId: string;
  taskType: string;
  subjectType: string | null;
  subjectId: string | null;
  variantId: string | null;
  variantStrategy: string | null;
  immediateOutcome: string | null;
  immediateQualityScore: number | null;
  delayedOutcome: string | null;
  delayedQualityScore: number | null;
  reconcileStatus: AgentLearningReconcileStatus;
  summary: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AgentLearningPromotionPayload {
  service: string;
  taskType: string;
  variantId: string;
  priorVariantId?: string | null;
  eventKind: string;
  payload?: Record<string, unknown>;
}

export function deriveLearningReconcileStatus(
  receipt: Pick<AgentRunReceipt, 'reconcileAfter' | 'reconciledAt'>
): AgentLearningReconcileStatus {
  if (receipt.reconciledAt) return 'finalized';
  if (receipt.reconcileAfter) return 'pending';
  return 'not_required';
}

export function buildAgentLearningRunPayload(receipt: AgentRunReceipt): AgentLearningRunPayload {
  return {
    service: receipt.service,
    runId: receipt.runId,
    taskType: receipt.taskType,
    subjectType: receipt.subjectType,
    subjectId: receipt.subjectId,
    variantId: receipt.variantId,
    variantStrategy: receipt.variantStrategy,
    immediateOutcome: getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome ?? null,
    immediateQualityScore:
      getReceiptNumber(receipt, 'initialQualityScore') ?? receipt.qualityScore ?? null,
    delayedOutcome: getReceiptString(receipt, 'delayedOutcome'),
    delayedQualityScore: getReceiptNumber(receipt, 'delayedQualityScore'),
    reconcileStatus: deriveLearningReconcileStatus(receipt),
    summary: { ...receipt.receipt },
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  };
}

export async function publishAgentLearningRun(payload: AgentLearningRunPayload): Promise<boolean> {
  return publishAgentLearning('/api/internal/agent-learning/runs', payload);
}

export async function publishAgentLearningPromotion(
  payload: AgentLearningPromotionPayload
): Promise<boolean> {
  return publishAgentLearning('/api/internal/agent-learning/promotions', payload);
}

function logAgentLearningPublishFailure(message: string, error?: unknown): void {
  const suffix = error ? ` ${String(error)}` : '';
  process.stderr.write(`${message}${suffix}\n`);
}

async function publishAgentLearning(path: string, payload: unknown): Promise<boolean> {
  const baseUrl = process.env.AGENT_LEARNING_API_URL?.trim();
  const token = process.env.AGENT_LEARNING_API_TOKEN?.trim();
  if (!baseUrl || !token) return false;

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      logAgentLearningPublishFailure(
        `[agent-learning] publish failed ${response.status} ${response.statusText} for ${path}`
      );
      return false;
    }
    return true;
  } catch (error) {
    logAgentLearningPublishFailure('[agent-learning] publish failed:', error);
    return false;
  }
}
