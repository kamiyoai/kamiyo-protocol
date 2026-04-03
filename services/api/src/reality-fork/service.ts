import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { load as loadHtml } from 'cheerio';
import db from '../db';
import { FileSystemBlobStore, realityForkBlobStore } from './blob-store';
import { adjudicateBranches } from '../control-room/adjudication';
import { scoreBranches } from '../control-room/scoring';
import type { BranchExecutionSummary, CounterfactualSnapshot } from '../control-room/types';
import type { ExecuteSwarmRunResult } from '../swarm/service';
import type {
  CreateRealityForkEvidenceInput,
  CreateRealityForkProjectInput,
  RealityForkBlob,
  RealityForkChunk,
  RealityForkClaim,
  RealityForkDecision,
  RealityForkEvidence,
  RealityForkEvidenceKind,
  RealityForkEntity,
  RealityForkExtraction,
  RealityForkFact,
  RealityForkFactType,
  RealityForkHypothesisId,
  RealityForkJob,
  RealityForkJobKind,
  RealityForkJobStage,
  RealityForkJobStatus,
  RealityForkLaneId,
  RealityForkLaneRound,
  RealityForkProject,
  RealityForkProjectDetail,
  RealityForkProjectEvent,
  RealityForkProjectStatus,
  RealityForkPublication,
  RealityForkReport,
  RealityForkReportSection,
  RealityForkScenarioInput,
  RealityForkSimulation,
  RealityForkSimulationConfig,
  RealityForkSimulationStance,
  RealityForkSourceType,
  RealityForkUpload,
} from './types';

type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  prompt: string | null;
  claim: string;
  description: string | null;
  tags_json: string;
  simulation_config_json: string | null;
  warnings_json: string | null;
  decision_mode: 'score_only' | 'score_then_truth_court' | 'truth_court_required' | null;
  created_by_ip: string | null;
  status: RealityForkProjectStatus;
  current_job_id: string | null;
  latest_report_id: string | null;
  latest_publication_id: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  evidence_count: number;
  extraction_count: number;
  simulation_count: number;
  chunk_count: number;
  entity_count: number;
  claim_count: number;
};

type BlobRow = {
  id: string;
  sha256: string;
  storage_key: string;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number;
  created_at: number;
};

type UploadRow = {
  id: string;
  blob_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  source_type: RealityForkSourceType;
  created_at: number;
};

type EvidenceRow = {
  id: string;
  project_id: string;
  title: string;
  kind: RealityForkEvidenceKind;
  source_type: RealityForkSourceType;
  source_label: string | null;
  source_url: string | null;
  mime_type: string | null;
  blob_id: string | null;
  upload_id: string | null;
  status: 'uploaded' | 'parsing' | 'ready_for_extraction' | 'failed';
  warning: string | null;
  size_bytes: number | null;
  content_text: string | null;
  metadata_json: string;
  created_at: number;
  updated_at: number;
};

type ChunkRow = {
  id: string;
  project_id: string;
  evidence_id: string;
  chunk_index: number;
  content: string;
  char_start: number;
  char_end: number;
  created_at: number;
};

type ExtractionRow = {
  id: string;
  project_id: string;
  evidence_id: string;
  summary: string;
  keywords_json: string;
  facts_json: string;
  artifact_blob_id: string | null;
  created_at: number;
};

type EntityRow = {
  id: string;
  project_id: string;
  label: string;
  category: RealityForkEntity['category'];
  aliases_json: string;
  mention_count: number;
  evidence_refs_json: string;
  created_at: number;
};

type ClaimRow = {
  id: string;
  project_id: string;
  text: string;
  topic: string;
  sentiment: number;
  confidence: number;
  evidence_refs_json: string;
  entity_ids_json: string;
  created_at: number;
};

type ScenarioInputRow = {
  id: string;
  project_id: string;
  topic: string;
  summary: string;
  evidence_refs_json: string;
  weight: number;
  created_at: number;
};

type SimulationRow = {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  hypothesis_id: RealityForkHypothesisId;
  stance: RealityForkSimulationStance;
  outcome: string;
  probability: number;
  confidence: number;
  impact_score: number;
  rationale_json: string;
  lane_outlook_json: string;
  scorecard_json: string | null;
  artifact_blob_id: string | null;
  created_at: number;
};

type LaneRoundRow = {
  id: string;
  project_id: string;
  lane: RealityForkLaneId;
  round: number;
  sentiment: number;
  conviction: number;
  salience: number;
  summary: string;
  evidence_refs_json: string;
  created_at: number;
};

type ReportRow = {
  id: string;
  project_id: string;
  job_id: string;
  headline: string;
  summary: string;
  markdown_blob_id: string | null;
  html_blob_id: string | null;
  sections_json: string;
  decision_json: string | null;
  metrics_json: string;
  created_at: number;
};

type PublicationRow = {
  id: string;
  project_id: string;
  report_id: string;
  slug: string;
  title: string;
  summary: string;
  manifest_json: string;
  bundle_blob_id: string | null;
  status: 'published';
  created_at: number;
  published_at: number;
};

type JobRow = {
  id: string;
  project_id: string;
  kind: RealityForkJobKind;
  status: RealityForkJobStatus;
  current_stage: RealityForkJobStage;
  progress: number;
  error: string | null;
  result_json: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number;
};

type EventRow = {
  id: string;
  project_id: string;
  job_id: string | null;
  event_type: string;
  payload_json: string;
  created_at: number;
};

type KeywordCount = {
  word: string;
  count: number;
};

const stopWords = new Set([
  'about',
  'after',
  'again',
  'along',
  'also',
  'because',
  'been',
  'being',
  'between',
  'could',
  'does',
  'from',
  'into',
  'just',
  'more',
  'most',
  'over',
  'should',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

const riskWords = [
  'risk',
  'delay',
  'loss',
  'breach',
  'fail',
  'drop',
  'decline',
  'blocker',
  'outage',
];
const supportWords = [
  'gain',
  'growth',
  'ship',
  'improve',
  'increase',
  'launch',
  'resolve',
  'adopt',
  'support',
];
const defaultSimulationConfig: RealityForkSimulationConfig = {
  representedPopulation: 240,
  activeAgents: 32,
  rounds: 24,
  lanes: ['x_lane', 'reddit_lane', 'market_lane'],
};
const maxSimulationConfig: RealityForkSimulationConfig = {
  representedPopulation: 480,
  activeAgents: 48,
  rounds: 36,
  lanes: ['x_lane', 'reddit_lane', 'market_lane'],
};
const laneWeights: Record<
  RealityForkLaneId,
  { volatility: number; evidenceBias: number; optimismBias: number }
> = {
  x_lane: { volatility: 0.18, evidenceBias: 0.45, optimismBias: 0.08 },
  reddit_lane: { volatility: 0.12, evidenceBias: 0.62, optimismBias: 0.02 },
  market_lane: { volatility: 0.16, evidenceBias: 0.7, optimismBias: -0.03 },
};
const laneOrder: RealityForkLaneId[] = ['x_lane', 'reddit_lane', 'market_lane'];
const hypothesisLabels: Record<RealityForkHypothesisId, string> = {
  status_quo: 'Status quo',
  accelerant: 'Accelerant',
  backlash: 'Backlash',
  market_shock: 'Market shock',
};

const queuedJobs: string[] = [];
let draining = false;

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `project-${randomUUID().slice(0, 8)}`
  );
}

function uniqueProjectSlug(base: string): string {
  let slug = slugify(base);
  let counter = 1;
  while (db.prepare('SELECT 1 FROM reality_fork_projects WHERE slug = ?').get(slug)) {
    counter += 1;
    slug = `${slugify(base)}-${counter}`;
  }
  return slug;
}

function uniquePublicationSlug(base: string): string {
  let slug = slugify(base);
  let counter = 1;
  while (db.prepare('SELECT 1 FROM reality_fork_publications WHERE slug = ?').get(slug)) {
    counter += 1;
    slug = `${slugify(base)}-${counter}`;
  }
  return slug;
}

function previewText(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeSimulationConfig(
  input: Partial<RealityForkSimulationConfig> | null | undefined
): RealityForkSimulationConfig {
  const lanes = Array.isArray(input?.lanes)
    ? laneOrder.filter(lane => input?.lanes?.includes(lane))
    : defaultSimulationConfig.lanes;

  return {
    representedPopulation: clamp(
      Math.round(input?.representedPopulation ?? defaultSimulationConfig.representedPopulation),
      24,
      maxSimulationConfig.representedPopulation
    ),
    activeAgents: clamp(
      Math.round(input?.activeAgents ?? defaultSimulationConfig.activeAgents),
      4,
      maxSimulationConfig.activeAgents
    ),
    rounds: clamp(
      Math.round(input?.rounds ?? defaultSimulationConfig.rounds),
      4,
      maxSimulationConfig.rounds
    ),
    lanes: lanes.length > 0 ? lanes : defaultSimulationConfig.lanes,
  };
}

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return 'Reality Fork project';
  const line = trimmed.split('\n')[0]?.trim() ?? trimmed;
  return line.length <= 80 ? line : `${line.slice(0, 77)}...`;
}

function detectSourceType(params: {
  fileName?: string | null;
  mimeType?: string | null;
  url?: string | null;
}): RealityForkSourceType {
  const name = params.fileName?.toLowerCase() ?? '';
  const mime = params.mimeType?.toLowerCase() ?? '';
  const url = params.url?.toLowerCase() ?? '';

  if (url.includes('polymarket')) return 'polymarket_market';
  if (url.includes('reddit.com')) return 'reddit_thread';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'x_thread';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
  if (mime.includes('markdown') || name.endsWith('.md')) return 'markdown';
  if (mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (mime.startsWith('text/') || name.endsWith('.txt')) return 'text';
  if (url) return 'url';
  return 'text';
}

function classifyFact(sentence: string): RealityForkFactType {
  const lower = sentence.toLowerCase();
  if (riskWords.some(word => lower.includes(word))) return 'risk';
  if (supportWords.some(word => lower.includes(word))) return 'supporting';
  return 'neutral';
}

function sentenceWeight(sentence: string): number {
  const lengthBoost = clamp(sentence.length / 140, 0.3, 1);
  const digitBoost = /\d/.test(sentence) ? 0.2 : 0;
  const certaintyBoost = /(must|will|confirmed|measured|reported|observed)/i.test(sentence)
    ? 0.2
    : 0;
  return round(clamp(lengthBoost + digitBoost + certaintyBoost, 0.2, 1.4));
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function extractKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a: KeywordCount, b: KeywordCount) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 8)
    .map(entry => entry.word);
}

