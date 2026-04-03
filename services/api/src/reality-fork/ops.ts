import db from '../db';
import { getProjectDetail } from './service';
import {
  getRealityForkProjectQuotaUsage,
  getRealityForkQuotaConfig,
  getRealityForkQuotaUsage,
} from './quotas';
import { getRealityForkRetentionSummary } from './retention';

type ProjectTelemetry = {
  eventCount: number;
  eventsByType: Record<string, number>;
  jobs: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    latestError: string | null;
    lastCompletedAt: number | null;
  };
  lastEventAt: number | null;
};

function sumSimulationSpend(projectId: string): number {
  const rows = db
    .prepare(
      `
      SELECT scorecard_json
      FROM reality_fork_simulations
      WHERE project_id = ? AND scorecard_json IS NOT NULL
    `
    )
    .all(projectId) as Array<{ scorecard_json: string }>;

  return rows.reduce((sum, row) => {
    try {
      const parsed = JSON.parse(row.scorecard_json) as {
        metrics?: { totalSpent?: number };
      };
      return sum + (parsed.metrics?.totalSpent ?? 0);
    } catch {
      return sum;
    }
  }, 0);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function estimateProjectBlobBytes(projectId: string): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_blobs
      WHERE id IN (
        SELECT blob_id FROM reality_fork_uploads uploads
        WHERE uploads.id IN (
          SELECT upload_id FROM reality_fork_evidence evidence
          WHERE evidence.project_id = ? AND evidence.upload_id IS NOT NULL
        )
        UNION
        SELECT blob_id FROM reality_fork_evidence WHERE project_id = ? AND blob_id IS NOT NULL
        UNION
        SELECT artifact_blob_id FROM reality_fork_extractions WHERE project_id = ? AND artifact_blob_id IS NOT NULL
        UNION
        SELECT artifact_blob_id FROM reality_fork_simulations WHERE project_id = ? AND artifact_blob_id IS NOT NULL
        UNION
        SELECT markdown_blob_id FROM reality_fork_reports WHERE project_id = ? AND markdown_blob_id IS NOT NULL
        UNION
        SELECT html_blob_id FROM reality_fork_reports WHERE project_id = ? AND html_blob_id IS NOT NULL
        UNION
        SELECT bundle_blob_id FROM reality_fork_publications WHERE project_id = ? AND bundle_blob_id IS NOT NULL
      )
    `
    )
    .get(projectId, projectId, projectId, projectId, projectId, projectId, projectId) as
    | { total_bytes: number }
    | undefined;

  return row?.total_bytes ?? 0;
}

function estimateUploadBytes(projectId: string): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_uploads uploads
      WHERE uploads.id IN (
        SELECT upload_id
        FROM reality_fork_evidence
        WHERE project_id = ? AND upload_id IS NOT NULL
      )
    `
    )
    .get(projectId) as { total_bytes: number } | undefined;

  return row?.total_bytes ?? 0;
}

function buildProjectTelemetry(
  project: NonNullable<ReturnType<typeof getProjectDetail>>
): ProjectTelemetry {
  const eventsByType = project.events.reduce<Record<string, number>>((out, event) => {
    out[event.eventType] = (out[event.eventType] ?? 0) + 1;
    return out;
  }, {});

  return {
    eventCount: project.events.length,
    eventsByType,
    jobs: {
      total: project.jobs.length,
      queued: project.jobs.filter(job => job.status === 'queued').length,
      running: project.jobs.filter(job => job.status === 'running').length,
      completed: project.jobs.filter(job => job.status === 'completed').length,
      failed: project.jobs.filter(job => job.status === 'failed').length,
      latestError: project.jobs.find(job => job.status === 'failed' && job.error)?.error ?? null,
      lastCompletedAt:
        project.jobs
          .filter(job => job.completedAt)
          .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))[0]
          ?.completedAt ?? null,
    },
    lastEventAt: project.events.at(-1)?.createdAt ?? null,
  };
}

