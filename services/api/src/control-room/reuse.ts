import db from '../db';
import { hashJson } from '../mcp/truth-court/hash.js';

function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ');
}

function unwrapStoredOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if ((value as Record<string, unknown>).reused === true && 'output' in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).output;
  }
  return value;
}

export function dependencyHash(
  deps: Array<{ id: string; result: { status: string; output?: unknown; error?: string } }>
): string {
  return hashJson(
    deps
      .map((dep) => ({
        id: dep.id,
        outputHash: dep.result.status === 'completed'
          ? hashJson((dep.result.output as any)?.output ?? null)
          : null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

export function computeReuseKey(params: {
  snapshotHash: string;
  memberId: string;
  description: string;
  dependencyHash: string;
}): string {
  return hashJson({
    snapshotHash: params.snapshotHash,
    memberId: params.memberId,
    description: normalizeDescription(params.description),
    dependencyHash: params.dependencyHash,
  });
}

export function findReusableReadonlyNode(params: {
  caseId: string;
  branchId: string | null;
  snapshotHash: string;
  reuseKey: string;
}): { fromRunId: string; output: unknown } | null {
  const row = db.prepare(`
    SELECT runs.id AS run_id, nodes.output_json
    FROM swarm_run_nodes nodes
    INNER JOIN swarm_runs runs ON runs.id = nodes.run_id
    WHERE
      runs.counterfactual_case_id = ?
      AND runs.execution_mode = 'readonly'
      AND runs.snapshot_hash = ?
      AND nodes.reuse_key = ?
      AND nodes.status = 'completed'
      AND (? IS NULL OR runs.counterfactual_branch_id <> ?)
    ORDER BY nodes.completed_at DESC, runs.started_at DESC
    LIMIT 1
  `).get(
    params.caseId,
    params.snapshotHash,
    params.reuseKey,
    params.branchId,
    params.branchId
  ) as { run_id: string; output_json: string | null } | undefined;

  if (!row) return null;

  return {
    fromRunId: row.run_id,
    output: row.output_json ? unwrapStoredOutput(JSON.parse(row.output_json)) : null,
  };
}