function computeBlobId(sha256: string): string {
  return `rf_blob_${sha256.slice(0, 16)}`;
}

function mapBlob(row: BlobRow): RealityForkBlob {
  return {
    id: row.id,
    sha256: row.sha256,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at * 1000,
  };
}

function mapUpload(row: UploadRow): RealityForkUpload {
  return {
    id: row.id,
    blobId: row.blob_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sourceType: row.source_type,
    createdAt: row.created_at * 1000,
  };
}

function mapEvidence(row: EvidenceRow): RealityForkEvidence {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    kind: row.kind,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    mimeType: row.mime_type,
    blobId: row.blob_id,
    uploadId: row.upload_id,
    sizeBytes: row.size_bytes,
    textPreview: previewText(row.content_text),
    status: row.status,
    warning: row.warning,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at * 1000,
    updatedAt: row.updated_at * 1000,
  };
}

function loadBlob(blobId: string | null): RealityForkBlob | null {
  if (!blobId) return null;
  const row = db
    .prepare(
      `
    SELECT id, sha256, storage_key, mime_type, file_name, size_bytes, created_at
    FROM reality_fork_blobs
    WHERE id = ?
  `
    )
    .get(blobId) as BlobRow | undefined;

  return row ? mapBlob(row) : null;
}

function readBlobText(blobId: string | null, store = realityForkBlobStore): string {
  const blob = loadBlob(blobId);
  if (!blob) return '';
  return store.readText(blob.storageKey);
}

function mapExtraction(row: ExtractionRow): RealityForkExtraction {
  return {
    id: row.id,
    projectId: row.project_id,
    evidenceId: row.evidence_id,
    summary: row.summary,
    keywords: parseJson<string[]>(row.keywords_json, []),
    facts: parseJson<RealityForkFact[]>(row.facts_json, []),
    artifactBlobId: row.artifact_blob_id,
    createdAt: row.created_at * 1000,
  };
}

function mapChunk(row: ChunkRow): RealityForkChunk {
  return {
    id: row.id,
    projectId: row.project_id,
    evidenceId: row.evidence_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    charStart: row.char_start,
    charEnd: row.char_end,
    createdAt: row.created_at * 1000,
  };
}

function mapEntity(row: EntityRow): RealityForkEntity {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    category: row.category,
    aliases: parseJson<string[]>(row.aliases_json, []),
    mentionCount: row.mention_count,
    evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []),
    createdAt: row.created_at * 1000,
  };
}

function mapClaim(row: ClaimRow): RealityForkClaim {
  return {
    id: row.id,
    projectId: row.project_id,
    text: row.text,
    topic: row.topic,
    sentiment: row.sentiment,
    confidence: row.confidence,
    evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []),
    entityIds: parseJson<string[]>(row.entity_ids_json, []),
    createdAt: row.created_at * 1000,
  };
}

function mapScenarioInput(row: ScenarioInputRow): RealityForkScenarioInput {
  return {
    id: row.id,
    projectId: row.project_id,
    topic: row.topic,
    summary: row.summary,
    evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []),
    weight: row.weight,
    createdAt: row.created_at * 1000,
  };
}

function mapSimulation(row: SimulationRow): RealityForkSimulation {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    hypothesisId: row.hypothesis_id,
    stance: row.stance,
    outcome: row.outcome,
    probability: row.probability,
    confidence: row.confidence,
    impactScore: row.impact_score,
    laneOutlook: parseJson<Record<RealityForkLaneId, number>>(row.lane_outlook_json, {
      x_lane: 0,
      reddit_lane: 0,
      market_lane: 0,
    }),
    rationale: parseJson(row.rationale_json, { score: 0, evidenceIds: [], drivers: [] }),
    scorecard: parseJson(row.scorecard_json, null),
    artifactBlobId: row.artifact_blob_id,
    createdAt: row.created_at * 1000,
  };
}

function mapLaneRound(row: LaneRoundRow): RealityForkLaneRound {
  return {
    id: row.id,
    projectId: row.project_id,
    lane: row.lane,
    round: row.round,
    sentiment: row.sentiment,
    conviction: row.conviction,
    salience: row.salience,
    summary: row.summary,
    evidenceRefs: parseJson<string[]>(row.evidence_refs_json, []),
    createdAt: row.created_at * 1000,
  };
}

function mapJob(row: JobRow): RealityForkJob {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    currentStage: row.current_stage,
    progress: row.progress,
    error: row.error,
    result: parseJson<Record<string, unknown> | null>(row.result_json, null),
    createdAt: row.created_at * 1000,
    startedAt: row.started_at ? row.started_at * 1000 : null,
    completedAt: row.completed_at ? row.completed_at * 1000 : null,
    updatedAt: row.updated_at * 1000,
  };
}

function mapProject(row: ProjectRow): RealityForkProject {
  const simulationConfig = normalizeSimulationConfig(parseJson(row.simulation_config_json, {}));
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    prompt: row.prompt ?? row.claim,
    claim: row.claim,
    description: row.description,
    tags: parseJson<string[]>(row.tags_json, []),
    decisionMode: row.decision_mode ?? 'score_then_truth_court',
    status: row.status,
    currentJobId: row.current_job_id,
    latestReportId: row.latest_report_id,
    latestPublicationId: row.latest_publication_id,
    createdByIp: row.created_by_ip,
    simulationConfig,
    warnings: parseJson<string[]>(row.warnings_json, []),
    createdAt: row.created_at * 1000,
    updatedAt: row.updated_at * 1000,
    publishedAt: row.published_at ? row.published_at * 1000 : null,
    stats: {
      evidenceCount: row.evidence_count,
      extractionCount: row.extraction_count,
      simulationCount: row.simulation_count,
      chunkCount: row.chunk_count,
      entityCount: row.entity_count,
      claimCount: row.claim_count,
    },
  };
}

function mapReport(row: ReportRow, store = realityForkBlobStore): RealityForkReport {
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    headline: row.headline,
    summary: row.summary,
    markdown: readBlobText(row.markdown_blob_id, store),
    html: readBlobText(row.html_blob_id, store),
    markdownBlobId: row.markdown_blob_id,
    htmlBlobId: row.html_blob_id,
    sections: parseJson<RealityForkReportSection[]>(row.sections_json, []),
    metrics: parseJson<Record<string, number>>(row.metrics_json, {}),
    decision: parseJson<RealityForkDecision | null>(row.decision_json, null),
    createdAt: row.created_at * 1000,
  };
}

function mapPublication(row: PublicationRow, store = realityForkBlobStore): RealityForkPublication {
  return {
    id: row.id,
    projectId: row.project_id,
    reportId: row.report_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    status: row.status,
    bundleBlobId: row.bundle_blob_id,
    bundle: parseJson<Record<string, unknown>>(readBlobText(row.bundle_blob_id, store), {}),
    createdAt: row.created_at * 1000,
    publishedAt: row.published_at * 1000,
  };
}

function mapEvent(row: EventRow): RealityForkProjectEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    eventType: row.event_type,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at * 1000,
  };
}

function persistBlob(blob: ReturnType<FileSystemBlobStore['put']>): RealityForkBlob {
  const id = computeBlobId(blob.sha256);
  const existing = db
    .prepare(
      `
    SELECT id, sha256, storage_key, mime_type, file_name, size_bytes, created_at
    FROM reality_fork_blobs
    WHERE sha256 = ?
  `
    )
    .get(blob.sha256) as BlobRow | undefined;

  if (existing) return mapBlob(existing);

  db.prepare(
    `
    INSERT INTO reality_fork_blobs (
      id, sha256, storage_key, mime_type, file_name, size_bytes, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(id, blob.sha256, blob.storageKey, blob.mimeType, blob.fileName, blob.sizeBytes, nowUnix());

  const row = db
    .prepare(
      `
    SELECT id, sha256, storage_key, mime_type, file_name, size_bytes, created_at
    FROM reality_fork_blobs
    WHERE id = ?
  `
    )
    .get(id) as BlobRow;

  return mapBlob(row);
}

function appendProjectEvent(params: {
  projectId: string;
  eventType: string;
  payload: Record<string, unknown>;
  jobId?: string | null;
}): RealityForkProjectEvent {
  const id = `rf_evt_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `
    INSERT INTO reality_fork_project_events (
      id, project_id, job_id, event_type, payload_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    params.projectId,
    params.jobId ?? null,
    params.eventType,
    JSON.stringify(params.payload),
    nowUnix()
  );

  const row = db
    .prepare(
      `
    SELECT id, project_id, job_id, event_type, payload_json, created_at
    FROM reality_fork_project_events
    WHERE id = ?
  `
    )
    .get(id) as EventRow;

  return mapEvent(row);
}

function listEvidenceRows(projectId: string): EvidenceRow[] {
  return db
    .prepare(
      `
    SELECT
      evidence.id,
      evidence.project_id,
      evidence.title,
      evidence.kind,
      evidence.source_type,
      evidence.source_label,
      evidence.source_url,
      evidence.mime_type,
      evidence.blob_id,
      evidence.upload_id,
      evidence.status,
      evidence.warning,
      blobs.size_bytes,
      evidence.content_text,
      evidence.metadata_json,
      evidence.created_at,
      evidence.updated_at
    FROM reality_fork_evidence evidence
    LEFT JOIN reality_fork_blobs blobs ON blobs.id = evidence.blob_id
    WHERE evidence.project_id = ?
    ORDER BY evidence.created_at ASC, evidence.id ASC
  `
    )
    .all(projectId) as EvidenceRow[];
}

function listUploads(projectId: string): RealityForkUpload[] {
  const rows = db
    .prepare(
      `
    SELECT uploads.id, uploads.blob_id, uploads.file_name, uploads.mime_type, uploads.size_bytes, uploads.source_type, uploads.created_at
    FROM reality_fork_uploads uploads
    INNER JOIN reality_fork_evidence evidence ON evidence.upload_id = uploads.id
    WHERE evidence.project_id = ?
    GROUP BY uploads.id
    ORDER BY uploads.created_at ASC, uploads.id ASC
  `
    )
    .all(projectId) as UploadRow[];

  return rows.map(mapUpload);
}

function listChunks(projectId: string): RealityForkChunk[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, evidence_id, chunk_index, content, char_start, char_end, created_at
    FROM reality_fork_document_chunks
    WHERE project_id = ?
    ORDER BY evidence_id ASC, chunk_index ASC
  `
    )
    .all(projectId) as ChunkRow[];

  return rows.map(mapChunk);
}

