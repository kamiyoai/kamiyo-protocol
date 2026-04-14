import db from '../db';
import { getSwarmRunDetail } from '../swarm/service';
import { listCaseEvents } from './events';
import type { ControlRoomBranchPlan } from './types';

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function loadCaseRow(teamId: string, caseId: string) {
  return db
    .prepare(
      `
    SELECT *
    FROM counterfactual_cases
    WHERE id = ? AND team_id = ?
  `
    )
    .get(caseId, teamId) as any;
}

function loadBranches(caseId: string) {
  return db
    .prepare(
      `
    SELECT *
    FROM counterfactual_branches
    WHERE case_id = ?
    ORDER BY created_at ASC, id ASC
  `
    )
    .all(caseId) as any[];
}

export function loadControlRoomCaseDetail(teamId: string, caseId: string) {
  const row = loadCaseRow(teamId, caseId);
  if (!row) return null;

  const branches = loadBranches(caseId);
  return {
    caseId: row.id,
    id: row.id,
    teamId: row.team_id,
    mission: row.mission,
    status: row.status,
    decisionMode: row.decision_mode,
    snapshotHash: row.snapshot_hash,
    source: {
      type: row.snapshot_source_type,
      ref: row.snapshot_source_ref ?? null,
    },
    winnerBranchId: row.winner_branch_id ?? null,
    promotedRunId: row.promoted_run_id ?? null,
    error: row.error ?? null,
    createdByWallet: row.created_by_wallet ?? null,
    createdAt: row.created_at * 1000,
    completedAt: row.completed_at ? row.completed_at * 1000 : null,
    snapshot: JSON.parse(row.snapshot_json),
    branches: branches.map(branch => {
      const branchPlan = JSON.parse(branch.plan_json) as ControlRoomBranchPlan;
      return {
        branchId: branch.id,
        policyPackId: branch.policy_pack_id,
        branchKind: branch.branch_kind,
        status: branch.status,
        swarmRunId: branch.swarm_run_id ?? null,
        resultHash: branch.result_hash ?? null,
        plan: branchPlan.plan,
        maxParallel: branchPlan.maxParallel,
        failFast: branchPlan.failFast,
        scorecard: parseJson(branch.scorecard_json),
        committee: parseJson(branch.committee_json),
        run: branch.swarm_run_id ? getSwarmRunDetail(teamId, branch.swarm_run_id) : null,
        createdAt: branch.created_at * 1000,
        completedAt: branch.completed_at ? branch.completed_at * 1000 : null,
      };
    }),
    events: listCaseEvents(caseId),
  };
}
