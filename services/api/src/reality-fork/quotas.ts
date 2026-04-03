import db from '../db';
import type { RealityForkJobKind } from './types';

type UploadLike = {
  size: number;
};

type ProjectDraftLike = {
  uploadIds?: string[];
  urls?: string[];
  evidence?: unknown[];
  pastedText?: string;
};

export type RealityForkQuotaConfig = {
  projectsPerDayPerIp: number;
  activeProjectsPerIp: number;
  publicationsPerDayPerIp: number;
  uploadsPerDayPerIp: number;
  uploadBytesPerDayPerIp: number;
  evidencePerProject: number;
  projectBlobBytes: number;
  fullJobsPerProjectPerDay: number;
  publishJobsPerProjectPerDay: number;
  urlsPerProject: number;
  pastedTextCharsPerProject: number;
};

export type RealityForkQuotaUsage = {
  clientKey: string | null;
  windowStart: number;
  uploadsToday: number;
  uploadBytesToday: number;
  projectsToday: number;
  activeProjects: number;
  publicationsToday: number;
};

export class RealityForkQuotaError extends Error {
  readonly statusCode = 429;
  readonly code = 'REALITY_FORK_QUOTA_EXCEEDED';

  constructor(
    message: string,
    readonly details: {
      scope: 'client' | 'project';
      limit: string;
      remaining: number;
      usage: number;
    }
  ) {
    super(message);
  }
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRealityForkQuotaConfig(
  env: NodeJS.ProcessEnv = process.env
): RealityForkQuotaConfig {
  return {
    projectsPerDayPerIp: parseIntEnv(env.REALITY_FORK_PROJECTS_PER_DAY_PER_IP, 3),
    activeProjectsPerIp: parseIntEnv(env.REALITY_FORK_ACTIVE_PROJECTS_PER_IP, 1),
    publicationsPerDayPerIp: parseIntEnv(env.REALITY_FORK_PUBLICATIONS_PER_DAY_PER_IP, 1),
    uploadsPerDayPerIp: parseIntEnv(env.REALITY_FORK_UPLOADS_PER_DAY_PER_IP, 12),
    uploadBytesPerDayPerIp: parseIntEnv(
      env.REALITY_FORK_UPLOAD_BYTES_PER_DAY_PER_IP,
      40 * 1024 * 1024
    ),
    evidencePerProject: parseIntEnv(env.REALITY_FORK_EVIDENCE_PER_PROJECT, 20),
    projectBlobBytes: parseIntEnv(env.REALITY_FORK_PROJECT_BLOB_BYTES, 48 * 1024 * 1024),
    fullJobsPerProjectPerDay: parseIntEnv(env.REALITY_FORK_FULL_JOBS_PER_PROJECT_PER_DAY, 4),
    publishJobsPerProjectPerDay: parseIntEnv(env.REALITY_FORK_PUBLISH_JOBS_PER_PROJECT_PER_DAY, 2),
    urlsPerProject: parseIntEnv(env.REALITY_FORK_URLS_PER_PROJECT, 3),
    pastedTextCharsPerProject: parseIntEnv(env.REALITY_FORK_PASTED_TEXT_CHARS_PER_PROJECT, 40_000),
  };
}

function startOfDayUnix(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function normalizeClientKey(clientIp: string | null): string | null {
  if (!clientIp) return null;
  const trimmed = clientIp.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function countInlineEvidence(input: ProjectDraftLike): number {
  let total = Array.isArray(input.evidence) ? input.evidence.length : 0;
  total += Array.isArray(input.uploadIds) ? input.uploadIds.length : 0;
  total += Array.isArray(input.urls) ? input.urls.filter(Boolean).length : 0;
  total += typeof input.pastedText === 'string' && input.pastedText.trim() ? 1 : 0;
  return total;
}

function estimateIncomingBlobBytes(projectId: string): number {
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

function uploadBytesForIds(uploadIds: string[]): number {
  if (uploadIds.length === 0) return 0;
  const placeholders = uploadIds.map(() => '?').join(', ');
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_uploads
      WHERE id IN (${placeholders})
    `
    )
    .get(...uploadIds) as { total_bytes: number } | undefined;

  return row?.total_bytes ?? 0;
}

function evidenceCount(projectId: string): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_evidence
      WHERE project_id = ?
    `
    )
    .get(projectId) as { count: number } | undefined;

  return row?.count ?? 0;
}

function activeProjectCount(clientKey: string): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_projects
      WHERE created_by_ip = ?
        AND status IN ('queued', 'processing', 'publishing')
    `
    )
    .get(clientKey) as { count: number } | undefined;

  return row?.count ?? 0;
}

function publicationCountForWindow(clientKey: string, windowStart: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_publications publications
      INNER JOIN reality_fork_projects projects ON projects.id = publications.project_id
      WHERE projects.created_by_ip = ? AND publications.published_at >= ?
    `
    )
    .get(clientKey, windowStart) as { count: number } | undefined;

  return row?.count ?? 0;
}

function jobCountForWindow(
  projectId: string,
  kind: RealityForkJobKind,
  windowStart: number
): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_jobs
      WHERE project_id = ? AND kind = ? AND created_at >= ?
    `
    )
    .get(projectId, kind, windowStart) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function getRealityForkQuotaUsage(
  clientIp: string | null,
  options: { nowMs?: number } = {}
): RealityForkQuotaUsage {
  const nowMs = options.nowMs ?? Date.now();
  const windowStart = startOfDayUnix(nowMs);
  const clientKey = normalizeClientKey(clientIp);
  if (!clientKey) {
    return {
      clientKey: null,
      windowStart: windowStart * 1000,
      uploadsToday: 0,
      uploadBytesToday: 0,
      projectsToday: 0,
      activeProjects: 0,
      publicationsToday: 0,
    };
  }

  const uploads = db
    .prepare(
      `
      SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM reality_fork_uploads
      WHERE created_by_ip = ? AND created_at >= ?
    `
    )
    .get(clientKey, windowStart) as { count: number; total_bytes: number } | undefined;
  const projects = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_projects
      WHERE created_by_ip = ? AND created_at >= ?
    `
    )
    .get(clientKey, windowStart) as { count: number } | undefined;

  return {
    clientKey,
    windowStart: windowStart * 1000,
    uploadsToday: uploads?.count ?? 0,
    uploadBytesToday: uploads?.total_bytes ?? 0,
    projectsToday: projects?.count ?? 0,
    activeProjects: activeProjectCount(clientKey),
    publicationsToday: publicationCountForWindow(clientKey, windowStart),
  };
}