export function getRealityForkProjectOps(projectId: string) {
  const project = getProjectDetail(projectId);
  if (!project) return null;

  const quotaConfig = getRealityForkQuotaConfig();
  const quotaUsage = getRealityForkProjectQuotaUsage(projectId);
  const totalBlobBytes = estimateProjectBlobBytes(projectId);
  const uploadBytes = estimateUploadBytes(projectId);
  const simulatedSpend = sumSimulationSpend(projectId);
  const winnerSpend =
    project.simulations.find(
      simulation => simulation.hypothesisId === project.decision?.winnerHypothesisId
    )?.scorecard?.metrics.totalSpent ?? null;
  const runtimeUnits =
    project.simulationConfig.activeAgents *
    project.simulationConfig.rounds *
    project.simulationConfig.lanes.length;
  const estimatedModelUsd = round(
    runtimeUnits * 0.0016 + project.stats.evidenceCount * 0.004 + project.stats.chunkCount * 0.0009
  );
  const estimatedPublishUsd = round(0.02 + (totalBlobBytes / (1024 * 1024)) * 0.0025);

  return {
    projectId: project.id,
    status: project.status,
    quotas: {
      limits: quotaConfig,
      usage: quotaUsage,
      remaining: {
        evidence: Math.max(0, quotaConfig.evidencePerProject - quotaUsage.evidenceCount),
        blobBytes: Math.max(0, quotaConfig.projectBlobBytes - quotaUsage.blobBytes),
        fullJobsToday: Math.max(0, quotaConfig.fullJobsPerProjectPerDay - quotaUsage.fullJobsToday),
        publishJobsToday: Math.max(
          0,
          quotaConfig.publishJobsPerProjectPerDay - quotaUsage.publishJobsToday
        ),
      },
    },
    storage: {
      totalBlobBytes,
      uploadBytes,
      generatedArtifactBytes: Math.max(0, totalBlobBytes - uploadBytes),
      blobBudgetBytes: quotaConfig.projectBlobBytes,
      blobBudgetRemaining: Math.max(0, quotaConfig.projectBlobBytes - totalBlobBytes),
    },
    cost: {
      estimated: {
        runtimeUnits,
        modelUsd: estimatedModelUsd,
        publishUsd: estimatedPublishUsd,
        totalUsd: round(estimatedModelUsd + estimatedPublishUsd),
      },
      actual: {
        simulatedSpend: round(simulatedSpend),
        winnerSpend: winnerSpend == null ? null : round(winnerSpend),
      },
    },
    telemetry: buildProjectTelemetry(project),
    retention: {
      terminal: project.status === 'published' || project.status === 'failed',
      eventRetentionDays: 14,
      hasPublication: Boolean(project.publication),
    },
  };
}

export function getRealityForkUsageOps(clientIp: string | null) {
  const quotaConfig = getRealityForkQuotaConfig();
  const quotaUsage = getRealityForkQuotaUsage(clientIp);
  const projectCounts = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_projects,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_projects,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_projects,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_projects
      FROM reality_fork_projects
    `
    )
    .get() as {
    total_projects: number;
    draft_projects: number | null;
    published_projects: number | null;
    failed_projects: number | null;
  };
  const storage = db
    .prepare(
      `
      SELECT
        COUNT(*) AS blob_count,
        COALESCE(SUM(size_bytes), 0) AS total_blob_bytes
      FROM reality_fork_blobs
    `
    )
    .get() as { blob_count: number; total_blob_bytes: number };
  const uploads = db
    .prepare(
      `
      SELECT COUNT(*) AS upload_count, COALESCE(SUM(size_bytes), 0) AS upload_bytes
      FROM reality_fork_uploads
    `
    )
    .get() as { upload_count: number; upload_bytes: number };
  const jobs = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_jobs,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs
      FROM reality_fork_jobs
    `
    )
    .get() as {
    queued_jobs: number | null;
    running_jobs: number | null;
    completed_jobs: number | null;
    failed_jobs: number | null;
  };
  const events = db
    .prepare(
      `
      SELECT event_type, COUNT(*) AS count
      FROM reality_fork_project_events
      GROUP BY event_type
      ORDER BY count DESC, event_type ASC
    `
    )
    .all() as Array<{ event_type: string; count: number }>;
  const spendRows = db
    .prepare(`SELECT id FROM reality_fork_projects ORDER BY created_at ASC`)
    .all() as Array<{ id: string }>;

  return {
    quotas: {
      client: {
        limits: quotaConfig,
        usage: quotaUsage,
        remaining: {
          projectsToday: Math.max(0, quotaConfig.projectsPerDayPerIp - quotaUsage.projectsToday),
          activeProjects: Math.max(0, quotaConfig.activeProjectsPerIp - quotaUsage.activeProjects),
          publicationsToday: Math.max(
            0,
            quotaConfig.publicationsPerDayPerIp - quotaUsage.publicationsToday
          ),
          uploadsToday: Math.max(0, quotaConfig.uploadsPerDayPerIp - quotaUsage.uploadsToday),
          uploadBytesToday: Math.max(
            0,
            quotaConfig.uploadBytesPerDayPerIp - quotaUsage.uploadBytesToday
          ),
        },
      },
    },
    telemetry: {
      projects: {
        total: projectCounts.total_projects,
        draft: projectCounts.draft_projects ?? 0,
        published: projectCounts.published_projects ?? 0,
        failed: projectCounts.failed_projects ?? 0,
      },
      jobs: {
        queued: jobs.queued_jobs ?? 0,
        running: jobs.running_jobs ?? 0,
        completed: jobs.completed_jobs ?? 0,
        failed: jobs.failed_jobs ?? 0,
      },
      storage: {
        blobCount: storage.blob_count,
        totalBlobBytes: storage.total_blob_bytes,
        uploadCount: uploads.upload_count,
        uploadBytes: uploads.upload_bytes,
      },
      eventsByType: Object.fromEntries(
        events.map(event => [event.event_type, event.count])
      ) as Record<string, number>,
      actualSimulatedSpend: round(
        spendRows.reduce<number>((sum, row) => sum + sumSimulationSpend(row.id), 0)
      ),
    },
    retention: getRealityForkRetentionSummary(),
  };
}