function listExtractions(projectId: string): RealityForkExtraction[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, evidence_id, summary, keywords_json, facts_json, artifact_blob_id, created_at
    FROM reality_fork_extractions
    WHERE project_id = ?
    ORDER BY created_at ASC, id ASC
  `
    )
    .all(projectId) as ExtractionRow[];

  return rows.map(mapExtraction);
}

function listEntities(projectId: string): RealityForkEntity[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, label, category, aliases_json, mention_count, evidence_refs_json, created_at
    FROM reality_fork_entities
    WHERE project_id = ?
    ORDER BY mention_count DESC, label ASC
  `
    )
    .all(projectId) as EntityRow[];

  return rows.map(mapEntity);
}

function listClaims(projectId: string): RealityForkClaim[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, text, topic, sentiment, confidence, evidence_refs_json, entity_ids_json, created_at
    FROM reality_fork_claims
    WHERE project_id = ?
    ORDER BY confidence DESC, created_at ASC
  `
    )
    .all(projectId) as ClaimRow[];

  return rows.map(mapClaim);
}

function listScenarioInputs(projectId: string): RealityForkScenarioInput[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, topic, summary, evidence_refs_json, weight, created_at
    FROM reality_fork_scenario_inputs
    WHERE project_id = ?
    ORDER BY weight DESC, created_at ASC
  `
    )
    .all(projectId) as ScenarioInputRow[];

  return rows.map(mapScenarioInput);
}

function listSimulations(projectId: string): RealityForkSimulation[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, slug, title, hypothesis_id, stance, outcome, probability, confidence, impact_score, rationale_json, lane_outlook_json, scorecard_json, artifact_blob_id, created_at
    FROM reality_fork_simulations
    WHERE project_id = ?
    ORDER BY created_at ASC, id ASC
  `
    )
    .all(projectId) as SimulationRow[];

  return rows.map(mapSimulation);
}

function listLaneRounds(projectId: string): RealityForkLaneRound[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, lane, round, sentiment, conviction, salience, summary, evidence_refs_json, created_at
    FROM reality_fork_lane_rounds
    WHERE project_id = ?
    ORDER BY round ASC, lane ASC
  `
    )
    .all(projectId) as LaneRoundRow[];

  return rows.map(mapLaneRound);
}

function listJobs(projectId: string): RealityForkJob[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, kind, status, current_stage, progress, error, result_json, created_at, started_at, completed_at, updated_at
    FROM reality_fork_jobs
    WHERE project_id = ?
    ORDER BY created_at DESC, id DESC
  `
    )
    .all(projectId) as JobRow[];

  return rows.map(mapJob);
}

function loadReportById(
  reportId: string | null,
  store = realityForkBlobStore
): RealityForkReport | null {
  if (!reportId) return null;
  const row = db
    .prepare(
      `
    SELECT id, project_id, job_id, headline, summary, markdown_blob_id, html_blob_id, sections_json, decision_json, metrics_json, created_at
    FROM reality_fork_reports
    WHERE id = ?
    LIMIT 1
  `
    )
    .get(reportId) as ReportRow | undefined;

  return row ? mapReport(row, store) : null;
}

function loadPublicationById(
  publicationId: string | null,
  store = realityForkBlobStore
): RealityForkPublication | null {
  if (!publicationId) return null;
  const row = db
    .prepare(
      `
    SELECT id, project_id, report_id, slug, title, summary, manifest_json, bundle_blob_id, status, created_at, published_at
    FROM reality_fork_publications
    WHERE id = ?
    LIMIT 1
  `
    )
    .get(publicationId) as PublicationRow | undefined;

  return row ? mapPublication(row, store) : null;
}

function loadProjectRow(projectId: string): ProjectRow | null {
  const row = db
    .prepare(
      `
    SELECT
      projects.id,
      projects.slug,
      projects.title,
      projects.prompt,
      projects.claim,
      projects.description,
      projects.tags_json,
      projects.simulation_config_json,
      projects.warnings_json,
      projects.decision_mode,
      projects.created_by_ip,
      projects.status,
      projects.current_job_id,
      projects.latest_report_id,
      projects.latest_publication_id,
      projects.created_at,
      projects.updated_at,
      projects.published_at,
      (
        SELECT COUNT(*) FROM reality_fork_evidence evidence
        WHERE evidence.project_id = projects.id
      ) AS evidence_count,
      (
        SELECT COUNT(*) FROM reality_fork_extractions extractions
        WHERE extractions.project_id = projects.id
      ) AS extraction_count,
      (
        SELECT COUNT(*) FROM reality_fork_simulations simulations
        WHERE simulations.project_id = projects.id
      ) AS simulation_count,
      (
        SELECT COUNT(*) FROM reality_fork_document_chunks chunks
        WHERE chunks.project_id = projects.id
      ) AS chunk_count,
      (
        SELECT COUNT(*) FROM reality_fork_entities entities
        WHERE entities.project_id = projects.id
      ) AS entity_count,
      (
        SELECT COUNT(*) FROM reality_fork_claims claims
        WHERE claims.project_id = projects.id
      ) AS claim_count
    FROM reality_fork_projects projects
    WHERE projects.id = ?
  `
    )
    .get(projectId) as ProjectRow | undefined;

  return row ?? null;
}

function updateProjectState(
  projectId: string,
  patch: {
    status?: RealityForkProjectStatus;
    currentJobId?: string | null;
    latestReportId?: string | null;
    latestPublicationId?: string | null;
    publishedAt?: number | null;
  }
): void {
  db.prepare(
    `
    UPDATE reality_fork_projects
    SET
      status = COALESCE(?, status),
      current_job_id = CASE WHEN ? = 1 THEN ? ELSE current_job_id END,
      latest_report_id = CASE WHEN ? = 1 THEN ? ELSE latest_report_id END,
      latest_publication_id = CASE WHEN ? = 1 THEN ? ELSE latest_publication_id END,
      published_at = CASE WHEN ? = 1 THEN ? ELSE published_at END,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    patch.status ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'currentJobId') ? 1 : 0,
    patch.currentJobId ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'latestReportId') ? 1 : 0,
    patch.latestReportId ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'latestPublicationId') ? 1 : 0,
    patch.latestPublicationId ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'publishedAt') ? 1 : 0,
    patch.publishedAt ?? null,
    nowUnix(),
    projectId
  );
}