export function getRealityForkProjectQuotaUsage(projectId: string): {
  evidenceCount: number;
  blobBytes: number;
  fullJobsToday: number;
  publishJobsToday: number;
} {
  const windowStart = startOfDayUnix(Date.now());
  return {
    evidenceCount: evidenceCount(projectId),
    blobBytes: estimateIncomingBlobBytes(projectId),
    fullJobsToday: jobCountForWindow(projectId, 'full', windowStart),
    publishJobsToday: jobCountForWindow(projectId, 'publish', windowStart),
  };
}

export function assertUploadQuota(
  clientIp: string | null,
  uploads: UploadLike[],
  config = getRealityForkQuotaConfig()
): void {
  const usage = getRealityForkQuotaUsage(clientIp);
  const nextCount = usage.uploadsToday + uploads.length;
  if (nextCount > config.uploadsPerDayPerIp) {
    throw new RealityForkQuotaError('Daily upload quota exceeded.', {
      scope: 'client',
      limit: 'uploads_per_day',
      remaining: Math.max(0, config.uploadsPerDayPerIp - usage.uploadsToday),
      usage: usage.uploadsToday,
    });
  }

  const nextBytes = usage.uploadBytesToday + uploads.reduce((sum, upload) => sum + upload.size, 0);
  if (nextBytes > config.uploadBytesPerDayPerIp) {
    throw new RealityForkQuotaError('Daily upload byte quota exceeded.', {
      scope: 'client',
      limit: 'upload_bytes_per_day',
      remaining: Math.max(0, config.uploadBytesPerDayPerIp - usage.uploadBytesToday),
      usage: usage.uploadBytesToday,
    });
  }
}

