import db from '../db';
import { getProjectDetail } from './service';
import {
  getRealityForkProjectQuotaUsage,
  getRealityForkQuotaConfig,
  getRealityForkQuotaState,
  getRealityForkQuotaUsage,
} from './quotas';
import { getRealityForkRetentionSummary } from './retention';

type ProjectDetail = NonNullable<ReturnType<typeof getProjectDetail>>;
type ProjectStageName = 'ingest' | 'extraction' | 'simulation' | 'report';

type ProjectStageTiming = {
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  status: 'missing' | 'running' | 'completed';
};

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
  stageTimings: Record<ProjectStageName, ProjectStageTiming>;
  lastEventAt: number | null;
};

type ProjectStorageBreakdown = {
  totalBlobBytes: number;
  inputBlobBytes: number;
  uploadBytes: number;
  directEvidenceBytes: number;
  generatedArtifactBytes: number;
  extractionArtifactBytes: number;
  simulationArtifactBytes: number;
  reportArtifactBytes: number;
  publicationArtifactBytes: number;
  blobBudgetBytes: number;
  blobBudgetRemaining: number;
};

type ProjectCostBreakdown = {
  byStage: Record<
    ProjectStageName,
    {
      estimatedUsd: number;
      actualUsd: number | null;
    }
  >;
  runtimeUnits: number;
  estimated: {
    modelUsd: number;
    publishUsd: number;
    totalUsd: number;
  };
  actual: {
    simulatedSpend: number;
    winnerSpend: number | null;
    totalUsd: number;
  };
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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

function sumBlobBytesByQuery(sql: string, params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { total_bytes: number } | undefined;
  return row?.total_bytes ?? 0;
}

function estimateProjectBlobBytes(projectId: string): number {
  return sumBlobBytesByQuery(
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
    `,
    [projectId, projectId, projectId, projectId, projectId, projectId, projectId]
  );
}

function estimateUploadBytes(projectId: string): number {
  return sumBlobBytesByQuery(
    `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_uploads uploads
      WHERE uploads.id IN (
        SELECT upload_id
        FROM reality_fork_evidence
        WHERE project_id = ? AND upload_id IS NOT NULL
      )
    `,
    [projectId]
  );
}

function estimateDirectEvidenceBytes(projectId: string): number {
  return sumBlobBytesByQuery(
    `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_blobs
      WHERE id IN (
        SELECT blob_id
        FROM reality_fork_evidence
        WHERE project_id = ? AND upload_id IS NULL AND blob_id IS NOT NULL
      )
    `,
    [projectId]
  );
}

function estimateArtifactBytes(
  table: 'reality_fork_extractions' | 'reality_fork_simulations',
  projectId: string
): number {
  return sumBlobBytesByQuery(
    `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_blobs
      WHERE id IN (
        SELECT artifact_blob_id
        FROM ${table}
        WHERE project_id = ? AND artifact_blob_id IS NOT NULL
      )
    `,
    [projectId]
  );
}

function estimateReportBytes(projectId: string): number {
  return sumBlobBytesByQuery(
    `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_blobs
      WHERE id IN (
        SELECT markdown_blob_id FROM reality_fork_reports WHERE project_id = ? AND markdown_blob_id IS NOT NULL
        UNION
        SELECT html_blob_id FROM reality_fork_reports WHERE project_id = ? AND html_blob_id IS NOT NULL
      )
    `,
    [projectId, projectId]
  );
}

function estimatePublicationBytes(projectId: string): number {
  return sumBlobBytesByQuery(
    `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_blobs
      WHERE id IN (
        SELECT bundle_blob_id
        FROM reality_fork_publications
        WHERE project_id = ? AND bundle_blob_id IS NOT NULL
      )
    `,
    [projectId]
  );
}

function buildProjectStorageBreakdown(
  projectId: string,
  blobBudgetBytes: number
): ProjectStorageBreakdown {
  const totalBlobBytes = estimateProjectBlobBytes(projectId);
  const uploadBytes = estimateUploadBytes(projectId);
  const directEvidenceBytes = estimateDirectEvidenceBytes(projectId);
  const extractionArtifactBytes = estimateArtifactBytes('reality_fork_extractions', projectId);
  const simulationArtifactBytes = estimateArtifactBytes('reality_fork_simulations', projectId);
  const reportArtifactBytes = estimateReportBytes(projectId);
  const publicationArtifactBytes = estimatePublicationBytes(projectId);
  const inputBlobBytes = uploadBytes + directEvidenceBytes;
  const generatedArtifactBytes =
    extractionArtifactBytes +
    simulationArtifactBytes +
    reportArtifactBytes +
    publicationArtifactBytes;

  return {
    totalBlobBytes,
    inputBlobBytes,
    uploadBytes,
    directEvidenceBytes,
    generatedArtifactBytes,
    extractionArtifactBytes,
    simulationArtifactBytes,
    reportArtifactBytes,
    publicationArtifactBytes,
    blobBudgetBytes,
    blobBudgetRemaining: Math.max(0, blobBudgetBytes - totalBlobBytes),
  };
}

function findLatestEvent(
  project: ProjectDetail,
  jobId: string | null,
  eventType: string
): ProjectDetail['events'][number] | null {
  const scopedEvents = jobId
    ? project.events.filter(event => event.jobId === jobId && event.eventType === eventType)
    : project.events.filter(event => event.eventType === eventType);
  return scopedEvents.at(-1) ?? null;
}

function buildStageTiming(
  startedAt: number | null,
  completedAt: number | null
): ProjectStageTiming {
  return {
    startedAt,
    completedAt,
    durationMs: startedAt != null && completedAt != null ? Math.max(0, completedAt - startedAt) : null,
    status: completedAt != null ? 'completed' : startedAt != null ? 'running' : 'missing',
  };
}

function buildProjectStageTimings(project: ProjectDetail): Record<ProjectStageName, ProjectStageTiming> {
  const latestFullJob =
    project.jobs
      .filter(job => job.kind === 'full')
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
  const jobId = latestFullJob?.id ?? null;
  const jobStartedAt = latestFullJob?.startedAt ?? null;
  const jobCompletedAt = latestFullJob?.completedAt ?? null;

  const ingestStarted = findLatestEvent(project, jobId, 'ingest_started')?.createdAt ?? jobStartedAt;
  const ingestCompleted = findLatestEvent(project, jobId, 'ingest_completed')?.createdAt ?? null;
  const extractionStarted =
    findLatestEvent(project, jobId, 'extraction_started')?.createdAt ?? ingestCompleted;
  const extractionCompleted = findLatestEvent(project, jobId, 'extraction_completed')?.createdAt ?? null;
  const simulationStarted = extractionCompleted;
  const simulationCompleted = findLatestEvent(project, jobId, 'simulation_completed')?.createdAt ?? null;
  const reportStarted = simulationCompleted;
  const reportCompleted =
    findLatestEvent(project, jobId, 'report_completed')?.createdAt ??
    (latestFullJob?.status === 'completed' ? jobCompletedAt : null);

  return {
    ingest: buildStageTiming(ingestStarted, ingestCompleted),
    extraction: buildStageTiming(extractionStarted, extractionCompleted),
    simulation: buildStageTiming(simulationStarted, simulationCompleted),
    report: buildStageTiming(reportStarted, reportCompleted),
  };
}

function buildProjectTelemetry(project: ProjectDetail): ProjectTelemetry {
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
    stageTimings: buildProjectStageTimings(project),
    lastEventAt: project.events.at(-1)?.createdAt ?? null,
  };
}

function buildProjectCostBreakdown(
  project: ProjectDetail,
  storage: ProjectStorageBreakdown
): ProjectCostBreakdown {
  const evidenceCount = project.evidence.length;
  const chunkCount = project.chunks.length;
  const claimCount = project.claims.length;
  const scenarioInputCount = project.scenarioInputs.length;
  const runtimeUnits =
    project.simulationConfig.activeAgents *
    project.simulationConfig.rounds *
    project.simulationConfig.lanes.length;
  const ingestUsd = round(
    evidenceCount * 0.02 + (storage.inputBlobBytes / (1024 * 1024)) * 0.0015
  );
  const extractionUsd = round(
    evidenceCount * 0.05 + chunkCount * 0.008 + claimCount * 0.014
  );
  const simulationUsd = round(
    project.simulationConfig.lanes.length *
      (project.simulationConfig.rounds * 0.03 + project.simulationConfig.activeAgents * 0.02) +
      project.simulationConfig.representedPopulation * 0.002
  );
  const reportUsd = round(scenarioInputCount * 0.04 + 0.18);
  const publishUsd = round(
    0.02 + (storage.publicationArtifactBytes / (1024 * 1024)) * 0.0025
  );
  const simulatedSpend = round(sumSimulationSpend(project.id));
  const winnerSpend =
    project.simulations.find(
      simulation => simulation.hypothesisId === project.decision?.winnerHypothesisId
    )?.scorecard?.metrics.totalSpent ?? null;

  return {
    byStage: {
      ingest: { estimatedUsd: ingestUsd, actualUsd: null },
      extraction: { estimatedUsd: extractionUsd, actualUsd: null },
      simulation: { estimatedUsd: simulationUsd, actualUsd: simulatedSpend },
      report: { estimatedUsd: reportUsd, actualUsd: null },
    },
    runtimeUnits,
    estimated: {
      modelUsd: round(ingestUsd + extractionUsd + simulationUsd + reportUsd),
      publishUsd,
      totalUsd: round(ingestUsd + extractionUsd + simulationUsd + reportUsd + publishUsd),
    },
    actual: {
      simulatedSpend,
      winnerSpend: winnerSpend == null ? null : round(winnerSpend),
      totalUsd: simulatedSpend,
    },
  };
}

function buildProjectWarningFlags(project: ProjectDetail, telemetry: ProjectTelemetry): string[] {
  const flags = new Set<string>();

  if (project.warnings.length > 0) flags.add('project_warning_present');
  if (project.evidence.some(evidence => evidence.warning)) flags.add('evidence_warning_present');
  if (telemetry.jobs.failed > 0) flags.add('job_failure_present');
  if (Object.values(telemetry.stageTimings).some(stage => stage.status === 'missing')) {
    flags.add('stage_timing_incomplete');
  }

  return [...flags];
}

export function getRealityForkProjectOps(projectId: string, clientIp: string | null = null) {
  const project = getProjectDetail(projectId);
  if (!project) return null;

  const quotaConfig = getRealityForkQuotaConfig();
  const quotaUsage = getRealityForkProjectQuotaUsage(projectId);
  const quotaState = getRealityForkQuotaState({
    clientIp: clientIp ?? project.createdByIp,
    projectId,
    config: quotaConfig,
  });
  const storage = buildProjectStorageBreakdown(projectId, quotaConfig.projectBlobBytes);
  const cost = buildProjectCostBreakdown(project, storage);
  const telemetry = buildProjectTelemetry(project);
  const warningFlags = [...new Set([...buildProjectWarningFlags(project, telemetry), ...quotaState.warningFlags])];

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
      state: quotaState,
    },
    storage,
    cost,
    telemetry,
    warnings: {
      project: project.warnings,
      quota: quotaState.warnings,
      warningFlags,
    },
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
  const quotaState = getRealityForkQuotaState({ clientIp, config: quotaConfig });
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
      state: quotaState,
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
      eventsByType: Object.fromEntries(events.map(event => [event.event_type, event.count])) as Record<
        string,
        number
      >,
      actualSimulatedSpend: round(
        spendRows.reduce<number>((sum, row) => sum + sumSimulationSpend(row.id), 0)
      ),
    },
    warnings: {
      quota: quotaState.warnings,
      warningFlags: quotaState.warningFlags,
    },
    retention: getRealityForkRetentionSummary(),
  };
}
