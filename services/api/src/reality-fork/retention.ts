import db from '../db';

export type RealityForkRetentionConfig = {
  orphanUploadHours: number;
  terminalProjectDays: number;
  draftProjectDays: number;
  projectEventDays: number;
};

export type RealityForkRetentionSummary = {
  evaluatedAt: number;
  orphanUploads: {
    count: number;
    oldestCreatedAt: number | null;
  };
  staleDraftProjects: {
    count: number;
    oldestCreatedAt: number | null;
  };
  terminalProjects: {
    count: number;
    oldestPublishedAt: number | null;
  };
  oldProjectEvents: {
    count: number;
    oldestCreatedAt: number | null;
  };
};

export type RealityForkRetentionRunResult = {
  deletedUploads: number;
  deletedProjectEvents: number;
  summary: RealityForkRetentionSummary;
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRealityForkRetentionConfig(
  env: NodeJS.ProcessEnv = process.env
): RealityForkRetentionConfig {
  return {
    orphanUploadHours: parseIntEnv(env.REALITY_FORK_RETENTION_ORPHAN_UPLOAD_HOURS, 24),
    terminalProjectDays: parseIntEnv(env.REALITY_FORK_RETENTION_TERMINAL_PROJECT_DAYS, 30),
    draftProjectDays: parseIntEnv(env.REALITY_FORK_RETENTION_DRAFT_PROJECT_DAYS, 7),
    projectEventDays: parseIntEnv(env.REALITY_FORK_RETENTION_PROJECT_EVENT_DAYS, 14),
  };
}

function nowUnix(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}

type CountRow = {
  count: number;
  oldest_created_at?: number | null;
  oldest_published_at?: number | null;
};

function orphanUploadIds(cutoff: number): string[] {
  const rows = db
    .prepare(
      `
      SELECT uploads.id
      FROM reality_fork_uploads uploads
      LEFT JOIN reality_fork_evidence evidence ON evidence.upload_id = uploads.id
      WHERE evidence.id IS NULL AND uploads.created_at < ?
    `
    )
    .all(cutoff) as Array<{ id: string }>;

  return rows.map(row => row.id);
}

function oldProjectEventIds(cutoff: number): string[] {
  const rows = db
    .prepare(
      `
      SELECT events.id
      FROM reality_fork_project_events events
      INNER JOIN reality_fork_projects projects ON projects.id = events.project_id
      WHERE events.created_at < ?
        AND projects.status IN ('published', 'failed')
    `
    )
    .all(cutoff) as Array<{ id: string }>;

  return rows.map(row => row.id);
}

export function getRealityForkRetentionSummary(
  options: { nowMs?: number; config?: RealityForkRetentionConfig } = {}
): RealityForkRetentionSummary {
  const nowMs = options.nowMs ?? Date.now();
  const config = options.config ?? getRealityForkRetentionConfig();
  const now = nowUnix(nowMs);
  const orphanUploadCutoff = now - config.orphanUploadHours * 60 * 60;
  const staleDraftCutoff = now - config.draftProjectDays * 24 * 60 * 60;
  const terminalProjectCutoff = now - config.terminalProjectDays * 24 * 60 * 60;
  const projectEventCutoff = now - config.projectEventDays * 24 * 60 * 60;

  const orphanUploads = db
    .prepare(
      `
      SELECT COUNT(*) AS count, MIN(uploads.created_at) AS oldest_created_at
      FROM reality_fork_uploads uploads
      LEFT JOIN reality_fork_evidence evidence ON evidence.upload_id = uploads.id
      WHERE evidence.id IS NULL AND uploads.created_at < ?
    `
    )
    .get(orphanUploadCutoff) as CountRow;
  const staleDraftProjects = db
    .prepare(
      `
      SELECT COUNT(*) AS count, MIN(created_at) AS oldest_created_at
      FROM reality_fork_projects
      WHERE status IN ('draft', 'failed') AND created_at < ?
    `
    )
    .get(staleDraftCutoff) as CountRow;
  const terminalProjects = db
    .prepare(
      `
      SELECT COUNT(*) AS count, MIN(published_at) AS oldest_published_at
      FROM reality_fork_projects
      WHERE status IN ('published', 'failed') AND COALESCE(published_at, created_at) < ?
    `
    )
    .get(terminalProjectCutoff) as CountRow;
  const oldProjectEvents = db
    .prepare(
      `
      SELECT COUNT(*) AS count, MIN(events.created_at) AS oldest_created_at
      FROM reality_fork_project_events events
      INNER JOIN reality_fork_projects projects ON projects.id = events.project_id
      WHERE events.created_at < ?
        AND projects.status IN ('published', 'failed')
    `
    )
    .get(projectEventCutoff) as CountRow;

  return {
    evaluatedAt: nowMs,
    orphanUploads: {
      count: orphanUploads.count,
      oldestCreatedAt: orphanUploads.oldest_created_at
        ? orphanUploads.oldest_created_at * 1000
        : null,
    },
    staleDraftProjects: {
      count: staleDraftProjects.count,
      oldestCreatedAt: staleDraftProjects.oldest_created_at
        ? staleDraftProjects.oldest_created_at * 1000
        : null,
    },
    terminalProjects: {
      count: terminalProjects.count,
      oldestPublishedAt: terminalProjects.oldest_published_at
        ? terminalProjects.oldest_published_at * 1000
        : null,
    },
    oldProjectEvents: {
      count: oldProjectEvents.count,
      oldestCreatedAt: oldProjectEvents.oldest_created_at
        ? oldProjectEvents.oldest_created_at * 1000
        : null,
    },
  };
}

export function runRealityForkRetention(
  options: { nowMs?: number; config?: RealityForkRetentionConfig } = {}
): RealityForkRetentionRunResult {
  const nowMs = options.nowMs ?? Date.now();
  const config = options.config ?? getRealityForkRetentionConfig();
  const now = nowUnix(nowMs);
  const orphanUploadCutoff = now - config.orphanUploadHours * 60 * 60;
  const projectEventCutoff = now - config.projectEventDays * 24 * 60 * 60;

  const uploads = orphanUploadIds(orphanUploadCutoff);
  const events = oldProjectEventIds(projectEventCutoff);

  let deletedUploads = 0;
  let deletedProjectEvents = 0;

  if (uploads.length > 0) {
    const placeholders = uploads.map(() => '?').join(', ');
    deletedUploads = db
      .prepare(`DELETE FROM reality_fork_uploads WHERE id IN (${placeholders})`)
      .run(...uploads).changes;
  }

  if (events.length > 0) {
    const placeholders = events.map(() => '?').join(', ');
    deletedProjectEvents = db
      .prepare(`DELETE FROM reality_fork_project_events WHERE id IN (${placeholders})`)
      .run(...events).changes;
  }

  return {
    deletedUploads,
    deletedProjectEvents,
    summary: getRealityForkRetentionSummary({ nowMs, config }),
  };
}
