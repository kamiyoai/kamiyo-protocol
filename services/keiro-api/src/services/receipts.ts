import crypto from 'node:crypto';
import type { Agent } from '../types/index.js';

export type ReceiptKind =
  | 'job_accepted'
  | 'job_submitted'
  | 'earning_created'
  | 'job_disputed';

export interface Receipt {
  id: string;
  agentId: string;
  agentIdentity: string;
  kind: ReceiptKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const receipts = new Map<string, Receipt>();
const receiptsByAgent = new Map<string, string[]>();

function newId(): string {
  return crypto.randomUUID();
}

function pushAgentReceipt(agentId: string, receiptId: string) {
  const next = [receiptId, ...(receiptsByAgent.get(agentId) ?? [])].slice(0, 200);
  receiptsByAgent.set(agentId, next);
}

export const receiptService = {
  create(params: {
    agent: Agent;
    kind: ReceiptKind;
    summary: string;
    payload: Record<string, unknown>;
  }): Receipt {
    const id = newId();
    const receipt: Receipt = {
      id,
      agentId: params.agent.id,
      agentIdentity: params.agent.walletAddress,
      kind: params.kind,
      summary: params.summary,
      payload: params.payload,
      createdAt: new Date().toISOString(),
    };

    receipts.set(id, receipt);
    pushAgentReceipt(params.agent.id, id);

    return receipt;
  },

  getById(id: string): Receipt | null {
    return receipts.get(id) ?? null;
  },

  listByAgent(agentId: string, limit = 50): Receipt[] {
    const ids = receiptsByAgent.get(agentId) ?? [];
    const out: Receipt[] = [];
    for (const id of ids.slice(0, limit)) {
      const r = receipts.get(id);
      if (r) out.push(r);
    }
    return out;
  },
};