function updateJob(
  jobId: string,
  patch: {
    status?: RealityForkJobStatus;
    currentStage?: RealityForkJobStage;
    progress?: number;
    error?: string | null;
    result?: Record<string, unknown> | null;
    startedAt?: number | null;
    completedAt?: number | null;
  }
): void {
  db.prepare(
    `
    UPDATE reality_fork_jobs
    SET
      status = COALESCE(?, status),
      current_stage = COALESCE(?, current_stage),
      progress = COALESCE(?, progress),
      error = CASE WHEN ? = 1 THEN ? ELSE error END,
      result_json = CASE WHEN ? = 1 THEN ? ELSE result_json END,
      started_at = CASE WHEN ? = 1 THEN ? ELSE started_at END,
      completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    patch.status ?? null,
    patch.currentStage ?? null,
    patch.progress ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'error') ? 1 : 0,
    patch.error ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'result') ? 1 : 0,
    patch.result ? JSON.stringify(patch.result) : null,
    Object.prototype.hasOwnProperty.call(patch, 'startedAt') ? 1 : 0,
    patch.startedAt ?? null,
    Object.prototype.hasOwnProperty.call(patch, 'completedAt') ? 1 : 0,
    patch.completedAt ?? null,
    nowUnix(),
    jobId
  );
}

function getJobRow(jobId: string): JobRow | null {
  const row = db
    .prepare(
      `
    SELECT id, project_id, kind, status, current_stage, progress, error, result_json, created_at, started_at, completed_at, updated_at
    FROM reality_fork_jobs
    WHERE id = ?
  `
    )
    .get(jobId) as JobRow | undefined;

  return row ?? null;
}

function clearDerivedProjectState(projectId: string): void {
  db.prepare('DELETE FROM reality_fork_document_chunks WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_extractions WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_entities WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_claims WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_entity_relationships WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_artifact_citations WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_scenario_inputs WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_lane_rounds WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_simulations WHERE project_id = ?').run(projectId);
  db.prepare('DELETE FROM reality_fork_reports WHERE project_id = ?').run(projectId);
  updateProjectState(projectId, {
    latestReportId: null,
    latestPublicationId: null,
    publishedAt: null,
  });
}

function createArtifactBlob(
  data: string,
  fileName: string,
  mimeType: string,
  store = realityForkBlobStore
): RealityForkBlob {
  return persistBlob(
    store.put({
      data: Buffer.from(data, 'utf8'),
      fileName,
      mimeType,
    }),
    store
  );
}

function buildExtraction(
  evidence: EvidenceRow,
  store = realityForkBlobStore
): {
  summary: string;
  keywords: string[];
  facts: RealityForkFact[];
  artifactBlob: RealityForkBlob;
} {
  const text = (evidence.content_text ?? readBlobText(evidence.blob_id, store)).trim();
  const sentences = splitSentences(text).slice(0, 6);
  const facts = sentences.map((sentence, index) => ({
    id: `${evidence.id}:fact:${index + 1}`,
    type: classifyFact(sentence),
    statement: sentence,
    weight: sentenceWeight(sentence),
  }));

  const keywords = extractKeywords(text);
  const summarySource = sentences[0] ?? previewText(text) ?? evidence.title;
  const summary = summarySource.length <= 180 ? summarySource : `${summarySource.slice(0, 177)}...`;
  const artifactBlob = createArtifactBlob(
    JSON.stringify(
      {
        evidenceId: evidence.id,
        summary,
        keywords,
        facts,
      },
      null,
      2
    ),
    `${evidence.id}-extraction.json`,
    'application/json',
    store
  );

  return { summary, keywords, facts, artifactBlob };
}

function stableNoise(key: string): number {
  const value = Number.parseInt(sha256(key).slice(0, 8), 16);
  return value / 0xffffffff;
}

function stripHtml(html: string): string {
  const $ = loadHtml(html);
  $('script,noscript,style').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
}

function readBlobBuffer(blobId: string | null, store = realityForkBlobStore): Buffer {
  const blob = loadBlob(blobId);
  return blob ? store.read(blob.storageKey) : Buffer.alloc(0);
}

async function extractTextFromBlob(
  evidence: EvidenceRow,
  store = realityForkBlobStore
): Promise<{ text: string; warning: string | null }> {
  const buffer = readBlobBuffer(evidence.blob_id, store);
  if (buffer.byteLength === 0) {
    return { text: '', warning: evidence.source_url ? null : 'No blob content available.' };
  }

  const sourceType = evidence.source_type;
  const mimeType = evidence.mime_type ?? '';
  const fileName = `${evidence.title}.${sourceType}`;

  if (sourceType === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value.trim(),
      warning: result.messages.length > 0 ? (result.messages[0]?.message ?? null) : null,
    };
  }

  if (sourceType === 'pdf') {
    const parsed = await pdfParse(buffer);
    const text = parsed.text.trim();
    if (text) return { text, warning: null };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-pdf-'));
    const tempFile = path.join(tempDir, fileName);
    try {
      fs.writeFileSync(tempFile, buffer);
      const fallback = execFileSync('pdftotext', ['-layout', tempFile, '-'], {
        encoding: 'utf8',
      }).trim();
      return {
        text: fallback,
        warning: fallback
          ? 'Used pdftotext fallback for low-text PDF.'
          : 'PDF text extraction returned no text.',
      };
    } catch {
      return { text: '', warning: 'PDF text extraction returned no text.' };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const text = buffer.toString('utf8');
  if (sourceType === 'html') {
    return { text: stripHtml(text), warning: null };
  }

  if (mimeType.includes('json') || fileName.endsWith('.json')) {
    try {
      return { text: JSON.stringify(JSON.parse(text), null, 2), warning: null };
    } catch {
      return { text, warning: 'Input JSON could not be normalized.' };
    }
  }

  return { text: text.trim(), warning: null };
}

async function fetchExternalSourceText(
  evidence: EvidenceRow
): Promise<{ text: string; warning: string | null }> {
  if (!evidence.source_url) return { text: '', warning: null };
  try {
    const response = await fetch(evidence.source_url, {
      headers: { 'User-Agent': 'kamiyo-reality-fork-studio/1.0' },
    });
    if (!response.ok) {
      return { text: '', warning: `Source fetch degraded: ${response.status}` };
    }
    const raw = await response.text();
    const text =
      evidence.source_type === 'html' ||
      evidence.source_type === 'url' ||
      evidence.source_type.endsWith('_thread') ||
      evidence.source_type === 'polymarket_market'
        ? stripHtml(raw)
        : raw.trim();
    return { text, warning: null };
  } catch (error) {
    return {
      text: '',
      warning: `Source fetch degraded: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

async function hydrateEvidenceContent(
  evidence: EvidenceRow,
  store = realityForkBlobStore
): Promise<{ text: string; warning: string | null }> {
  if (evidence.content_text?.trim()) {
    return { text: evidence.content_text.trim(), warning: evidence.warning };
  }

  const next = evidence.source_url
    ? await fetchExternalSourceText(evidence)
    : await extractTextFromBlob(evidence, store);

  db.prepare(
    `
    UPDATE reality_fork_evidence
    SET content_text = ?, status = ?, warning = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(
    next.text,
    next.text ? 'ready_for_extraction' : 'failed',
    next.warning,
    nowUnix(),
    evidence.id
  );

  return next;
}

function chunkText(projectId: string, evidenceId: string, text: string): RealityForkChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const out: RealityForkChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < normalized.length) {
    const limit = Math.min(start + 800, normalized.length);
    let end = limit;
    if (limit < normalized.length) {
      const window = normalized.slice(start, limit);
      const splitPoint = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'));
      if (splitPoint > 250) {
        end = start + splitPoint + 1;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (!content) break;

    out.push({
      id: `rf_chunk_${sha256(`${evidenceId}:${index}:${start}`).slice(0, 12)}`,
      projectId,
      evidenceId,
      chunkIndex: index,
      content,
      charStart: start,
      charEnd: end,
      createdAt: Date.now(),
    });

    start = end;
    index += 1;
  }

  return out;
}

function persistChunks(projectId: string, chunks: RealityForkChunk[]): void {
  const insert = db.prepare(`
    INSERT INTO reality_fork_document_chunks (
      id, project_id, evidence_id, chunk_index, content, char_start, char_end, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chunk of chunks) {
    insert.run(
      chunk.id,
      projectId,
      chunk.evidenceId,
      chunk.chunkIndex,
      chunk.content,
      chunk.charStart,
      chunk.charEnd,
      nowUnix()
    );
  }
}

function inferEntityCategory(label: string): RealityForkEntity['category'] {
  if (label.startsWith('$') || /market|odds|polymarket/i.test(label)) return 'market';
  if (label.startsWith('@') || /(labs|inc|corp|protocol|foundation|team)$/i.test(label))
    return 'organization';
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(label)) return 'person';
  if (/(city|country|bridge|gaza|iran|israel)/i.test(label)) return 'location';
  if (label.startsWith('#')) return 'topic';
  return 'unknown';
}

function extractStructuredArtifacts(
  project: RealityForkProject,
  evidence: RealityForkEvidence[],
  chunks: RealityForkChunk[]
): {
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
} {
  const entityMap = new Map<string, RealityForkEntity>();
  const claimCandidates: RealityForkClaim[] = [];

  for (const chunk of chunks) {
    const matches =
      chunk.content.match(
        /(?:\$[A-Z0-9]{2,10}|@[A-Za-z0-9_]+|#[A-Za-z0-9_]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g
      ) ?? [];
    const uniqueMatches = [
      ...new Set(matches.map(item => item.trim()).filter(item => item.length > 2)),
    ].slice(0, 16);
    for (const label of uniqueMatches) {
      const key = label.toLowerCase();
      const existing = entityMap.get(key);
      if (existing) {
        existing.mentionCount += 1;
        if (!existing.evidenceRefs.includes(chunk.id)) existing.evidenceRefs.push(chunk.id);
        continue;
      }
      entityMap.set(key, {
        id: `rf_ent_${sha256(`${project.id}:${label}`).slice(0, 12)}`,
        projectId: project.id,
        label,
        category: inferEntityCategory(label),
        aliases: [],
        mentionCount: 1,
        evidenceRefs: [chunk.id],
        createdAt: Date.now(),
      });
    }

    for (const sentence of splitSentences(chunk.content).slice(0, 4)) {
      if (sentence.length < 40) continue;
      const topic = extractKeywords(sentence)[0] ?? uniqueMatches[0] ?? 'topic';
      const factType = classifyFact(sentence);
      const sentiment = factType === 'supporting' ? 0.75 : factType === 'risk' ? -0.75 : 0.1;
      const entityIds = uniqueMatches
        .filter(label => sentence.includes(label))
        .map(label => entityMap.get(label.toLowerCase())?.id)
        .filter((value): value is string => Boolean(value));
      claimCandidates.push({
        id: `rf_claim_${sha256(`${chunk.id}:${sentence}`).slice(0, 12)}`,
        projectId: project.id,
        text: sentence,
        topic,
        sentiment,
        confidence: clamp(sentenceWeight(sentence), 0.2, 0.98),
        evidenceRefs: [chunk.id],
        entityIds,
        createdAt: Date.now(),
      });
    }
  }

  const claims = claimCandidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 24);

  const scenarioBuckets = new Map<string, { summary: string; refs: Set<string>; weight: number }>();
  for (const claim of claims) {
    const bucket = scenarioBuckets.get(claim.topic) ?? {
      summary: claim.text,
      refs: new Set<string>(),
      weight: 0,
    };
    claim.evidenceRefs.forEach(ref => bucket.refs.add(ref));
    bucket.weight += Math.abs(claim.sentiment) + claim.confidence;
    scenarioBuckets.set(claim.topic, bucket);
  }

  const scenarioInputs = [...scenarioBuckets.entries()]
    .map(([topic, bucket], index) => ({
      id: `rf_topic_${sha256(`${project.id}:${topic}:${index}`).slice(0, 12)}`,
      projectId: project.id,
      topic,
      summary: bucket.summary,
      evidenceRefs: [...bucket.refs].sort(),
      weight: round(bucket.weight),
      createdAt: Date.now(),
    }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8);

  return {
    entities: [...entityMap.values()].sort(
      (left, right) =>
        right.mentionCount - left.mentionCount || left.label.localeCompare(right.label)
    ),
    claims,
    scenarioInputs,
  };
}

function buildLaneRounds(
  project: RealityForkProject,
  claims: RealityForkClaim[],
  scenarioInputs: RealityForkScenarioInput[]
): RealityForkLaneRound[] {
  const supportScore = claims
    .filter(claim => claim.sentiment > 0)
    .reduce((sum, claim) => sum + claim.confidence, 0);
  const riskScore = claims
    .filter(claim => claim.sentiment < 0)
    .reduce((sum, claim) => sum + claim.confidence, 0);
  const balance = supportScore - riskScore;
  const evidenceRefs = [...new Set(claims.flatMap(claim => claim.evidenceRefs))];
  const laneRounds: RealityForkLaneRound[] = [];

  for (const lane of project.simulationConfig.lanes) {
    let sentiment = clamp(0.5 + balance * 0.08 + laneWeights[lane].optimismBias, 0.1, 0.9);
    let conviction = clamp(
      0.4 + scenarioInputs.length * 0.04 + laneWeights[lane].evidenceBias * 0.15,
      0.2,
      0.95
    );
    let salience = clamp(
      0.35 + claims.length * 0.02 + laneWeights[lane].volatility * 0.25,
      0.2,
      0.98
    );

    for (let roundIndex = 1; roundIndex <= project.simulationConfig.rounds; roundIndex += 1) {
      const drift = stableNoise(`${project.id}:${lane}:${roundIndex}`) - 0.5;
      sentiment = clamp(
        sentiment + drift * laneWeights[lane].volatility + balance * 0.015,
        0.05,
        0.95
      );
      conviction = clamp(
        conviction + drift * 0.07 + laneWeights[lane].evidenceBias * 0.01,
        0.05,
        0.99
      );
      salience = clamp(
        salience +
          Math.abs(drift) * 0.06 +
          scenarioInputs[roundIndex % Math.max(scenarioInputs.length, 1)]?.weight * 0.004 || 0,
        0.05,
        0.99
      );

      laneRounds.push({
        id: `rf_lane_${sha256(`${project.id}:${lane}:${roundIndex}`).slice(0, 12)}`,
        projectId: project.id,
        lane,
        round: roundIndex,
        sentiment: round(sentiment),
        conviction: round(conviction),
        salience: round(salience),
        summary:
          lane === 'market_lane'
            ? `Round ${roundIndex}: implied odds moved to ${Math.round(sentiment * 100)} with ${Math.round(conviction * 100)} confidence.`
            : `Round ${roundIndex}: ${lane.replace('_', ' ')} stabilized around ${Math.round(sentiment * 100)} sentiment and ${Math.round(salience * 100)} salience.`,
        evidenceRefs: evidenceRefs.slice(0, 8),
        createdAt: Date.now(),
      });
    }
  }

  return laneRounds;
}

function buildHypotheses(
  project: RealityForkProject,
  claims: RealityForkClaim[],
  laneRounds: RealityForkLaneRound[]
): Array<{
  hypothesisId: RealityForkHypothesisId;
  slug: string;
  title: string;
  stance: RealityForkSimulationStance;
  outcome: string;
  probability: number;
  confidence: number;
  impactScore: number;
  laneOutlook: Record<RealityForkLaneId, number>;
  rationale: {
    score: number;
    evidenceIds: string[];
    drivers: string[];
  };
  artifactBlob: RealityForkBlob;
}> {
  const latestByLane = new Map<RealityForkLaneId, RealityForkLaneRound>();
  for (const lane of project.simulationConfig.lanes) {
    const latest = laneRounds.filter(round => round.lane === lane).at(-1);
    if (latest) latestByLane.set(lane, latest);
  }

  const avgLane = (lane: RealityForkLaneId) => latestByLane.get(lane)?.sentiment ?? 0.5;
  const avgConviction = (lane: RealityForkLaneId) => latestByLane.get(lane)?.conviction ?? 0.5;
  const evidenceIds = [...new Set(claims.flatMap(claim => claim.evidenceRefs))];
  const drivers = claims.slice(0, 3).map(claim => claim.text);

  const spec = [
    {
      hypothesisId: 'status_quo' as const,
      score: clamp(
        avgLane('reddit_lane') * 0.5 + avgConviction('reddit_lane') * 0.4 + 0.1,
        0.05,
        0.95
      ),
      impact: 58,
      outcome:
        'The current trajectory persists because the evidence graph stays internally consistent.',
    },
    {
      hypothesisId: 'accelerant' as const,
      score: clamp(
        avgLane('x_lane') * 0.65 + avgConviction('x_lane') * 0.2 + avgLane('market_lane') * 0.15,
        0.05,
        0.98
      ),
      impact: 72,
      outcome: 'Momentum compounds quickly as social adoption outpaces the cautious lanes.',
    },
    {
      hypothesisId: 'backlash' as const,
      score: clamp(
        (1 - avgLane('reddit_lane')) * 0.45 +
          (1 - avgLane('x_lane')) * 0.35 +
          avgConviction('reddit_lane') * 0.2,
        0.05,
        0.98
      ),
      impact: 69,
      outcome:
        'A skeptical social lane hardens into backlash once the negative claims become salient.',
    },
    {
      hypothesisId: 'market_shock' as const,
      score: clamp(
        Math.abs(avgLane('market_lane') - 0.5) * 1.4 + avgConviction('market_lane') * 0.25,
        0.05,
        0.98
      ),
      impact: 81,
      outcome:
        'The market lane reprices abruptly when uncertainty spills into odds and positioning.',
    },
  ];

  return spec.map(item => {
    const laneOutlook = {
      x_lane: round(avgLane('x_lane')),
      reddit_lane: round(avgLane('reddit_lane')),
      market_lane: round(avgLane('market_lane')),
    };
    const artifactBlob = createArtifactBlob(
      JSON.stringify(
        {
          hypothesisId: item.hypothesisId,
          laneOutlook,
          drivers,
          evidenceIds,
        },
        null,
        2
      ),
      `${project.slug}-${item.hypothesisId}.json`,
      'application/json'
    );

    return {
      hypothesisId: item.hypothesisId,
      slug: item.hypothesisId,
      title: hypothesisLabels[item.hypothesisId],
      stance: item.hypothesisId,
      outcome: item.outcome,
      probability: round(item.score),
      confidence: round(
        clamp(0.42 + drivers.length * 0.08 + evidenceIds.length * 0.015, 0.35, 0.94)
      ),
      impactScore: item.impact,
      laneOutlook,
      rationale: {
        score: round(item.score),
        evidenceIds,
        drivers,
      },
      artifactBlob,
    };
  });
}

function policyPackForHypothesis(
  hypothesisId: RealityForkHypothesisId
): BranchExecutionSummary['policyPackId'] {
  switch (hypothesisId) {
    case 'accelerant':
      return 'aggressive';
    case 'backlash':
      return 'verify_first';
    case 'market_shock':
      return 'safe_exit';
    default:
      return 'baseline';
  }
}

async function scoreSimulationBranches(params: {
  project: RealityForkProject;
  chunks: RealityForkChunk[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  hypotheses: Array<{
    hypothesisId: RealityForkHypothesisId;
    slug: string;
    title: string;
    stance: RealityForkSimulationStance;
    outcome: string;
    probability: number;
    confidence: number;
    impactScore: number;
    laneOutlook: Record<RealityForkLaneId, number>;
    rationale: { score: number; evidenceIds: string[]; drivers: string[] };
    artifactBlob: RealityForkBlob;
  }>;
}): Promise<{
  simulations: Array<{
    hypothesisId: RealityForkHypothesisId;
    slug: string;
    title: string;
    outcome: string;
    probability: number;
    confidence: number;
    impactScore: number;
    laneOutlook: Record<RealityForkLaneId, number>;
    rationale: { score: number; evidenceIds: string[]; drivers: string[] };
    artifactBlob: RealityForkBlob;
    scorecard: RealityForkSimulation['scorecard'];
  }>;
  decision: RealityForkDecision;
}> {
  const artifactRefs = [
    ...params.chunks.map(chunk => chunk.id),
    ...params.entities.map(entity => entity.id),
    ...params.claims.map(claim => claim.id),
  ];
  const snapshot: CounterfactualSnapshot = {
    mission: params.project.prompt,
    team: { id: params.project.id, members: [] },
    source: { type: 'manual_evidence' },
    capturedAt: new Date(params.project.createdAt).toISOString(),
    observatory: { escrows: [], events: [] },
    manualEvidence: { artifactRefs },
    runtimeContext: {
      planner: { studio: true },
      truthCourt: { local: true, committeeSize: 3 },
      flags: { lanes: params.project.simulationConfig.lanes.join(',') },
    },
  };

  const branches: BranchExecutionSummary[] = params.hypotheses.map(hypothesis => {
    const plan = {
      mode: 'dag' as const,
      nodes: [
        {
          id: 'extract_entities',
          memberId: 'studio',
          description: 'Extract entities',
          budget: 1,
          dependsOn: [],
        },
        {
          id: 'extract_claims',
          memberId: 'studio',
          description: 'Extract claims',
          budget: 1,
          dependsOn: ['extract_entities'],
        },
        {
          id: 'simulate_lane',
          memberId: 'studio',
          description: 'Simulate lane',
          budget: 1,
          dependsOn: ['extract_claims'],
        },
        {
          id: 'synthesize_report',
          memberId: 'studio',
          description: 'Synthesize report',
          budget: 1,
          dependsOn: ['simulate_lane'],
        },
      ],
    };

    const result: ExecuteSwarmRunResult = {
      runId: `rf_run_${hypothesis.hypothesisId}`,
      status: 'completed',
      executionMode: 'readonly',
      mission: hypothesis.title,
      plan,
      timingMs: {
        startedAt: Date.now(),
        completedAt: Date.now() + Math.round(600 + hypothesis.impactScore * 8),
        duration: Math.round(600 + hypothesis.impactScore * 8),
      },
      totals: {
        reserved: 0,
        spent: round(
          params.project.simulationConfig.activeAgents *
            params.project.simulationConfig.rounds *
            0.002 +
            hypothesis.impactScore * 0.001
        ),
      },
      hashes: {
        planSha256: sha256(JSON.stringify(plan)),
        resultsSha256: sha256(JSON.stringify(hypothesis)),
      },
      kiroku: { skipped: true },
      seeded: 0,
      snapshotHash: sha256(`${params.project.id}:${params.project.prompt}`),
      counterfactualCaseId: params.project.id,
      counterfactualBranchId: hypothesis.slug,
      nodes: {
        extract_entities: {
          status: 'completed',
          output: {
            output: {
              evidenceRefs: params.entities.slice(0, 4).flatMap(entity => entity.evidenceRefs),
            },
          },
        },
        extract_claims: {
          status: 'completed',
          output: {
            output: {
              evidenceRefs: hypothesis.rationale.evidenceIds,
              claims: params.claims.slice(0, 4).map(claim => claim.id),
            },
          },
        },
        simulate_lane: {
          status: 'completed',
          output: {
            output: {
              evidenceRefs: hypothesis.rationale.evidenceIds,
              laneOutlook: hypothesis.laneOutlook,
            },
          },
        },
        synthesize_report: {
          status: 'completed',
          output: {
            output: { evidenceRefs: hypothesis.rationale.evidenceIds, outcome: hypothesis.outcome },
          },
        },
      },
    };

    return {
      branchId: `rf_branch_${hypothesis.hypothesisId}`,
      policyPackId: policyPackForHypothesis(hypothesis.hypothesisId),
      branchKind: policyPackForHypothesis(hypothesis.hypothesisId),
      swarmRunId: result.runId,
      status: 'completed',
      resultHash: sha256(JSON.stringify(hypothesis)),
      result,
    };
  });

  const scored = scoreBranches({ snapshot, branches });
  const scoredBranches = branches.map(branch => ({
    ...branch,
    scorecard: scored.find(scorecard => scorecard.branchId === branch.branchId),
  }));
  const adjudication = await adjudicateBranches({
    caseId: params.project.id,
    snapshotHash: sha256(`${params.project.id}:${params.project.prompt}`),
    decisionMode: params.project.decisionMode,
    branches: scoredBranches,
  });

  return {
    simulations: params.hypotheses.map(hypothesis => {
      const branch = scoredBranches.find(
        item => item.branchId === `rf_branch_${hypothesis.hypothesisId}`
      );
      return {
        ...hypothesis,
        scorecard: branch?.scorecard ?? null,
      };
    }),
    decision: {
      winnerSimulationId: adjudication.winnerBranchId.replace('rf_branch_', ''),
      winnerHypothesisId: adjudication.winnerBranchId.replace(
        'rf_branch_',
        ''
      ) as RealityForkHypothesisId,
      winnerReason: adjudication.winnerReason,
      winnerLabel:
        hypothesisLabels[
          adjudication.winnerBranchId.replace('rf_branch_', '') as RealityForkHypothesisId
        ] ?? null,
      mode: adjudication.mode,
      usedTruthCourt: adjudication.usedTruthCourt,
      committeeDisagreement: adjudication.committeeDisagreement,
      scoreDelta: adjudication.scoreDelta,
      topSimulationIds: adjudication.topBranchIds.map(item => item.replace('rf_branch_', '')),
    },
  };
}

function buildStudioReport(params: {
  project: RealityForkProject;
  evidence: RealityForkEvidence[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
  decision: RealityForkDecision;
  store?: FileSystemBlobStore;
}): {
  headline: string;
  summary: string;
  sections: RealityForkReportSection[];
  metrics: Record<string, number>;
  markdownBlob: RealityForkBlob;
  htmlBlob: RealityForkBlob;
} {
  const winner =
    params.simulations.find(
      simulation => simulation.hypothesisId === params.decision.winnerHypothesisId
    ) ??
    params.simulations[0] ??
    null;
  const summary = winner
    ? `${winner.title} leads after ${params.project.simulationConfig.rounds} rounds with ${Math.round(winner.probability * 100)}% probability and ${Math.round(winner.confidence * 100)}% confidence.`
    : 'No winning hypothesis was produced.';

  const sections: RealityForkReportSection[] = [
    {
      id: 'executive-summary',
      key: 'executive_summary',
      title: 'Executive summary',
      body: summary,
      citations: winner?.rationale.evidenceIds ?? [],
    },
    {
      id: 'entity-graph',
      key: 'entity_graph_summary',
      title: 'Extracted entity graph',
      body:
        params.entities
          .slice(0, 8)
          .map(entity => `${entity.label} (${entity.category})`)
          .join(', ') || 'No entities extracted.',
      citations: params.entities
        .slice(0, 6)
        .flatMap(entity => entity.evidenceRefs)
        .slice(0, 8),
    },
    {
      id: 'key-claims',
      key: 'key_claims',
      title: 'Key claims',
      body: params.claims
        .slice(0, 6)
        .map(claim => `${claim.text} [${claim.evidenceRefs.join(', ')}]`)
        .join('\n'),
      citations: params.claims.slice(0, 6).flatMap(claim => claim.evidenceRefs),
    },
    {
      id: 'lane-narrative',
      key: 'lane_narrative',
      title: 'Platform lane narrative',
      body: params.project.simulationConfig.lanes
        .map(lane => {
          const latest = params.laneRounds.filter(round => round.lane === lane).at(-1);
          return `${lane.replace('_', ' ')}: ${latest?.summary ?? 'No lane rounds captured.'}`;
        })
        .join('\n'),
      citations: params.laneRounds.slice(-6).flatMap(round => round.evidenceRefs),
    },
    {
      id: 'winner-vs-dissent',
      key: 'winner_vs_dissent',
      title: 'Winning branch vs dissent',
      body: winner
        ? `${winner.title} won because ${params.decision.winnerReason ?? 'it held the strongest balance of evidence.'}`
        : 'No winner was selected.',
      citations: winner?.rationale.evidenceIds ?? [],
    },
    {
      id: 'recommendation',
      key: 'recommendation',
      title: 'Recommended action',
      body: winner?.outcome ?? 'Gather more evidence before execution.',
      citations: winner?.rationale.evidenceIds ?? [],
    },
  ];

  const markdown = [
    `# ${params.project.title}`,
    '',
    `Prompt: ${params.project.prompt}`,
    '',
    ...sections.flatMap(section => [
      `## ${section.title}`,
      section.body,
      section.citations.length > 0 ? `Citations: ${section.citations.join(', ')}` : null,
      '',
    ]),
  ]
    .filter((value): value is string => value !== null)
    .join('\n');

  const html = [
    '<article class="reality-fork-report">',
    `<h1>${params.project.title}</h1>`,
    `<p>${params.project.prompt}</p>`,
    ...sections.map(
      section =>
        `<section><h2>${section.title}</h2><p>${section.body.replace(/\n/g, '<br />')}</p>${
          section.citations.length > 0
            ? `<p><strong>Citations:</strong> ${section.citations.join(', ')}</p>`
            : ''
        }</section>`
    ),
    '</article>',
  ].join('');

  return {
    headline: `${params.project.title} report`,
    summary,
    sections,
    metrics: {
      evidenceCount: params.evidence.length,
      entityCount: params.entities.length,
      claimCount: params.claims.length,
      scenarioInputCount: params.scenarioInputs.length,
      laneRoundCount: params.laneRounds.length,
      simulationCount: params.simulations.length,
    },
    markdownBlob: createArtifactBlob(
      markdown,
      `${params.project.slug}-report.md`,
      'text/markdown',
      params.store
    ),
    htmlBlob: createArtifactBlob(
      html,
      `${params.project.slug}-report.html`,
      'text/html',
      params.store
    ),
  };
}

function createPublicationBundleV2(params: {
  project: RealityForkProject;
  report: RealityForkReport;
  evidence: RealityForkEvidence[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
  store?: FileSystemBlobStore;
}) {
  const slug = uniquePublicationSlug(params.project.slug);
  const manifest = {
    version: 2,
    project: {
      id: params.project.id,
      slug: params.project.slug,
      title: params.project.title,
      prompt: params.project.prompt,
      simulationConfig: params.project.simulationConfig,
    },
    report: {
      id: params.report.id,
      headline: params.report.headline,
      summary: params.report.summary,
      markdown: params.report.markdown,
      html: params.report.html,
      sections: params.report.sections,
      decision: params.report.decision,
    },
    evidence: params.evidence,
    entities: params.entities,
    claims: params.claims,
    scenarioInputs: params.scenarioInputs,
    laneRounds: params.laneRounds,
    simulations: params.simulations,
    publishedAt: new Date().toISOString(),
  };
  const bundleBlob = createArtifactBlob(
    JSON.stringify(manifest, null, 2),
    `${slug}.json`,
    'application/json',
    params.store
  );
  return {
    slug,
    title: params.project.title,
    summary: params.report.summary,
    manifest,
    bundleBlob,
  };
}

async function runFullJob(
  job: JobRow,
  store = realityForkBlobStore
): Promise<Record<string, unknown>> {
  clearDerivedProjectState(job.project_id);
  updateProjectState(job.project_id, { status: 'processing' });

  const project = getProject(job.project_id, store);
  if (!project) {
    throw new Error('Project not found');
  }

  const evidenceRows = listEvidenceRows(job.project_id);
  if (evidenceRows.length === 0) {
    throw new Error('Project has no evidence');
  }

  updateJob(job.id, { currentStage: 'ingest', progress: 0.08 });
  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'ingest_started',
    payload: { evidenceCount: evidenceRows.length },
  });

  const hydratedEvidenceRows: EvidenceRow[] = [];
  const allChunks: RealityForkChunk[] = [];
  for (const evidenceRow of evidenceRows) {
    const hydrated = await hydrateEvidenceContent(evidenceRow, store);
    const nextRow = {
      ...evidenceRow,
      content_text: hydrated.text,
      warning: hydrated.warning,
      status: hydrated.text ? 'ready_for_extraction' : 'failed',
    } satisfies EvidenceRow;
    hydratedEvidenceRows.push(nextRow);
    const chunks = chunkText(job.project_id, evidenceRow.id, hydrated.text);
    if (chunks.length > 0) persistChunks(job.project_id, chunks);
    allChunks.push(...chunks);
  }

  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'ingest_completed',
    payload: {
      evidenceCount: hydratedEvidenceRows.length,
      chunkCount: allChunks.length,
    },
  });

  updateJob(job.id, { currentStage: 'extract', progress: 0.28 });
  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'extraction_started',
    payload: { evidenceCount: hydratedEvidenceRows.length },
  });

  const extractionIds: string[] = [];
  for (const evidenceRow of hydratedEvidenceRows) {
    if (!evidenceRow.content_text?.trim()) continue;
    const extraction = buildExtraction(evidenceRow, store);
    const extractionId = `rf_ext_${randomUUID().slice(0, 12)}`;
    extractionIds.push(extractionId);
    db.prepare(
      `
      INSERT INTO reality_fork_extractions (
        id, project_id, evidence_id, summary, keywords_json, facts_json, artifact_blob_id, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      extractionId,
      job.project_id,
      evidenceRow.id,
      extraction.summary,
      JSON.stringify(extraction.keywords),
      JSON.stringify(extraction.facts),
      extraction.artifactBlob.id,
      nowUnix()
    );
  }

  const structured = extractStructuredArtifacts(
    project,
    hydratedEvidenceRows.map(mapEvidence),
    allChunks
  );

  const insertEntity = db.prepare(`
    INSERT INTO reality_fork_entities (
      id, project_id, label, category, aliases_json, mention_count, evidence_refs_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const entity of structured.entities) {
    insertEntity.run(
      entity.id,
      entity.projectId,
      entity.label,
      entity.category,
      JSON.stringify(entity.aliases),
      entity.mentionCount,
      JSON.stringify(entity.evidenceRefs),
      nowUnix()
    );
  }

  const insertClaim = db.prepare(`
    INSERT INTO reality_fork_claims (
      id, project_id, text, topic, sentiment, confidence, evidence_refs_json, entity_ids_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const claim of structured.claims) {
    insertClaim.run(
      claim.id,
      claim.projectId,
      claim.text,
      claim.topic,
      claim.sentiment,
      claim.confidence,
      JSON.stringify(claim.evidenceRefs),
      JSON.stringify(claim.entityIds),
      nowUnix()
    );
  }

  const insertScenarioInput = db.prepare(`
    INSERT INTO reality_fork_scenario_inputs (
      id, project_id, topic, summary, evidence_refs_json, weight, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const scenarioInput of structured.scenarioInputs) {
    insertScenarioInput.run(
      scenarioInput.id,
      scenarioInput.projectId,
      scenarioInput.topic,
      scenarioInput.summary,
      JSON.stringify(scenarioInput.evidenceRefs),
      scenarioInput.weight,
      nowUnix()
    );
  }

  const extractions = listExtractions(job.project_id);
  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'extraction_completed',
    payload: {
      extractionCount: extractions.length,
      entityCount: structured.entities.length,
      claimCount: structured.claims.length,
      topicCount: structured.scenarioInputs.length,
    },
  });

  updateJob(job.id, { currentStage: 'simulate', progress: 0.58 });
  const laneRounds = buildLaneRounds(project, structured.claims, structured.scenarioInputs);
  const insertLaneRound = db.prepare(`
    INSERT INTO reality_fork_lane_rounds (
      id, project_id, lane, round, sentiment, conviction, salience, summary, evidence_refs_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const laneRound of laneRounds) {
    insertLaneRound.run(
      laneRound.id,
      laneRound.projectId,
      laneRound.lane,
      laneRound.round,
      laneRound.sentiment,
      laneRound.conviction,
      laneRound.salience,
      laneRound.summary,
      JSON.stringify(laneRound.evidenceRefs),
      nowUnix()
    );
  }

  const hypotheses = buildHypotheses(project, structured.claims, laneRounds);
  const scored = await scoreSimulationBranches({
    project,
    chunks: allChunks,
    entities: structured.entities,
    claims: structured.claims,
    hypotheses,
  });
  const simulationIds: string[] = [];
  for (const simulation of scored.simulations) {
    const simulationId = `rf_sim_${randomUUID().slice(0, 12)}`;
    simulationIds.push(simulationId);
    db.prepare(
      `
      INSERT INTO reality_fork_simulations (
        id, project_id, slug, title, hypothesis_id, stance, outcome, probability, confidence, impact_score, rationale_json, lane_outlook_json, scorecard_json, artifact_blob_id, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      simulationId,
      job.project_id,
      simulation.slug,
      simulation.title,
      simulation.hypothesisId,
      simulation.stance,
      simulation.outcome,
      simulation.probability,
      simulation.confidence,
      simulation.impactScore,
      JSON.stringify(simulation.rationale),
      JSON.stringify(simulation.laneOutlook),
      simulation.scorecard ? JSON.stringify(simulation.scorecard) : null,
      simulation.artifactBlob.id,
      nowUnix()
    );
  }

  const savedSimulations = listSimulations(job.project_id);
  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'simulation_completed',
    payload: {
      simulationCount: savedSimulations.length,
      lanes: project.simulationConfig.lanes,
      decision: scored.decision,
    },
  });

  updateJob(job.id, { currentStage: 'report', progress: 0.82 });
  const evidence = hydratedEvidenceRows.map(mapEvidence);
  const reportDraft = buildStudioReport({
    project,
    evidence,
    entities: structured.entities,
    claims: structured.claims,
    scenarioInputs: structured.scenarioInputs,
    laneRounds,
    simulations: savedSimulations,
    decision: scored.decision,
    store,
  });

  const reportId = `rf_report_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `
    INSERT INTO reality_fork_reports (
      id, project_id, job_id, headline, summary, markdown_blob_id, html_blob_id, sections_json, decision_json, metrics_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    reportId,
    job.project_id,
    job.id,
    reportDraft.headline,
    reportDraft.summary,
    reportDraft.markdownBlob.id,
    reportDraft.htmlBlob.id,
    JSON.stringify(reportDraft.sections),
    JSON.stringify(scored.decision),
    JSON.stringify(reportDraft.metrics),
    nowUnix()
  );

  updateProjectState(job.project_id, {
    status: 'ready',
    latestReportId: reportId,
  });

  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'report_completed',
    payload: {
      reportId,
      headline: reportDraft.headline,
      winner: scored.decision.winnerHypothesisId,
    },
  });

  return {
    chunkCount: allChunks.length,
    entityCount: structured.entities.length,
    claimCount: structured.claims.length,
    extractionIds,
    simulationIds,
    reportId,
  };
}

