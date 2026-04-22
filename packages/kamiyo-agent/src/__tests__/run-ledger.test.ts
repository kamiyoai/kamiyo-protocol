import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyAgentSchema } from '../schema';
import {
  getAgentRunReceipt,
  listPendingAgentRunReceipts,
  recordAgentRunReceipt,
  updateAgentRunReceipt,
  updateLatestAgentRunReceipt,
} from '../run-ledger';

function freshDb() {
  const db = new Database(':memory:');
  applyAgentSchema(db);
  return db;
}

describe('run ledger', () => {
  it('records and retrieves a run receipt', () => {
    const db = freshDb();

    const receipt = recordAgentRunReceipt(db, {
      runId: 'run-1',
      agentId: 'agent-a',
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
      subjectType: 'issue',
      subjectId: '212',
      variantId: 'variant-1',
      variantStrategy: 'promoted',
      outcome: 'opened_pr',
      qualityScore: 0.91,
      durationMs: 1200,
      receipt: {
        issueNumber: 212,
        prUrl: 'https://example.com/pr/1',
      },
      reconcileAfter: 1_700_000_000,
    });

    expect(receipt.runId).toBe('run-1');
    expect(receipt.subjectType).toBe('issue');
    expect(receipt.receipt.prUrl).toBe('https://example.com/pr/1');

    const fetched = getAgentRunReceipt(db, 'run-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.qualityScore).toBe(0.91);
  });

  it('updates an existing run receipt in place', () => {
    const db = freshDb();

    recordAgentRunReceipt(db, {
      runId: 'run-2',
      agentId: 'agent-b',
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      subjectType: 'merge',
      subjectId: 'abc123',
      receipt: {
        mergeSha: 'abc123',
        followUpBranch: null,
      },
    });

    const updated = updateAgentRunReceipt(db, 'run-2', {
      outcome: 'updated_docs',
      qualityScore: 0.88,
      receipt: {
        followUpBranch: 'docs-agent/regen-abc123',
        followUpPrUrl: 'https://example.com/pr/2',
      },
      reconciledAt: 1_700_000_123,
    });

    expect(updated).not.toBeNull();
    expect(updated?.outcome).toBe('updated_docs');
    expect(updated?.receipt.mergeSha).toBe('abc123');
    expect(updated?.receipt.followUpBranch).toBe('docs-agent/regen-abc123');
    expect(updated?.reconciledAt).toBe(1_700_000_123);
  });

  it('updates the latest receipt for a subject lookup', () => {
    const db = freshDb();

    recordAgentRunReceipt(db, {
      runId: 'run-old',
      agentId: 'agent-c',
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      subjectType: 'merge',
      subjectId: 'sha-1',
      receipt: { mergeSha: 'sha-1', version: 'old' },
    });

    recordAgentRunReceipt(db, {
      runId: 'run-new',
      agentId: 'agent-c',
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      subjectType: 'merge',
      subjectId: 'sha-1',
      receipt: { mergeSha: 'sha-1', version: 'new' },
    });

    const updated = updateLatestAgentRunReceipt(
      db,
      {
        service: 'kamiyo-docs-agent',
        subjectType: 'merge',
        subjectId: 'sha-1',
      },
      {
        receipt: { followUpPrNumber: 42 },
      }
    );

    expect(updated?.runId).toBe('run-new');
    expect(updated?.receipt.followUpPrNumber).toBe(42);
  });

  it('lists pending receipts that are due for reconciliation', () => {
    const db = freshDb();

    recordAgentRunReceipt(db, {
      runId: 'run-pending',
      agentId: 'agent-d',
      service: 'kamiyo-marketing-agent',
      taskType: 'marketing_post_drafting',
      reconcileAfter: 500,
      receipt: { scheduledIds: ['p1'] },
    });
    recordAgentRunReceipt(db, {
      runId: 'run-future',
      agentId: 'agent-d',
      service: 'kamiyo-marketing-agent',
      taskType: 'marketing_post_drafting',
      reconcileAfter: 5_000,
      receipt: { scheduledIds: ['p2'] },
    });
    recordAgentRunReceipt(db, {
      runId: 'run-done',
      agentId: 'agent-d',
      service: 'kamiyo-marketing-agent',
      taskType: 'marketing_post_drafting',
      reconcileAfter: 400,
      reconciledAt: 450,
      receipt: { scheduledIds: ['p3'] },
    });

    const pending = listPendingAgentRunReceipts(db, {
      now: 1_000,
      service: 'kamiyo-marketing-agent',
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.runId).toBe('run-pending');
  });
});
