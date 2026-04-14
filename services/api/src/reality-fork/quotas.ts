import { timingSafeEqual } from 'node:crypto';

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

export type RealityForkProjectQuotaUsage = {
  evidenceCount: number;
  blobBytes: number;
  fullJobsToday: number;
  publishJobsToday: number;
};

export type RealityForkQuotaMeter = {
  limit: number;
  usage: number;
  remaining: number;
  ratio: number;
  status: 'ok' | 'warning' | 'exceeded';
};

export type RealityForkQuotaWarningFlag =
  | 'client_projects_near_limit'
  | 'client_active_projects_near_limit'
  | 'client_publications_near_limit'
  | 'client_uploads_near_limit'
  | 'client_upload_bytes_near_limit'
  | 'project_evidence_near_limit'
  | 'project_blob_bytes_near_limit'
  | 'project_full_jobs_near_limit'
  | 'project_publish_jobs_near_limit';

export type RealityForkQuotaState = {
  evaluatedAt: number;
  windowStart: number;
  clientKey: string | null;
  warningThreshold: number;
  warnings: string[];
  warningFlags: RealityForkQuotaWarningFlag[];
  client: {
    projectsToday: RealityForkQuotaMeter;
    activeProjects: RealityForkQuotaMeter;
    publicationsToday: RealityForkQuotaMeter;
    uploadsToday: RealityForkQuotaMeter;
    uploadBytesToday: RealityForkQuotaMeter;
  };
  project: {
    evidence: RealityForkQuotaMeter;
    blobBytes: RealityForkQuotaMeter;
    fullJobsToday: RealityForkQuotaMeter;
    publishJobsToday: RealityForkQuotaMeter;
  } | null;
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

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeClientKey(clientIp: string | null): string | null {
  if (!clientIp) return null;
  const trimmed = clientIp.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function normalizeBearerToken(authorization: string | undefined): string | null {
  if (typeof authorization !== 'string') return null;
  const trimmed = authorization.trim();
  if (!trimmed) return null;
  if (!/^Bearer\s+/i.test(trimmed)) return null;
  return trimmed.replace(/^Bearer\s+/i, '').trim() || null;
}

function safeTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function buildQuotaMeter(
  limit: number,
  usage: number,
  warningThreshold: number
): RealityForkQuotaMeter {
  const remaining = Math.max(0, limit - usage);
  const ratio = limit > 0 ? roundRatio(usage / limit) : 0;
  return {
    limit,
    usage,
    remaining,
    ratio,
    status: usage >= limit ? 'exceeded' : ratio >= warningThreshold ? 'warning' : 'ok',
  };
}

function pushMeterWarning(
  warnings: string[],
  warningFlags: RealityForkQuotaWarningFlag[],
  meter: RealityForkQuotaMeter,
  flag: RealityForkQuotaWarningFlag,
  message: string
): void {
  if (meter.status !== 'warning' && meter.status !== 'exceeded') return;
  warningFlags.push(flag);
  warnings.push(message);
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

export function getRealityForkProjectQuotaUsage(
  projectId: string,
  options: { nowMs?: number } = {}
): RealityForkProjectQuotaUsage {
  const windowStart = startOfDayUnix(options.nowMs ?? Date.now());
  return {
    evidenceCount: evidenceCount(projectId),
    blobBytes: estimateIncomingBlobBytes(projectId),
    fullJobsToday: jobCountForWindow(projectId, 'full', windowStart),
    publishJobsToday: jobCountForWindow(projectId, 'publish', windowStart),
  };
}

export function getRealityForkQuotaState(params: {
  clientIp: string | null;
  projectId?: string | null;
  config?: RealityForkQuotaConfig;
  nowMs?: number;
  warningThreshold?: number;
}): RealityForkQuotaState {
  const nowMs = params.nowMs ?? Date.now();
  const config = params.config ?? getRealityForkQuotaConfig();
  const warningThreshold = Math.min(Math.max(params.warningThreshold ?? 0.8, 0.5), 0.98);
  const clientUsage = getRealityForkQuotaUsage(params.clientIp, { nowMs });
  const projectUsage =
    typeof params.projectId === 'string' && params.projectId.trim()
      ? getRealityForkProjectQuotaUsage(params.projectId, { nowMs })
      : null;
  const warnings: string[] = [];
  const warningFlags: RealityForkQuotaWarningFlag[] = [];

  const state: RealityForkQuotaState = {
    evaluatedAt: nowMs,
    windowStart: clientUsage.windowStart,
    clientKey: clientUsage.clientKey,
    warningThreshold,
    warnings,
    warningFlags,
    client: {
      projectsToday: buildQuotaMeter(
        config.projectsPerDayPerIp,
        clientUsage.projectsToday,
        warningThreshold
      ),
      activeProjects: buildQuotaMeter(
        config.activeProjectsPerIp,
        clientUsage.activeProjects,
        warningThreshold
      ),
      publicationsToday: buildQuotaMeter(
        config.publicationsPerDayPerIp,
        clientUsage.publicationsToday,
        warningThreshold
      ),
      uploadsToday: buildQuotaMeter(
        config.uploadsPerDayPerIp,
        clientUsage.uploadsToday,
        warningThreshold
      ),
      uploadBytesToday: buildQuotaMeter(
        config.uploadBytesPerDayPerIp,
        clientUsage.uploadBytesToday,
        warningThreshold
      ),
    },
    project: projectUsage
      ? {
          evidence: buildQuotaMeter(
            config.evidencePerProject,
            projectUsage.evidenceCount,
            warningThreshold
          ),
          blobBytes: buildQuotaMeter(
            config.projectBlobBytes,
            projectUsage.blobBytes,
            warningThreshold
          ),
          fullJobsToday: buildQuotaMeter(
            config.fullJobsPerProjectPerDay,
            projectUsage.fullJobsToday,
            warningThreshold
          ),
          publishJobsToday: buildQuotaMeter(
            config.publishJobsPerProjectPerDay,
            projectUsage.publishJobsToday,
            warningThreshold
          ),
        }
      : null,
  };

  pushMeterWarning(
    warnings,
    warningFlags,
    state.client.projectsToday,
    'client_projects_near_limit',
    `Project quota is ${state.client.projectsToday.remaining} away from the daily IP limit.`
  );
  pushMeterWarning(
    warnings,
    warningFlags,
    state.client.activeProjects,
    'client_active_projects_near_limit',
    `Active project capacity is down to ${state.client.activeProjects.remaining} for this IP.`
  );
  pushMeterWarning(
    warnings,
    warningFlags,
    state.client.publicationsToday,
    'client_publications_near_limit',
    `Publication capacity is down to ${state.client.publicationsToday.remaining} for this IP today.`
  );
  pushMeterWarning(
    warnings,
    warningFlags,
    state.client.uploadsToday,
    'client_uploads_near_limit',
    `Upload quota is ${state.client.uploadsToday.remaining} away from the daily IP limit.`
  );
  pushMeterWarning(
    warnings,
    warningFlags,
    state.client.uploadBytesToday,
    'client_upload_bytes_near_limit',
    `Upload byte quota has ${state.client.uploadBytesToday.remaining} bytes remaining today.`
  );

  if (state.project) {
    pushMeterWarning(
      warnings,
      warningFlags,
      state.project.evidence,
      'project_evidence_near_limit',
      `Project evidence capacity is down to ${state.project.evidence.remaining}.`
    );
    pushMeterWarning(
      warnings,
      warningFlags,
      state.project.blobBytes,
      'project_blob_bytes_near_limit',
      `Project blob budget has ${state.project.blobBytes.remaining} bytes remaining.`
    );
    pushMeterWarning(
      warnings,
      warningFlags,
      state.project.fullJobsToday,
      'project_full_jobs_near_limit',
      `Full-run quota has ${state.project.fullJobsToday.remaining} attempt${state.project.fullJobsToday.remaining === 1 ? '' : 's'} remaining today.`
    );
    pushMeterWarning(
      warnings,
      warningFlags,
      state.project.publishJobsToday,
      'project_publish_jobs_near_limit',
      `Publish quota has ${state.project.publishJobsToday.remaining} attempt${state.project.publishJobsToday.remaining === 1 ? '' : 's'} remaining today.`
    );
  }

  return state;
}

export function realityForkInternalSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.REALITY_FORK_INTERNAL_SEED_TOKEN === 'string'
    ? env.REALITY_FORK_INTERNAL_SEED_TOKEN.trim().length > 0
    : false;
}

export function verifyRealityForkInternalSeedToken(
  authorization: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const expected = env.REALITY_FORK_INTERNAL_SEED_TOKEN?.trim();
  const provided = normalizeBearerToken(authorization);
  if (!expected || !provided) return false;
  return safeTokenEquals(expected, provided);
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