async function runPublishJob(
  job: JobRow,
  store = realityForkBlobStore
): Promise<Record<string, unknown>> {
  updateProjectState(job.project_id, { status: 'publishing' });
  updateJob(job.id, { currentStage: 'publish', progress: 0.5 });

  const project = getProject(job.project_id, store);
  if (!project) {
    throw new Error('Project not found');
  }

  const report = loadReportById(project.latestReportId, store);
  if (!report) {
    throw new Error('Project has no report to publish');
  }

  const publicationBundle = createPublicationBundleV2({
    project,
    report,
    entities: listEntities(job.project_id),
    claims: listClaims(job.project_id),
    scenarioInputs: listScenarioInputs(job.project_id),
    laneRounds: listLaneRounds(job.project_id),
    simulations: listSimulations(job.project_id),
    evidence: listEvidenceRows(job.project_id).map(mapEvidence),
    store,
  });

  const publicationId = `rf_pub_${randomUUID().slice(0, 12)}`;
  db.prepare(
    `
    INSERT INTO reality_fork_publications (
      id, project_id, report_id, slug, title, summary, manifest_json, bundle_blob_id, status, created_at, published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
  `
  ).run(
    publicationId,
    job.project_id,
    report.id,
    publicationBundle.slug,
    publicationBundle.title,
    publicationBundle.summary,
    JSON.stringify(publicationBundle.manifest),
    publicationBundle.bundleBlob.id,
    nowUnix(),
    nowUnix()
  );

  const publishedAt = nowUnix();
  updateProjectState(job.project_id, {
    status: 'published',
    latestPublicationId: publicationId,
    publishedAt,
  });

  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'publication_completed',
    payload: {
      publicationId,
      slug: publicationBundle.slug,
    },
  });

  return {
    publicationId,
    slug: publicationBundle.slug,
  };
}