export function assertCreateProjectQuota(
  clientIp: string | null,
  draft: ProjectDraftLike,
  config = getRealityForkQuotaConfig()
): void {
  const usage = getRealityForkQuotaUsage(clientIp);
  if (usage.clientKey && activeProjectCount(usage.clientKey) >= config.activeProjectsPerIp) {
    throw new RealityForkQuotaError('Only one active project is allowed per IP at a time.', {
      scope: 'client',
      limit: 'active_projects_per_ip',
      remaining: 0,
      usage: activeProjectCount(usage.clientKey),
    });
  }

  const nextProjects = usage.projectsToday + 1;
  if (nextProjects > config.projectsPerDayPerIp) {
    throw new RealityForkQuotaError('Daily project quota exceeded.', {
      scope: 'client',
      limit: 'projects_per_day',
      remaining: Math.max(0, config.projectsPerDayPerIp - usage.projectsToday),
      usage: usage.projectsToday,
    });
  }

  const evidenceSeedCount = countInlineEvidence(draft);
  if (evidenceSeedCount > config.evidencePerProject) {
    throw new RealityForkQuotaError('Project evidence quota exceeded.', {
      scope: 'project',
      limit: 'evidence_per_project',
      remaining: config.evidencePerProject,
      usage: evidenceSeedCount,
    });
  }

  const urlsCount = Array.isArray(draft.urls) ? draft.urls.filter(Boolean).length : 0;
  if (urlsCount > config.urlsPerProject) {
    throw new RealityForkQuotaError('Project URL quota exceeded.', {
      scope: 'project',
      limit: 'urls_per_project',
      remaining: config.urlsPerProject,
      usage: urlsCount,
    });
  }

  const pastedChars = typeof draft.pastedText === 'string' ? draft.pastedText.trim().length : 0;
  if (pastedChars > config.pastedTextCharsPerProject) {
    throw new RealityForkQuotaError('Pasted text quota exceeded.', {
      scope: 'project',
      limit: 'pasted_text_chars_per_project',
      remaining: config.pastedTextCharsPerProject,
      usage: pastedChars,
    });
  }

  const uploadIds = Array.isArray(draft.uploadIds)
    ? draft.uploadIds.map(id => String(id).trim()).filter(Boolean)
    : [];
  const seededUploadBytes = uploadBytesForIds(uploadIds);
  if (seededUploadBytes > config.projectBlobBytes) {
    throw new RealityForkQuotaError('Project blob quota exceeded.', {
      scope: 'project',
      limit: 'project_blob_bytes',
      remaining: config.projectBlobBytes,
      usage: seededUploadBytes,
    });
  }
}

export function assertAddEvidenceQuota(
  projectId: string,
  input: { uploadId?: string; contentBase64?: string; text?: string },
  config = getRealityForkQuotaConfig()
): void {
  const usage = getRealityForkProjectQuotaUsage(projectId);
  const nextEvidenceCount = usage.evidenceCount + 1;
  if (nextEvidenceCount > config.evidencePerProject) {
    throw new RealityForkQuotaError('Project evidence quota exceeded.', {
      scope: 'project',
      limit: 'evidence_per_project',
      remaining: Math.max(0, config.evidencePerProject - usage.evidenceCount),
      usage: usage.evidenceCount,
    });
  }

  let incomingBytes = 0;
  if (typeof input.text === 'string') {
    incomingBytes += Buffer.byteLength(input.text, 'utf8');
  } else if (typeof input.contentBase64 === 'string') {
    incomingBytes += Buffer.byteLength(input.contentBase64, 'base64');
  }
  if (typeof input.uploadId === 'string' && input.uploadId.trim()) {
    incomingBytes += uploadBytesForIds([input.uploadId.trim()]);
  }

  if (usage.blobBytes + incomingBytes > config.projectBlobBytes) {
    throw new RealityForkQuotaError('Project blob quota exceeded.', {
      scope: 'project',
      limit: 'project_blob_bytes',
      remaining: Math.max(0, config.projectBlobBytes - usage.blobBytes),
      usage: usage.blobBytes,
    });
  }
}

export function assertEnqueueJobQuota(
  projectId: string,
  kind: RealityForkJobKind,
  config = getRealityForkQuotaConfig()
): void {
  const usage = getRealityForkProjectQuotaUsage(projectId);
  if (kind === 'publish') {
    const project = db
      .prepare('SELECT created_by_ip FROM reality_fork_projects WHERE id = ?')
      .get(projectId) as { created_by_ip: string | null } | undefined;
    const clientKey = normalizeClientKey(project?.created_by_ip ?? null);
    const windowStart = startOfDayUnix(Date.now());
    if (
      clientKey &&
      publicationCountForWindow(clientKey, windowStart) >= config.publicationsPerDayPerIp
    ) {
      throw new RealityForkQuotaError('Only one published report is allowed per IP per day.', {
        scope: 'client',
        limit: 'publications_per_day_per_ip',
        remaining: 0,
        usage: publicationCountForWindow(clientKey, windowStart),
      });
    }
    if (usage.publishJobsToday >= config.publishJobsPerProjectPerDay) {
      throw new RealityForkQuotaError('Daily publish quota exceeded for this project.', {
        scope: 'project',
        limit: 'publish_jobs_per_project_per_day',
        remaining: Math.max(0, config.publishJobsPerProjectPerDay - usage.publishJobsToday),
        usage: usage.publishJobsToday,
      });
    }
    return;
  }

  if (usage.fullJobsToday >= config.fullJobsPerProjectPerDay) {
    throw new RealityForkQuotaError('Daily full-run quota exceeded for this project.', {
      scope: 'project',
      limit: 'full_jobs_per_project_per_day',
      remaining: Math.max(0, config.fullJobsPerProjectPerDay - usage.fullJobsToday),
      usage: usage.fullJobsToday,
    });
  }
}
