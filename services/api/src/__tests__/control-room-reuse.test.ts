import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('control-room reuse', () => {
  let tempDataDir = '';
  let closeDatabase: (() => void) | undefined;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-control-room-reuse-'));
    process.env.DATA_DIR = tempDataDir;
    vi.resetModules();
  });

  afterEach(() => {
    closeDatabase?.();
    closeDatabase = undefined;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('reuses only readonly nodes from the same case and snapshot', async () => {
    const dbModule = await import('../db');
    const reuseModule = await import('../control-room/reuse');
    const db = dbModule.default;
    closeDatabase = dbModule.closeDatabase;

    db.prepare(`
      INSERT INTO swarm_teams (id, name, currency, daily_limit, pool_balance, created_at, updated_at)
      VALUES ('team-1', 'Team', 'USD', 1000, 1000, unixepoch(), unixepoch())
    `).run();

    db.prepare(`
      INSERT INTO counterfactual_cases (
        id, team_id, mission, snapshot_json, snapshot_hash, snapshot_source_type, decision_mode, status, created_at, updated_at
      )
      VALUES ('case-1', 'team-1', 'mission', '{}', 'snap-a', 'manual_evidence', 'score_only', 'ready', unixepoch(), unixepoch())
    `).run();

    db.prepare(`
      INSERT INTO swarm_runs (
        id, team_id, mission, plan_json, status, max_parallel, fail_fast, execution_mode,
        snapshot_hash, counterfactual_case_id, counterfactual_branch_id, created_at, updated_at, started_at
      )
      VALUES
      ('run-readonly', 'team-1', 'mission', '{"mode":"dag","nodes":[]}', 'completed', 1, 1, 'readonly', 'snap-a', 'case-1', 'branch-a', unixepoch(), unixepoch(), unixepoch()),
      ('run-execute', 'team-1', 'mission', '{"mode":"dag","nodes":[]}', 'completed', 1, 1, 'execute', 'snap-a', 'case-1', 'branch-b', unixepoch(), unixepoch(), unixepoch()),
      ('run-other-snapshot', 'team-1', 'mission', '{"mode":"dag","nodes":[]}', 'completed', 1, 1, 'readonly', 'snap-b', 'case-1', 'branch-c', unixepoch(), unixepoch(), unixepoch())
    `).run();

    db.prepare(`
      INSERT INTO swarm_run_nodes (
        id, run_id, node_id, member_id, agent_id, depends_on_json, description,
        budget_reserved, amount_drawn, status, reuse_key, output_json, created_at, updated_at, completed_at
      )
      VALUES
      ('n1', 'run-readonly', 'node-1', 'member-1', 'agent-1', '[]', 'Analyze', 0, 0, 'completed', 'reuse-1', '{"answer":"ok"}', unixepoch(), unixepoch(), unixepoch()),
      ('n2', 'run-execute', 'node-1', 'member-1', 'agent-1', '[]', 'Analyze', 0, 0, 'completed', 'reuse-1', '{"answer":"wrong-mode"}', unixepoch(), unixepoch(), unixepoch()),
      ('n3', 'run-other-snapshot', 'node-1', 'member-1', 'agent-1', '[]', 'Analyze', 0, 0, 'completed', 'reuse-1', '{"answer":"wrong-snapshot"}', unixepoch(), unixepoch(), unixepoch())
    `).run();

    const reusable = reuseModule.findReusableReadonlyNode({
      caseId: 'case-1',
      branchId: 'branch-new',
      snapshotHash: 'snap-a',
      reuseKey: 'reuse-1',
    });

    expect(reusable).toEqual({
      fromRunId: 'run-readonly',
      output: { answer: 'ok' },
    });
  });
});