async function runJob(jobId: string): Promise<void> {
  const job = getJobRow(jobId);
  if (!job || job.status !== 'queued') return;

  const startedAt = nowUnix();
  updateJob(jobId, {
    status: 'running',
    startedAt,
    currentStage: job.kind === 'publish' ? 'publish' : 'ingest',
    progress: 0.05,
    error: null,
  });
  updateProjectState(job.project_id, {
    currentJobId: jobId,
    status: job.kind === 'publish' ? 'publishing' : 'processing',
  });
  appendProjectEvent({
    projectId: job.project_id,
    jobId,
    eventType: 'job_started',
    payload: { kind: job.kind },
  });

  try {
    const result = job.kind === 'publish' ? await runPublishJob(job) : await runFullJob(job);
    updateJob(jobId, {
      status: 'completed',
      currentStage: 'complete',
      progress: 1,
      result,
      completedAt: nowUnix(),
    });
    updateProjectState(job.project_id, { currentJobId: null });
    appendProjectEvent({
      projectId: job.project_id,
      jobId,
      eventType: 'job_completed',
      payload: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pipeline failed';
    updateJob(jobId, {
      status: 'failed',
      currentStage: 'failed',
      progress: 1,
      error: message,
      completedAt: nowUnix(),
    });
    updateProjectState(job.project_id, {
      currentJobId: null,
      status: 'failed',
    });
    appendProjectEvent({
      projectId: job.project_id,
      jobId,
      eventType: 'job_failed',
      payload: { error: message },
    });
  }
}

async function drainJobs(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    while (queuedJobs.length > 0) {
      const nextJobId = queuedJobs.shift();
      if (!nextJobId) continue;
      await runJob(nextJobId);
    }
  } finally {
    draining = false;
  }
}

function scheduleDrain(): void {
  if (draining) return;
  queueMicrotask(() => {
    void drainJobs();
  });
}

function assertProjectReadyForNewJob(projectId: string): void {
  const existing = db
    .prepare(
      `
    SELECT id
    FROM reality_fork_jobs
    WHERE project_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `
    )
    .get(projectId) as { id: string } | undefined;

  if (existing) {
    throw new Error('Project already has an active pipeline job');
  }
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(value => String(value).trim()).filter(Boolean))].slice(0, 12);
}

function decodeEvidenceInput(input: CreateRealityForkEvidenceInput): {
  mimeType: string | null;
  buffer: Buffer | null;
  contentText: string | null;
} {
  if (typeof input.text === 'string') {
    const mimeType = input.mimeType ?? 'text/plain';
    return {
      mimeType,
      buffer: Buffer.from(input.text, 'utf8'),
      contentText: input.text,
    };
  }

  if (typeof input.contentBase64 === 'string') {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    const mimeType = input.mimeType ?? 'application/octet-stream';
    const contentText =
      mimeType.startsWith('text/') || mimeType === 'application/json'
        ? buffer.toString('utf8')
        : null;
    return { mimeType, buffer, contentText };
  }

  return {
    mimeType: input.mimeType ?? null,
    buffer: null,
    contentText: null,
  };
}

function getUploadRow(uploadId: string): UploadRow | null {
  const row = db
    .prepare(
      `
    SELECT id, blob_id, file_name, mime_type, size_bytes, source_type, created_at
    FROM reality_fork_uploads
    WHERE id = ?
    LIMIT 1
  `
    )
    .get(uploadId) as UploadRow | undefined;

  return row ?? null;
}

export function createUpload(
  input: {
    fileName: string;
    mimeType?: string | null;
    data: Buffer;
    clientIp?: string | null;
  },
  store = realityForkBlobStore
): RealityForkUpload {
  const blob = persistBlob(
    store.put({
      data: input.data,
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
    }),
    store
  );

  const uploadId = `rf_upload_${randomUUID().slice(0, 12)}`;
  const sourceType = detectSourceType({
    fileName: input.fileName,
    mimeType: input.mimeType ?? null,
  });

  db.prepare(
    `
    INSERT INTO reality_fork_uploads (
      id, blob_id, file_name, mime_type, size_bytes, source_type, created_by_ip, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    uploadId,
    blob.id,
    input.fileName,
    input.mimeType ?? null,
    blob.sizeBytes,
    sourceType,
    input.clientIp ?? null,
    nowUnix()
  );

  const row = getUploadRow(uploadId);
  if (!row) throw new Error('failed to create upload');
  return mapUpload(row);
}

export function createProject(
  input: CreateRealityForkProjectInput,
  store = realityForkBlobStore
): RealityForkProjectDetail {
  const prompt = input.prompt?.trim() || input.claim?.trim() || '';
  const title = input.title?.trim() || titleFromPrompt(prompt);
  const claim = prompt;
  if (!prompt) throw new Error('prompt required');

  const projectId = `rf_proj_${randomUUID().slice(0, 12)}`;
  const slug = uniqueProjectSlug(title);
  const timestamp = nowUnix();
  const simulationConfig = normalizeSimulationConfig(input.simulationConfig);
  db.prepare(
    `
    INSERT INTO reality_fork_projects (
      id, slug, title, prompt, claim, description, tags_json, simulation_config_json, warnings_json, decision_mode, created_by_ip, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'draft', ?, ?)
  `
  ).run(
    projectId,
    slug,
    title,
    prompt,
    claim,
    input.description?.trim() || null,
    JSON.stringify(normalizeTags(input.tags)),
    JSON.stringify(simulationConfig),
    input.decisionMode ?? 'score_then_truth_court',
    input.clientIp ?? null,
    timestamp,
    timestamp
  );

  appendProjectEvent({
    projectId,
    eventType: 'project_created',
    payload: { title, prompt },
  });

  for (const evidence of input.evidence ?? []) {
    addEvidence(projectId, evidence, store);
  }

  for (const uploadId of input.uploadIds ?? []) {
    const upload = getUploadRow(uploadId);
    if (!upload) throw new Error(`upload not found: ${uploadId}`);
    addEvidence(
      projectId,
      {
        title: upload.file_name,
        kind: 'upload',
        sourceType: upload.source_type,
        mimeType: upload.mime_type ?? undefined,
        fileName: upload.file_name,
        uploadId: upload.id,
      },
      store
    );
  }

  if (typeof input.pastedText === 'string' && input.pastedText.trim()) {
    addEvidence(
      projectId,
      {
        title: 'Pasted context',
        kind: 'pasted_text',
        sourceType: 'text',
        mimeType: 'text/plain',
        text: input.pastedText.trim(),
      },
      store
    );
  }

  for (const rawUrl of input.urls ?? []) {
    const sourceUrl = rawUrl.trim();
    if (!sourceUrl) continue;
    addEvidence(
      projectId,
      {
        title: sourceUrl,
        kind: 'source',
        sourceType: detectSourceType({ url: sourceUrl }),
        sourceUrl,
        metadata: { submittedUrl: sourceUrl },
      },
      store
    );
  }

  return getProjectDetail(projectId, store) as RealityForkProjectDetail;
}

export function listProjects(): RealityForkProject[] {
  const rows = db
    .prepare(
      `
    SELECT
      projects.id,
      projects.slug,
      projects.title,
      projects.prompt,
      projects.claim,
      projects.description,
      projects.tags_json,
      projects.simulation_config_json,
      projects.warnings_json,
      projects.decision_mode,
      projects.created_by_ip,
      projects.status,
      projects.current_job_id,
      projects.latest_report_id,
      projects.latest_publication_id,
      projects.created_at,
      projects.updated_at,
      projects.published_at,
      (
        SELECT COUNT(*) FROM reality_fork_evidence evidence
        WHERE evidence.project_id = projects.id
      ) AS evidence_count,
      (
        SELECT COUNT(*) FROM reality_fork_extractions extractions
        WHERE extractions.project_id = projects.id
      ) AS extraction_count,
      (
        SELECT COUNT(*) FROM reality_fork_simulations simulations
        WHERE simulations.project_id = projects.id
      ) AS simulation_count,
      (
        SELECT COUNT(*) FROM reality_fork_document_chunks chunks
        WHERE chunks.project_id = projects.id
      ) AS chunk_count,
      (
        SELECT COUNT(*) FROM reality_fork_entities entities
        WHERE entities.project_id = projects.id
      ) AS entity_count,
      (
        SELECT COUNT(*) FROM reality_fork_claims claims
        WHERE claims.project_id = projects.id
      ) AS claim_count
    FROM reality_fork_projects projects
    ORDER BY projects.created_at DESC, projects.id DESC
  `
    )
    .all() as ProjectRow[];

  return rows.map(mapProject);
}

export function getProject(projectId: string): RealityForkProject | null {
  const row = loadProjectRow(projectId);
  if (!row) return null;
  return mapProject(row);
}

export function getProjectDetail(
  projectId: string,
  store = realityForkBlobStore
): RealityForkProjectDetail | null {
  const project = getProject(projectId);
  if (!project) return null;

  const evidence = listEvidenceRows(projectId).map(mapEvidence);
  const report = loadReportById(project.latestReportId, store);
  return {
    ...project,
    uploads: listUploads(projectId),
    evidence,
    chunks: listChunks(projectId),
    entities: listEntities(projectId),
    claims: listClaims(projectId),
    scenarioInputs: listScenarioInputs(projectId),
    extractions: listExtractions(projectId),
    laneRounds: listLaneRounds(projectId),
    simulations: listSimulations(projectId),
    decision: report?.decision ?? null,
    report,
    publication: loadPublicationById(project.latestPublicationId, store),
    jobs: listJobs(projectId),
    events: listProjectEvents(projectId),
  };
}

export function addEvidence(
  projectId: string,
  input: CreateRealityForkEvidenceInput,
  store = realityForkBlobStore
): RealityForkEvidence {
  if (!loadProjectRow(projectId)) {
    throw new Error('Project not found');
  }

  const title = input.title?.trim();
  if (!title) throw new Error('evidence title required');

  const upload = input.uploadId ? getUploadRow(input.uploadId) : null;
  if (input.uploadId && !upload) {
    throw new Error(`upload not found: ${input.uploadId}`);
  }

  const decoded = upload
    ? { mimeType: upload.mime_type, buffer: null, contentText: null }
    : decodeEvidenceInput(input);
  const blob = upload
    ? loadBlob(upload.blob_id)
    : decoded.buffer
      ? persistBlob(
          store.put({
            data: decoded.buffer,
            fileName:
              input.fileName ??
              `${slugify(title)}${decoded.mimeType === 'application/json' ? '.json' : '.txt'}`,
            mimeType: decoded.mimeType,
          }),
          store
        )
      : null;
  const evidenceId = `rf_ev_${randomUUID().slice(0, 12)}`;
  const timestamp = nowUnix();
  const sourceType =
    input.sourceType ??
    upload?.source_type ??
    detectSourceType({
      fileName: input.fileName ?? upload?.file_name ?? null,
      mimeType: decoded.mimeType,
      url: input.sourceUrl ?? null,
    });

  db.prepare(
    `
    INSERT INTO reality_fork_evidence (
      id, project_id, title, kind, source_type, source_label, source_url, mime_type, blob_id, upload_id, status, warning, content_text, metadata_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', NULL, ?, ?, ?, ?)
  `
  ).run(
    evidenceId,
    projectId,
    title,
    input.kind ?? (upload ? 'upload' : 'note'),
    sourceType,
    input.sourceLabel?.trim() || null,
    input.sourceUrl?.trim() || null,
    decoded.mimeType,
    blob?.id ?? null,
    upload?.id ?? null,
    decoded.contentText,
    JSON.stringify(input.metadata ?? {}),
    timestamp,
    timestamp
  );

  updateProjectState(projectId, {
    status: 'draft',
    latestReportId: null,
    latestPublicationId: null,
    publishedAt: null,
  });
  appendProjectEvent({
    projectId,
    eventType: 'evidence_added',
    payload: {
      evidenceId,
      title,
      kind: input.kind ?? (upload ? 'upload' : 'note'),
      sourceType,
    },
  });

  const row = listEvidenceRows(projectId).find(item => item.id === evidenceId);
  if (!row) {
    throw new Error('failed to load evidence');
  }
  return mapEvidence(row);
}

export function enqueueProjectJob(
  projectId: string,
  kind: RealityForkJobKind,
  store = realityForkBlobStore
): RealityForkJob {
  if (!loadProjectRow(projectId)) {
    throw new Error('Project not found');
  }
  assertProjectReadyForNewJob(projectId);

  const project = getProject(projectId);
  if (kind === 'publish' && !loadReportById(project?.latestReportId ?? null, store)) {
    throw new Error('Project has no report to publish');
  }

  const jobId = `rf_job_${randomUUID().slice(0, 12)}`;
  const timestamp = nowUnix();
  db.prepare(
    `
    INSERT INTO reality_fork_jobs (
      id, project_id, kind, status, current_stage, progress, created_at, updated_at
    )
    VALUES (?, ?, ?, 'queued', 'queued', 0, ?, ?)
  `
  ).run(jobId, projectId, kind, timestamp, timestamp);

  updateProjectState(projectId, { currentJobId: jobId });
  appendProjectEvent({
    projectId,
    jobId,
    eventType: 'job_queued',
    payload: { kind },
  });

  queuedJobs.push(jobId);
  scheduleDrain();

  const job = getJob(jobId);
  if (!job) throw new Error('failed to queue job');
  return job;
}

export function getJob(jobId: string): RealityForkJob | null {
  const row = getJobRow(jobId);
  return row ? mapJob(row) : null;
}

export function listProjectEvents(projectId: string): RealityForkProjectEvent[] {
  const rows = db
    .prepare(
      `
    SELECT id, project_id, job_id, event_type, payload_json, created_at
    FROM reality_fork_project_events
    WHERE project_id = ?
    ORDER BY created_at ASC, rowid ASC
  `
    )
    .all(projectId) as EventRow[];

  return rows.map(mapEvent);
}

export function getPublicationBySlug(
  slug: string,
  store = realityForkBlobStore
): RealityForkPublication | null {
  const row = db
    .prepare(
      `
    SELECT id, project_id, report_id, slug, title, summary, manifest_json, bundle_blob_id, status, created_at, published_at
    FROM reality_fork_publications
    WHERE slug = ?
    LIMIT 1
  `
    )
    .get(slug) as PublicationRow | undefined;

  return row ? mapPublication(row, store) : null;
}

export async function waitForJobCompletion(
  jobId: string,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<RealityForkJob> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollMs = options.pollMs ?? 25;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = getJob(jobId);
    if (!job) throw new Error('Job not found');
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

export function __resetRealityForkForTests(): void {
  queuedJobs.splice(0, queuedJobs.length);
  draining = false;
}
