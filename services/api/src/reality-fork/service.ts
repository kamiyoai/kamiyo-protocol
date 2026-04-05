import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { load as loadHtml } from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db';
import { FileSystemBlobStore, realityForkBlobStore } from './blob-store';
import { adjudicateBranches } from '../control-room/adjudication';
import { scoreBranches } from '../control-room/scoring';
import type { BranchExecutionSummary, CounterfactualSnapshot } from '../control-room/types';
import type { ExecuteSwarmRunResult } from '../swarm/service';

// ── LLM + DKG feature flags ──────────────────────────────────────────
const RF_LLM_ENABLED = process.env.RF_LLM_ENABLED === 'true';
const RF_DKG_ENABLED = process.env.RF_DKG_ENABLED === 'true';
const RF_LLM_MODEL = process.env.RF_LLM_MODEL || 'claude-sonnet-4-5-20250514';

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  if (_anthropicClient) return _anthropicClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _anthropicClient = new Anthropic({ apiKey: key });
  return _anthropicClient;
}

function parseJSONFromLLM<T>(text: string): T {
  const trimmed = text.trim();
  // Try direct parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continue */
  }
  // Try markdown code block
  const codeBlock = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlock?.[1]) {
    try {
      return JSON.parse(codeBlock[1].trim()) as T;
    } catch {
      /* continue */
    }
  }
  // Try first JSON object or array
  // eslint-disable-next-line no-useless-escape
  const firstJson = trimmed.match(/[\[{][\s\S]*[\]}]/);
  if (firstJson?.[0]) {
    return JSON.parse(firstJson[0]) as T;
  }
  throw new Error('Failed to parse JSON from LLM response');
}

async function callClaude(prompt: string, systemPrompt: string, maxTokens = 4096): Promise<string> {
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic client not available');
  const response = await client.messages.create({
    model: RF_LLM_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text;
}
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
  dkg_report_ual: string | null;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type StoredReportPayload = {
  version: 2;
  sections: RealityForkReportSection[];
  executiveSummary: RealityForkReport['executiveSummary'];
  evidenceSummary: RealityForkReport['evidenceSummary'];
  claims: RealityForkReport['claims'];
  laneSummaries: RealityForkReport['laneSummaries'];
  scenarioComparison: RealityForkReport['scenarioComparison'];
  winningRationale: RealityForkReport['winningRationale'];
  socialCard: RealityForkReport['socialCard'];
  quality: RealityForkReport['quality'];
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
const realityForkLimits = {
  dailyProjectsPerIp: 3,
  activeProjectsPerIp: 1,
  dailyPublicationsPerIp: 1,
  maxProjectUploads: 5,
  maxProjectUrls: 3,
  maxProjectUploadBytes: 20 * 1024 * 1024,
  staleUploadTtlSeconds: 24 * 60 * 60,
  highEstimatedCostUsd: 7.5,
} as const;

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

function compactText(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
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

function normalizeEntityKey(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'.:,;()[\]{}]+/g, '')
    .replace(/\b(the|a|an)\b/gi, '')
    .replace(/\b('s|s')\b/gi, '')
    .replace(/^[@#$]+/, '')
    .replace(/[^a-zA-Z0-9\s/-]+/g, '')
    .toLowerCase();
}

function normalizeEntityAlias(label: string): string {
  return normalizeEntityKey(label)
    .replace(/\b(token|tokens|market|markets|team|teams)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeEntityLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, ' ');
  if (!trimmed) return label;
  if (trimmed.startsWith('$') || trimmed.startsWith('@') || trimmed.startsWith('#')) {
    return trimmed;
  }
  if (trimmed === trimmed.toUpperCase()) return trimmed;
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isUsefulEntityLabel(label: string): boolean {
  const normalized = normalizeEntityAlias(label);
  if (normalized.length < 3) return false;
  if (stopWords.has(normalized)) return false;
  if (
    /^(report|reports|update|updates|source|sources|claim|claims|market|markets)$/i.test(normalized)
  ) {
    return false;
  }
  return true;
}

function claimSnippet(text: string, max = 160): string {
  return compactText(text.replace(/\s+/g, ' ').trim(), max);
}

function sentenceSignalScore(
  sentence: string,
  promptKeywords: string[],
  entityLabels: string[]
): number {
  const lower = sentence.toLowerCase();
  const promptHits = promptKeywords.filter(keyword => lower.includes(keyword)).length;
  const entityHits = entityLabels.filter(label => sentence.includes(label)).length;
  const actionBoost =
    /(should|must|need to|likely|unlikely|expected|reported|confirmed|priced)/i.test(sentence)
      ? 0.18
      : 0;
  const numericBoost = /\d/.test(sentence) ? 0.14 : 0;
  return round(
    clamp(
      sentenceWeight(sentence) + promptHits * 0.12 + entityHits * 0.08 + actionBoost + numericBoost,
      0,
      2.2
    )
  );
}

function rankSentences(
  sentences: string[],
  promptKeywords: string[],
  entityLabels: string[]
): string[] {
  return sentences
    .map(sentence => ({
      sentence,
      score: sentenceSignalScore(sentence, promptKeywords, entityLabels),
    }))
    .filter(item => item.sentence.length >= 32 && item.score >= 0.5)
    .sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length)
    .map(item => item.sentence);
}

function inferClaimTopic(
  sentence: string,
  promptKeywords: string[],
  entityLabels: string[]
): string {
  const lower = sentence.toLowerCase();
  const promptMatch = promptKeywords.find(keyword => lower.includes(keyword));
  if (promptMatch) return promptMatch;
  const entityMatch = entityLabels.find(label => sentence.includes(label));
  if (entityMatch) return normalizeEntityKey(entityMatch);
  return extractKeywords(sentence)[0] ?? 'topic';
}

function sentimentForSentence(sentence: string): number {
  const lower = sentence.toLowerCase();
  const supportingHits = supportWords.filter(word => lower.includes(word)).length;
  const riskHits = riskWords.filter(word => lower.includes(word)).length;
  if (supportingHits === riskHits) return 0.1;
  return supportingHits > riskHits ? 0.75 : -0.75;
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

function blobReferenceCount(blobId: string): number {
  const queries = [
    'SELECT COUNT(*) AS count FROM reality_fork_uploads WHERE blob_id = ?',
    'SELECT COUNT(*) AS count FROM reality_fork_evidence WHERE blob_id = ?',
    'SELECT COUNT(*) AS count FROM reality_fork_extractions WHERE artifact_blob_id = ?',
    'SELECT COUNT(*) AS count FROM reality_fork_simulations WHERE artifact_blob_id = ?',
    'SELECT COUNT(*) AS count FROM reality_fork_reports WHERE markdown_blob_id = ? OR html_blob_id = ?',
    'SELECT COUNT(*) AS count FROM reality_fork_publications WHERE bundle_blob_id = ?',
  ];

  return queries.reduce((total, sql) => {
    const row = sql.includes('OR html_blob_id')
      ? (db.prepare(sql).get(blobId, blobId) as { count: number } | undefined)
      : (db.prepare(sql).get(blobId) as { count: number } | undefined);
    return total + (row?.count ?? 0);
  }, 0);
}

function deleteBlobIfUnreferenced(blobId: string | null, store = realityForkBlobStore): void {
  if (!blobId) return;
  if (blobReferenceCount(blobId) > 0) return;
  const blob = loadBlob(blobId);
  if (blob) store.delete(blob.storageKey);
  db.prepare('DELETE FROM reality_fork_blobs WHERE id = ?').run(blobId);
}

function purgeStaleUploads(store = realityForkBlobStore): number {
  const cutoff = nowUnix() - realityForkLimits.staleUploadTtlSeconds;
  const rows = db
    .prepare(
      `
      SELECT uploads.id, uploads.blob_id
      FROM reality_fork_uploads uploads
      LEFT JOIN reality_fork_evidence evidence ON evidence.upload_id = uploads.id
      WHERE evidence.id IS NULL AND uploads.created_at < ?
    `
    )
    .all(cutoff) as Array<{ id: string; blob_id: string }>;

  for (const row of rows) {
    db.prepare('DELETE FROM reality_fork_uploads WHERE id = ?').run(row.id);
    deleteBlobIfUnreferenced(row.blob_id, store);
  }

  return rows.length;
}

function countProjectsByIpSince(clientIp: string, since: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_projects
      WHERE created_by_ip = ? AND created_at >= ?
    `
    )
    .get(clientIp, since) as { count: number } | undefined;
  return row?.count ?? 0;
}

function countActiveProjectsByIp(clientIp: string): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_projects
      WHERE created_by_ip = ?
        AND status IN ('queued', 'processing', 'publishing')
    `
    )
    .get(clientIp) as { count: number } | undefined;
  return row?.count ?? 0;
}

function countPublicationsByIpSince(clientIp: string, since: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM reality_fork_publications publications
      INNER JOIN reality_fork_projects projects ON projects.id = publications.project_id
      WHERE projects.created_by_ip = ? AND publications.published_at >= ?
    `
    )
    .get(clientIp, since) as { count: number } | undefined;
  return row?.count ?? 0;
}

function assertProjectCreationQuota(clientIp: string | null | undefined): void {
  if (!clientIp) return;
  const since = nowUnix() - 24 * 60 * 60;
  if (countProjectsByIpSince(clientIp, since) >= realityForkLimits.dailyProjectsPerIp) {
    throw new Error('project limit reached for this IP in the last 24 hours');
  }
  if (countActiveProjectsByIp(clientIp) >= realityForkLimits.activeProjectsPerIp) {
    throw new Error('an active project is already running for this IP');
  }
}

function assertPublicationQuota(clientIp: string | null | undefined): void {
  if (!clientIp) return;
  const since = nowUnix() - 24 * 60 * 60;
  if (countPublicationsByIpSince(clientIp, since) >= realityForkLimits.dailyPublicationsPerIp) {
    throw new Error('publication limit reached for this IP in the last 24 hours');
  }
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
    snippet: claimSnippet(row.text),
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
    executiveSummary: { body: '', citations: [] },
    evidenceSummary: {
      body: '',
      sourceCount: 0,
      chunkCount: 0,
      entityCount: 0,
      claimCount: 0,
      degradedSourceCount: 0,
      citations: [],
    },
    claims: [],
    laneSummaries: [],
    scenarioComparison: [],
    winningRationale: {
      title: '',
      body: '',
      citations: [],
      runnerUpTitle: null,
    },
    socialCard: {
      title: row.headline,
      winningScenario: null,
      summary: row.summary,
      evidenceCount: 0,
      laneCount: 0,
      rounds: 0,
      publishedAt: null,
    },
    quality: {
      citedClaimCount: 0,
      distinctEntityCount: 0,
      laneDivergence: 0,
      launchReady: false,
      blockers: [],
    },
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
    dkgReportUal: row.dkg_report_ual ?? null,
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
    SELECT id, project_id, report_id, slug, title, summary, manifest_json, bundle_blob_id, status, dkg_report_ual, created_at, published_at
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
    warnings?: string[] | null;
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
      warnings_json = CASE WHEN ? = 1 THEN ? ELSE warnings_json END,
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
    Object.prototype.hasOwnProperty.call(patch, 'warnings') ? 1 : 0,
    patch.warnings ? JSON.stringify(patch.warnings) : patch.warnings === null ? '[]' : null,
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
  const blobIds = db
    .prepare(
      `
      SELECT artifact_blob_id AS blob_id FROM reality_fork_extractions WHERE project_id = ? AND artifact_blob_id IS NOT NULL
      UNION
      SELECT artifact_blob_id AS blob_id FROM reality_fork_simulations WHERE project_id = ? AND artifact_blob_id IS NOT NULL
      UNION
      SELECT markdown_blob_id AS blob_id FROM reality_fork_reports WHERE project_id = ? AND markdown_blob_id IS NOT NULL
      UNION
      SELECT html_blob_id AS blob_id FROM reality_fork_reports WHERE project_id = ? AND html_blob_id IS NOT NULL
      UNION
      SELECT bundle_blob_id AS blob_id FROM reality_fork_publications WHERE project_id = ? AND bundle_blob_id IS NOT NULL
    `
    )
    .all(projectId, projectId, projectId, projectId, projectId) as Array<{ blob_id: string }>;

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
  db.prepare('DELETE FROM reality_fork_publications WHERE project_id = ?').run(projectId);
  for (const { blob_id } of blobIds) {
    deleteBlobIfUnreferenced(blob_id);
  }
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
    })
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
  const promptKeywords = extractKeywords(`${evidence.title} ${text}`).slice(0, 6);
  const sentences = rankSentences(splitSentences(text), promptKeywords, []).slice(0, 6);
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
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const text = parsed.text.trim();
      if (text) return { text, warning: null };
    } finally {
      await parser.destroy();
    }

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
  const promptKeywords = extractKeywords(`${project.title} ${project.prompt}`).slice(0, 6);

  for (const chunk of chunks) {
    const matches =
      chunk.content.match(
        /(?:\$[A-Z0-9]{2,10}|@[A-Za-z0-9_]+|#[A-Za-z0-9_]+|[A-Z]{2,}(?:-[A-Z]{2,})?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g
      ) ?? [];
    const uniqueMatches = [
      ...new Set(
        matches
          .map(item => item.trim())
          .filter(item => item.length > 2)
          .filter(isUsefulEntityLabel)
          .map(canonicalizeEntityLabel)
      ),
    ].slice(0, 16);
    for (const label of uniqueMatches) {
      const key = normalizeEntityAlias(label);
      const existing = entityMap.get(key);
      if (existing) {
        existing.mentionCount += 1;
        if (!existing.evidenceRefs.includes(chunk.id)) existing.evidenceRefs.push(chunk.id);
        if (label !== existing.label && !existing.aliases.includes(label)) {
          existing.aliases.push(label);
        }
        continue;
      }
      entityMap.set(key, {
        id: `rf_ent_${sha256(`${project.id}:${label}`).slice(0, 12)}`,
        projectId: project.id,
        label: canonicalizeEntityLabel(label),
        category: inferEntityCategory(label),
        aliases: [],
        mentionCount: 1,
        evidenceRefs: [chunk.id],
        createdAt: Date.now(),
      });
    }

    const rankedSentences = rankSentences(
      splitSentences(chunk.content),
      promptKeywords,
      uniqueMatches
    ).slice(0, 5);
    for (const sentence of rankedSentences) {
      const topic = inferClaimTopic(sentence, promptKeywords, uniqueMatches);
      const entityIds = uniqueMatches
        .filter(label => sentence.includes(label))
        .map(label => entityMap.get(normalizeEntityAlias(label))?.id)
        .filter((value): value is string => Boolean(value));
      const promptHits = promptKeywords.filter(keyword =>
        sentence.toLowerCase().includes(keyword)
      ).length;
      claimCandidates.push({
        id: `rf_claim_${sha256(`${chunk.id}:${sentence}`).slice(0, 12)}`,
        projectId: project.id,
        text: sentence,
        topic,
        sentiment: sentimentForSentence(sentence),
        confidence: clamp(
          sentenceWeight(sentence) + entityIds.length * 0.05 + promptHits * 0.06,
          0.24,
          0.99
        ),
        evidenceRefs: [chunk.id],
        snippet: claimSnippet(sentence),
        entityIds,
        createdAt: Date.now(),
      });
    }
  }

  const claims = claimCandidates
    .filter((claim, index, all) => all.findIndex(other => other.text === claim.text) === index)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 32);

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

  for (const keyword of promptKeywords) {
    if (scenarioBuckets.has(keyword)) continue;
    const relatedClaims = claims.filter(claim => claim.text.toLowerCase().includes(keyword));
    if (relatedClaims.length === 0) continue;
    scenarioBuckets.set(keyword, {
      summary: compactText(relatedClaims[0]?.text ?? keyword, 180),
      refs: new Set(relatedClaims.flatMap(claim => claim.evidenceRefs)),
      weight: round(
        relatedClaims.reduce((sum, claim) => sum + Math.abs(claim.sentiment) + claim.confidence, 0)
      ),
    });
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
    .slice(0, 10);

  return {
    entities: [...entityMap.values()].sort(
      (left, right) =>
        right.mentionCount - left.mentionCount || left.label.localeCompare(right.label)
    ),
    claims,
    scenarioInputs,
  };
}

async function extractStructuredArtifactsLLM(
  project: RealityForkProject,
  evidence: RealityForkEvidence[],
  chunks: RealityForkChunk[]
): Promise<{
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
}> {
  const contextText = chunks
    .map(c => c.content)
    .join('\n---\n')
    .slice(0, 30000);
  const projectContext = `Project: "${project.title}"\nPrompt: "${project.prompt}"`;

  // 1. Extract entities
  const entitiesRaw = await callClaude(
    `${projectContext}\n\nEvidence text:\n${contextText}\n\nExtract all significant entities from this evidence. For each entity provide: label, category (one of: token, protocol, person, organization, location, topic, unknown), description (1 sentence), and aliases (alternate names). Deduplicate by meaning. Return JSON array of objects with fields: label, category, description, aliases (string array). Maximum 40 entities, sorted by importance.`,
    'You are an expert entity extraction system for intelligence analysis. Return ONLY valid JSON, no markdown or explanation.',
    4096
  );
  const parsedEntities =
    parseJSONFromLLM<
      Array<{ label: string; category: string; description?: string; aliases?: string[] }>
    >(entitiesRaw);
  const entities: RealityForkEntity[] = parsedEntities.slice(0, 40).map(e => ({
    id: `rf_ent_${sha256(`${project.id}:${e.label}`).slice(0, 12)}`,
    projectId: project.id,
    label: e.label,
    category: (e.category || 'unknown') as RealityForkEntity['category'],
    aliases: e.aliases ?? [],
    mentionCount: chunks.filter(c => c.content.includes(e.label)).length || 1,
    evidenceRefs: chunks
      .filter(c => c.content.includes(e.label))
      .map(c => c.id)
      .slice(0, 10),
    createdAt: Date.now(),
  }));

  // 2. Extract claims
  const entityLabels = entities
    .slice(0, 20)
    .map(e => e.label)
    .join(', ');
  const claimsRaw = await callClaude(
    `${projectContext}\n\nKey entities: ${entityLabels}\n\nEvidence text:\n${contextText}\n\nExtract the most important claims, assertions, and factual statements from this evidence. For each claim provide: text (the claim statement, 1-2 sentences), topic (short keyword), sentiment (-1.0 to 1.0), confidence (0.0 to 1.0), stakes (what's at risk), counterclaim (opposing view if any), entityRefs (array of entity labels mentioned). Return JSON array, max 32 claims, sorted by importance.`,
    'You are an expert claim extraction system for intelligence analysis. Return ONLY valid JSON, no markdown or explanation.',
    6144
  );
  const parsedClaims = parseJSONFromLLM<
    Array<{
      text: string;
      topic: string;
      sentiment: number;
      confidence: number;
      stakes?: string;
      counterclaim?: string;
      entityRefs?: string[];
    }>
  >(claimsRaw);
  const claims: RealityForkClaim[] = parsedClaims.slice(0, 32).map(c => {
    const entityIds = (c.entityRefs ?? [])
      .map(ref => entities.find(e => e.label === ref || e.aliases.includes(ref))?.id)
      .filter((id): id is string => Boolean(id));
    const matchingChunks = chunks.filter(ch =>
      ch.content.toLowerCase().includes(c.text.toLowerCase().slice(0, 40))
    );
    return {
      id: `rf_claim_${sha256(`${project.id}:${c.text}`).slice(0, 12)}`,
      projectId: project.id,
      text: c.text,
      topic: c.topic || 'general',
      sentiment: clamp(c.sentiment ?? 0, -1, 1),
      confidence: clamp(c.confidence ?? 0.5, 0.1, 0.99),
      evidenceRefs:
        matchingChunks.length > 0
          ? matchingChunks.map(ch => ch.id).slice(0, 5)
          : ([chunks[0]?.id].filter(Boolean) as string[]),
      snippet: c.text.slice(0, 200),
      entityIds,
      createdAt: Date.now(),
    };
  });

  // 3. Extract scenario topics
  const topicsRaw = await callClaude(
    `${projectContext}\n\nClaims:\n${claims.map(c => `- [${c.topic}] ${c.text}`).join('\n')}\n\nGroup these claims into 4-10 scenario topic clusters. Each cluster should represent a distinct thematic thread that could drive different future outcomes. For each topic provide: topic (short label), summary (1-2 sentence description), weight (0.0 to 1.0, weights should sum to approximately 1.0). Return JSON array sorted by weight descending.`,
    'You are an expert scenario analysis system. Return ONLY valid JSON, no markdown or explanation.',
    2048
  );
  const parsedTopics =
    parseJSONFromLLM<Array<{ topic: string; summary: string; weight: number }>>(topicsRaw);
  const scenarioInputs: RealityForkScenarioInput[] = parsedTopics.slice(0, 10).map((t, i) => ({
    id: `rf_topic_${sha256(`${project.id}:${t.topic}:${i}`).slice(0, 12)}`,
    projectId: project.id,
    topic: t.topic,
    summary: t.summary,
    evidenceRefs: claims
      .filter(
        c =>
          c.topic.toLowerCase().includes(t.topic.toLowerCase()) ||
          t.summary.toLowerCase().includes(c.topic.toLowerCase())
      )
      .flatMap(c => c.evidenceRefs)
      .filter((v, idx, a) => a.indexOf(v) === idx)
      .slice(0, 10),
    weight: round(clamp(t.weight ?? 0.1, 0.01, 1)),
    createdAt: Date.now(),
  }));

  return { entities, claims, scenarioInputs };
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
      const activeTopic =
        scenarioInputs[(roundIndex - 1) % Math.max(scenarioInputs.length, 1)] ??
        ({
          topic: 'core evidence',
          summary: 'Core evidence',
          evidenceRefs,
          weight: 1,
        } as RealityForkScenarioInput);
      const laneClaims = claims.filter(claim => {
        const touchesTopic =
          claim.topic === activeTopic.topic ||
          claim.text.toLowerCase().includes(activeTopic.topic.toLowerCase());
        if (lane === 'market_lane') {
          return (
            touchesTopic ||
            /\b(price|volume|odds|liquidity|treasury|unlock|market|token|yield|basis)\b/i.test(
              claim.text
            )
          );
        }
        if (lane === 'reddit_lane') {
          return touchesTopic || claim.sentiment < 0;
        }
        return touchesTopic || claim.sentiment > 0;
      });
      const focusedClaims = laneClaims.length > 0 ? laneClaims : claims.slice(0, 6);
      const focusedBalance = focusedClaims.reduce(
        (sum, claim) => sum + claim.sentiment * claim.confidence,
        0
      );
      const leadClaim =
        focusedClaims
          .slice()
          .sort(
            (left, right) =>
              Math.abs(right.sentiment * right.confidence) -
              Math.abs(left.sentiment * left.confidence)
          )[0] ?? null;
      const drift = stableNoise(`${project.id}:${lane}:${roundIndex}`) - 0.5;
      sentiment = clamp(
        sentiment +
          drift * laneWeights[lane].volatility +
          balance * 0.01 +
          focusedBalance *
            (lane === 'market_lane' ? 0.028 : lane === 'reddit_lane' ? 0.018 : 0.024),
        0.05,
        0.95
      );
      conviction = clamp(
        conviction +
          drift * 0.07 +
          laneWeights[lane].evidenceBias * 0.01 +
          focusedClaims.length * (lane === 'reddit_lane' ? 0.004 : 0.003),
        0.05,
        0.99
      );
      salience = clamp(
        salience +
          Math.abs(drift) * 0.06 +
          (scenarioInputs[roundIndex % Math.max(scenarioInputs.length, 1)]?.weight ?? 0) * 0.004 +
          Math.min(focusedClaims.length, 5) * 0.012,
        0.05,
        0.99
      );

      const narrativeFocus = leadClaim?.snippet ?? activeTopic.summary;
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
            ? `Round ${roundIndex}: market pricing repriced "${activeTopic.topic}" around ${Math.round(sentiment * 100)} implied odds as traders focused on ${narrativeFocus}.`
            : lane === 'reddit_lane'
              ? `Round ${roundIndex}: Reddit hardened around "${activeTopic.topic}" at ${Math.round(sentiment * 100)} sentiment while long-form discussion concentrated on ${narrativeFocus}.`
              : `Round ${roundIndex}: X momentum moved "${activeTopic.topic}" to ${Math.round(sentiment * 100)} sentiment as the timeline amplified ${narrativeFocus}.`,
        evidenceRefs: (activeTopic.evidenceRefs.length > 0
          ? activeTopic.evidenceRefs
          : evidenceRefs
        ).slice(0, 8),
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

async function buildHypothesesLLM(
  project: RealityForkProject,
  claims: RealityForkClaim[],
  laneRounds: RealityForkLaneRound[]
): Promise<ReturnType<typeof buildHypotheses>> {
  const claimsSummary = claims
    .slice(0, 16)
    .map(c => `- [${c.topic}] (conf=${c.confidence}, sent=${c.sentiment}) ${c.text}`)
    .join('\n');
  const laneSummary = project.simulationConfig.lanes
    .map(lane => {
      const latest = laneRounds.filter(r => r.lane === lane).at(-1);
      return `${lane}: sentiment=${latest?.sentiment ?? 0.5}, conviction=${latest?.conviction ?? 0.5}`;
    })
    .join('; ');
  const evidenceIds = [...new Set(claims.flatMap(c => c.evidenceRefs))];

  const raw = await callClaude(
    `Project: "${project.title}"\nPrompt: "${project.prompt}"\n\nLane state: ${laneSummary}\n\nTop claims:\n${claimsSummary}\n\nGenerate exactly 4 hypotheses about how this situation could unfold. Use these exact IDs: status_quo, accelerant, backlash, market_shock.\n\nFor each hypothesis provide:\n- hypothesisId: one of the 4 IDs above\n- title: compelling 3-6 word title\n- outcome: 2-3 sentence narrative describing what happens and why\n- probability: 0.0-1.0 (must sum to ~1.0 across all 4)\n- confidence: 0.3-0.95 (how certain you are)\n- impactScore: 40-95 (how disruptive)\n- drivers: array of 2-4 key factors driving this outcome\n\nReturn JSON array of 4 objects.`,
    'You are an expert scenario analyst producing hypothesis forecasts. Return ONLY valid JSON.',
    4096
  );

  const parsed = parseJSONFromLLM<
    Array<{
      hypothesisId: string;
      title: string;
      outcome: string;
      probability: number;
      confidence: number;
      impactScore: number;
      drivers: string[];
    }>
  >(raw);

  // Normalize probabilities to sum=1.0
  const totalProb = parsed.reduce((s, h) => s + (h.probability || 0.25), 0);
  const hypothesisIds: RealityForkHypothesisId[] = [
    'status_quo',
    'accelerant',
    'backlash',
    'market_shock',
  ];

  return hypothesisIds.map(hid => {
    const match = parsed.find(p => p.hypothesisId === hid) ?? parsed[hypothesisIds.indexOf(hid)];
    const prob = round(clamp((match?.probability ?? 0.25) / totalProb, 0.05, 0.95));
    const conf = round(clamp(match?.confidence ?? 0.5, 0.3, 0.95));
    const impact = Math.round(clamp(match?.impactScore ?? 60, 40, 95));
    const drivers = match?.drivers ?? claims.slice(0, 3).map(c => c.text);
    const latestByLane = new Map<RealityForkLaneId, RealityForkLaneRound>();
    for (const lane of project.simulationConfig.lanes) {
      const latest = laneRounds.filter(r => r.lane === lane).at(-1);
      if (latest) latestByLane.set(lane, latest);
    }
    const laneOutlook = {
      x_lane: round(latestByLane.get('x_lane')?.sentiment ?? 0.5),
      reddit_lane: round(latestByLane.get('reddit_lane')?.sentiment ?? 0.5),
      market_lane: round(latestByLane.get('market_lane')?.sentiment ?? 0.5),
    };
    const artifactBlob = createArtifactBlob(
      JSON.stringify({ hypothesisId: hid, laneOutlook, drivers, evidenceIds }, null, 2),
      `${project.slug}-${hid}.json`,
      'application/json'
    );
    return {
      hypothesisId: hid,
      slug: hid,
      title: match?.title ?? hypothesisLabels[hid],
      stance: hid as RealityForkSimulationStance,
      outcome: match?.outcome ?? `The ${hid} scenario unfolds based on current evidence.`,
      probability: prob,
      confidence: conf,
      impactScore: impact,
      laneOutlook,
      rationale: { score: prob, evidenceIds, drivers },
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
    stance: RealityForkSimulationStance;
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

function citationLabelsFromRefs(
  refs: string[],
  evidence: RealityForkEvidence[],
  chunks: RealityForkChunk[]
): string[] {
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const chunkById = new Map(chunks.map(item => [item.id, item]));
  return [...new Set(refs)]
    .map(ref => {
      const chunk = chunkById.get(ref);
      if (!chunk) return ref;
      const source = evidenceById.get(chunk.evidenceId)?.title ?? 'Source';
      return `${source}: "${compactText(chunk.content, 96)}"`;
    })
    .slice(0, 8);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function citationSnippetsFromRefs(
  refs: string[],
  evidence: RealityForkEvidence[],
  chunks: RealityForkChunk[]
): Array<{
  ref: string;
  label: string;
  snippet: string;
}> {
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const chunkById = new Map(chunks.map(item => [item.id, item]));
  return [...new Set(refs)]
    .map(ref => {
      const chunk = chunkById.get(ref);
      if (!chunk) {
        return {
          ref,
          label: ref,
          snippet: ref,
        };
      }
      const source = evidenceById.get(chunk.evidenceId)?.title ?? 'Source';
      return {
        ref,
        label: source,
        snippet: claimSnippet(chunk.content, 120),
      };
    })
    .slice(0, 8);
}

function laneLabel(lane: RealityForkLaneId): string {
  switch (lane) {
    case 'market_lane':
      return 'Markets';
    case 'reddit_lane':
      return 'Reddit';
    default:
      return 'X';
  }
}

function reportClaims(params: {
  claims: RealityForkClaim[];
  entities: RealityForkEntity[];
  evidence: RealityForkEvidence[];
  chunks: RealityForkChunk[];
}): RealityForkReport['claims'] {
  const entityById = new Map(params.entities.map(entity => [entity.id, entity]));
  return params.claims.slice(0, 8).map(claim => ({
    id: claim.id,
    topic: claim.topic,
    text: claim.text,
    confidence: claim.confidence,
    sentiment: claim.sentiment,
    snippet: claim.snippet,
    evidenceRefs: claim.evidenceRefs,
    citations: citationLabelsFromRefs(claim.evidenceRefs, params.evidence, params.chunks),
    entityLabels: claim.entityIds
      .map(entityId => entityById.get(entityId)?.label)
      .filter((value): value is string => Boolean(value)),
  }));
}

function reportLaneSummaries(params: {
  lanes: RealityForkLaneId[];
  laneRounds: RealityForkLaneRound[];
  evidence: RealityForkEvidence[];
  chunks: RealityForkChunk[];
}): RealityForkReport['laneSummaries'] {
  return params.lanes.map(lane => {
    const rounds = params.laneRounds.filter(round => round.lane === lane);
    const opening = rounds[0];
    const closing = rounds.at(-1);
    const label = laneLabel(lane);
    if (!opening || !closing) {
      return {
        lane,
        label,
        narrative: `${label} did not capture usable round data.`,
        openingSentiment: 0,
        closingSentiment: 0,
        conviction: 0,
        salience: 0,
        citations: [],
      };
    }
    const delta = round(closing.sentiment - opening.sentiment);
    const narrative =
      lane === 'market_lane'
        ? `${label} repriced from ${Math.round(opening.sentiment * 100)} to ${Math.round(closing.sentiment * 100)} implied odds as conviction settled at ${Math.round(closing.conviction * 100)}.`
        : lane === 'reddit_lane'
          ? `${label} moved from ${Math.round(opening.sentiment * 100)} to ${Math.round(closing.sentiment * 100)} sentiment while salience finished at ${Math.round(closing.salience * 100)}.`
          : `${label} accelerated from ${Math.round(opening.sentiment * 100)} to ${Math.round(closing.sentiment * 100)} sentiment with ${Math.round(closing.conviction * 100)} conviction.`;
    return {
      lane,
      label,
      narrative: delta === 0 ? `${narrative} The lane stayed effectively flat.` : narrative,
      openingSentiment: opening.sentiment,
      closingSentiment: closing.sentiment,
      conviction: closing.conviction,
      salience: closing.salience,
      citations: citationLabelsFromRefs(closing.evidenceRefs, params.evidence, params.chunks),
    };
  });
}

function reportScenarioComparison(params: {
  simulations: RealityForkSimulation[];
  decision: RealityForkDecision;
}): RealityForkReport['scenarioComparison'] {
  const winnerId = params.decision.winnerSimulationId;
  return params.simulations
    .slice()
    .sort((left, right) => right.probability - left.probability)
    .map(simulation => ({
      simulationId: simulation.id,
      hypothesisId: simulation.hypothesisId,
      title: simulation.title,
      stance: simulation.stance,
      outcome: simulation.outcome,
      probability: simulation.probability,
      confidence: simulation.confidence,
      impactScore: simulation.impactScore,
      evidenceCount: simulation.rationale.evidenceIds.length,
      drivers: simulation.rationale.drivers.slice(0, 3),
      riskFlags: simulation.scorecard?.riskFlags ?? [],
      isWinner: simulation.id === winnerId,
    }));
}

function reportQuality(params: {
  claims: RealityForkClaim[];
  entities: RealityForkEntity[];
  laneSummaries: RealityForkReport['laneSummaries'];
}): RealityForkReport['quality'] {
  const citedClaimCount = params.claims.filter(claim => claim.evidenceRefs.length > 0).length;
  const distinctEntityCount = params.entities.length;
  const sentiments = params.laneSummaries.map(item => item.closingSentiment);
  const laneDivergence =
    sentiments.length > 1 ? round(Math.max(...sentiments) - Math.min(...sentiments)) : 0;
  const blockers: string[] = [];
  if (citedClaimCount < 4)
    blockers.push('citation coverage is too thin for a flagship launch report');
  if (distinctEntityCount < 5)
    blockers.push('entity extraction did not produce enough distinct actors');
  if (laneDivergence < 0.08)
    blockers.push('lane outcomes are too similar to demonstrate scenario separation');
  return {
    citedClaimCount,
    distinctEntityCount,
    laneDivergence,
    launchReady: blockers.length === 0,
    blockers,
  };
}

function bulletList(items: string[]): string {
  return items.map(item => `- ${item}`).join('\n');
}

function reportBodyToHtml(body: string): string {
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.every(line => line.startsWith('- '))) {
    return `<ul>${lines.map(line => `<li>${line.slice(2)}</li>`).join('')}</ul>`;
  }
  return `<p>${body.replace(/\n/g, '<br />')}</p>`;
}

async function buildStudioReport(params: {
  project: RealityForkProject;
  evidence: RealityForkEvidence[];
  chunks: RealityForkChunk[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
  decision: RealityForkDecision;
  store?: FileSystemBlobStore;
}): Promise<{
  headline: string;
  summary: string;
  sections: RealityForkReportSection[];
  metrics: Record<string, number>;
  executiveSummary: RealityForkReport['executiveSummary'];
  evidenceSummary: RealityForkReport['evidenceSummary'];
  claims: RealityForkReport['claims'];
  laneSummaries: RealityForkReport['laneSummaries'];
  scenarioComparison: RealityForkReport['scenarioComparison'];
  winningRationale: RealityForkReport['winningRationale'];
  socialCard: RealityForkReport['socialCard'];
  quality: RealityForkReport['quality'];
  markdownBlob: RealityForkBlob;
  htmlBlob: RealityForkBlob;
}> {
  const winner =
    params.simulations.find(
      simulation => simulation.hypothesisId === params.decision.winnerHypothesisId
    ) ??
    params.simulations[0] ??
    null;
  const estimatedCostUsd = estimateProjectCostUsd({
    simulationConfig: params.project.simulationConfig,
    evidenceCount: params.evidence.length,
    chunkCount: params.chunks.length,
    claimCount: params.claims.length,
    scenarioInputCount: params.scenarioInputs.length,
  });
  const degradedEvidence = params.evidence.filter(item => item.warning);
  const detailedClaims = reportClaims({
    claims: params.claims,
    entities: params.entities,
    evidence: params.evidence,
    chunks: params.chunks,
  });
  const laneSummaries = reportLaneSummaries({
    lanes: params.project.simulationConfig.lanes,
    laneRounds: params.laneRounds,
    evidence: params.evidence,
    chunks: params.chunks,
  });
  const scenarioComparison = reportScenarioComparison({
    simulations: params.simulations,
    decision: params.decision,
  });
  const quality = reportQuality({
    claims: params.claims,
    entities: params.entities,
    laneSummaries,
  });
  let summary = winner
    ? `${winner.title} leads after ${params.project.simulationConfig.rounds} rounds across ${params.project.simulationConfig.lanes.length} lanes. ${params.evidence.length} sources produced ${params.claims.length} claims and ${params.entities.length} entities for review.`
    : 'No leading scenario was produced from the current evidence set.';
  const topTopics = params.scenarioInputs.slice(0, 4).map(input => input.topic);
  const winnerScenario = winner
    ? `${winner.title}: ${winner.outcome} (${Math.round(winner.probability * 100)}% probability, ${Math.round(winner.confidence * 100)}% confidence).`
    : 'No winning scenario is available.';
  const runnerUp =
    params.simulations
      .filter(simulation => simulation.id !== winner?.id)
      .sort((left, right) => right.probability - left.probability)[0] ?? null;
  const winnerCitations = citationLabelsFromRefs(
    winner?.rationale.evidenceIds ?? [],
    params.evidence,
    params.chunks
  );
  const degradedSummary =
    degradedEvidence.length > 0
      ? `${degradedEvidence.length} source${degradedEvidence.length === 1 ? '' : 's'} degraded during ingest.`
      : 'All sources produced extractable text.';
  const executiveSummary = {
    body: [summary, winnerScenario].join('\n'),
    citations: winnerCitations,
  };
  const evidenceSummary = {
    body: [
      `${params.evidence.length} source${params.evidence.length === 1 ? '' : 's'} produced ${params.chunks.length} normalized evidence chunk${params.chunks.length === 1 ? '' : 's'}.`,
      `${params.claims.length} claims and ${params.entities.length} entities were retained for comparison.`,
      degradedSummary,
    ].join('\n'),
    sourceCount: params.evidence.length,
    chunkCount: params.chunks.length,
    entityCount: params.entities.length,
    claimCount: params.claims.length,
    degradedSourceCount: degradedEvidence.length,
    citations: citationLabelsFromRefs(
      params.claims.slice(0, 4).flatMap(claim => claim.evidenceRefs),
      params.evidence,
      params.chunks
    ),
  };
  const winningRationale = {
    title: winner?.title ?? 'No winning scenario',
    body: [
      winner
        ? `${winner.title} leads because ${params.decision.winnerReason ?? 'it retained the strongest balance of evidence.'}`
        : 'No winner was selected.',
      runnerUp
        ? `${runnerUp.title} remained the closest alternative at ${Math.round(runnerUp.probability * 100)}% probability.`
        : null,
      topTopics.length > 0 ? `Highest-salience topics: ${topTopics.join(', ')}.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n'),
    citations: winnerCitations,
    runnerUpTitle: runnerUp?.title ?? null,
  };
  const socialCard = {
    title: params.project.title,
    winningScenario: winner?.title ?? null,
    summary: winner?.outcome ?? summary,
    evidenceCount: params.evidence.length,
    laneCount: params.project.simulationConfig.lanes.length,
    rounds: params.project.simulationConfig.rounds,
    publishedAt: null,
  };

  let headline = `${params.project.title} report`;

  // LLM narrative enrichment
  if (RF_LLM_ENABLED && getAnthropicClient()) {
    try {
      const claimsSummary = params.claims
        .slice(0, 12)
        .map(c => `- ${c.text} (${c.topic}, conf=${c.confidence})`)
        .join('\n');
      const simSummary = params.simulations
        .map(s => `- ${s.title}: ${s.outcome} (${Math.round(s.probability * 100)}%)`)
        .join('\n');
      const reportContext = `Project: "${params.project.title}"\nPrompt: "${params.project.prompt}"\n\nKey claims:\n${claimsSummary}\n\nScenarios:\n${simSummary}\n\nWinner: ${winner?.title ?? 'none'} — ${winner?.outcome ?? 'no outcome'}`;

      // Executive summary + headline
      const esRaw = await callClaude(
        `${reportContext}\n\nWrite an executive summary for this Reality Fork intelligence report. Provide:\n1. headline: A compelling 8-15 word headline\n2. summary: 2-3 sentence overview\n3. detailed: A 150-300 word executive summary covering key findings, dominant scenario, critical uncertainties, and recommended stance\n\nReturn JSON with fields: headline, summary, detailed`,
        'You are an elite intelligence analyst writing executive briefings. Return ONLY valid JSON.',
        2048
      );
      const es = parseJSONFromLLM<{ headline: string; summary: string; detailed: string }>(esRaw);
      headline = es.headline || headline;
      executiveSummary.body = es.detailed;
      summary = es.summary;

      // Winning rationale
      const wrRaw = await callClaude(
        `${reportContext}\n\nExplain why "${winner?.title ?? 'the winning scenario'}" emerged as the dominant outcome. Cover:\n1. The evidence pattern that supports it\n2. Why alternatives were less compelling\n3. Key risks and blind spots\n\nWrite 100-200 words of analytical prose. Return JSON with field: rationale`,
        'You are an elite intelligence analyst. Return ONLY valid JSON.',
        1024
      );
      const wr = parseJSONFromLLM<{ rationale: string }>(wrRaw);
      winningRationale.body = wr.rationale;
    } catch {
      // Fall back to deterministic narrative
    }
  }

  const sections: RealityForkReportSection[] = [
    {
      id: 'executive-summary',
      key: 'executive_summary',
      title: 'Executive summary',
      body: executiveSummary.body,
      citations: executiveSummary.citations,
    },
    {
      id: 'evidence-base',
      key: 'evidence_base',
      title: 'Evidence base',
      body: bulletList([
        `${params.evidence.length} source${params.evidence.length === 1 ? '' : 's'} reviewed`,
        `${params.chunks.length} normalized evidence chunk${params.chunks.length === 1 ? '' : 's'} generated`,
        `${params.claims.length} claims and ${params.entities.length} entities extracted`,
        degradedSummary,
      ]),
      citations: evidenceSummary.citations,
    },
    {
      id: 'entity-graph',
      key: 'entity_graph_summary',
      title: 'Extracted entity graph',
      body: params.entities.length
        ? bulletList(
            params.entities
              .slice(0, 8)
              .map(
                entity => `${entity.label} (${entity.category}, ${entity.mentionCount} mentions)`
              )
          )
        : 'No entities extracted.',
      citations: params.entities
        .slice(0, 6)
        .flatMap(entity => entity.evidenceRefs)
        .slice(0, 8)
        .map(ref => citationLabelsFromRefs([ref], params.evidence, params.chunks)[0] ?? ref),
    },
    {
      id: 'key-claims',
      key: 'key_claims',
      title: 'Key claims',
      body: bulletList(
        detailedClaims.map(
          claim => `${claim.text} (${Math.round(claim.confidence * 100)}% confidence)`
        )
      ),
      citations: detailedClaims.flatMap(claim => claim.citations).slice(0, 8),
    },
    {
      id: 'scenario-map',
      key: 'scenario_map',
      title: 'Scenario map',
      body: bulletList(
        params.simulations
          .slice()
          .sort((left, right) => right.probability - left.probability)
          .map(
            simulation =>
              `${simulation.title}: ${Math.round(simulation.probability * 100)}% probability, ${Math.round(simulation.confidence * 100)}% confidence, ${simulation.outcome}`
          )
      ),
      citations: citationLabelsFromRefs(
        params.simulations.flatMap(simulation => simulation.rationale.evidenceIds),
        params.evidence,
        params.chunks
      ),
    },
    {
      id: 'lane-narrative',
      key: 'lane_narrative',
      title: 'Platform lane narrative',
      body: bulletList(laneSummaries.map(item => `${item.label}: ${item.narrative}`)),
      citations: laneSummaries.flatMap(item => item.citations).slice(0, 8),
    },
    {
      id: 'decision-rationale',
      key: 'decision_rationale',
      title: 'Decision rationale',
      body: bulletList(winningRationale.body.split('\n').filter(Boolean)),
      citations: winningRationale.citations,
    },
    {
      id: 'recommendation',
      key: 'recommendation',
      title: 'Recommended action',
      body: [
        winner?.outcome ?? 'Gather more evidence before execution.',
        `Estimated pipeline spend: $${estimatedCostUsd.toFixed(2)}.`,
      ].join('\n'),
      citations: winnerCitations,
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
        `<section><h2>${section.title}</h2>${reportBodyToHtml(section.body)}${
          section.citations.length > 0
            ? `<p><strong>Citations:</strong> ${section.citations.join(', ')}</p>`
            : ''
        }</section>`
    ),
    '</article>',
  ].join('');

  return {
    headline,
    summary,
    sections,
    metrics: {
      evidenceCount: params.evidence.length,
      degradedEvidenceCount: degradedEvidence.length,
      entityCount: params.entities.length,
      claimCount: params.claims.length,
      scenarioInputCount: params.scenarioInputs.length,
      laneRoundCount: params.laneRounds.length,
      simulationCount: params.simulations.length,
      citationCount: sections.reduce((total, section) => total + section.citations.length, 0),
      estimatedCostUsd,
      citedClaimCount: quality.citedClaimCount,
      distinctEntityCount: quality.distinctEntityCount,
      laneDivergence: quality.laneDivergence,
      launchReady: quality.launchReady ? 1 : 0,
    },
    executiveSummary,
    evidenceSummary,
    claims: detailedClaims,
    laneSummaries,
    scenarioComparison,
    winningRationale,
    socialCard,
    quality,
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

function enrichReport(params: {
  report: RealityForkReport;
  project: RealityForkProject;
  evidence: RealityForkEvidence[];
  chunks: RealityForkChunk[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
  publishedAt?: number | null;
}): RealityForkReport {
  const decision = params.report.decision;
  if (!decision) return params.report;

  const winner =
    params.simulations.find(
      simulation => simulation.hypothesisId === decision.winnerHypothesisId
    ) ??
    params.simulations[0] ??
    null;
  const runnerUp =
    params.simulations
      .filter(simulation => simulation.id !== winner?.id)
      .sort((left, right) => right.probability - left.probability)[0] ?? null;
  const summary = params.report.summary;
  const winnerCitations = citationLabelsFromRefs(
    winner?.rationale.evidenceIds ?? [],
    params.evidence,
    params.chunks
  );
  const degradedSourceCount = params.evidence.filter(item => item.warning).length;
  const claims = reportClaims({
    claims: params.claims,
    entities: params.entities,
    evidence: params.evidence,
    chunks: params.chunks,
  });
  const laneSummaries = reportLaneSummaries({
    lanes: params.project.simulationConfig.lanes,
    laneRounds: params.laneRounds,
    evidence: params.evidence,
    chunks: params.chunks,
  });
  const scenarioComparison = reportScenarioComparison({
    simulations: params.simulations,
    decision,
  });
  const quality = reportQuality({
    claims: params.claims,
    entities: params.entities,
    laneSummaries,
  });
  const topTopics = params.scenarioInputs.slice(0, 4).map(input => input.topic);
  const winningRationale = {
    title: winner?.title ?? 'No winning scenario',
    body: [
      winner
        ? `${winner.title} leads because ${decision.winnerReason ?? 'it retained the strongest balance of evidence.'}`
        : 'No winner was selected.',
      runnerUp
        ? `${runnerUp.title} remained the closest alternative at ${Math.round(runnerUp.probability * 100)}% probability.`
        : null,
      topTopics.length > 0 ? `Highest-salience topics: ${topTopics.join(', ')}.` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n'),
    citations: winnerCitations,
    runnerUpTitle: runnerUp?.title ?? null,
  };

  return {
    ...params.report,
    executiveSummary: {
      body:
        params.report.sections.find(section => section.key === 'executive_summary')?.body ??
        summary,
      citations: winnerCitations,
    },
    evidenceSummary: {
      body:
        params.report.sections.find(section => section.key === 'evidence_base')?.body ??
        `${params.evidence.length} sources, ${params.claims.length} claims, ${params.entities.length} entities.`,
      sourceCount: params.evidence.length,
      chunkCount: params.chunks.length,
      entityCount: params.entities.length,
      claimCount: params.claims.length,
      degradedSourceCount,
      citations: citationLabelsFromRefs(
        params.claims.slice(0, 4).flatMap(claim => claim.evidenceRefs),
        params.evidence,
        params.chunks
      ),
    },
    claims,
    laneSummaries,
    scenarioComparison,
    winningRationale,
    socialCard: {
      title: params.project.title,
      winningScenario: winner?.title ?? null,
      summary: winner?.outcome ?? summary,
      evidenceCount: params.evidence.length,
      laneCount: params.project.simulationConfig.lanes.length,
      rounds: params.project.simulationConfig.rounds,
      publishedAt: params.publishedAt ? new Date(params.publishedAt).toISOString() : null,
    },
    quality,
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
  const publishedAt = Date.now();
  const report = enrichReport({
    report: params.report,
    project: params.project,
    evidence: params.evidence,
    chunks: listChunks(params.project.id),
    entities: params.entities,
    claims: params.claims,
    scenarioInputs: params.scenarioInputs,
    laneRounds: params.laneRounds,
    simulations: params.simulations,
    publishedAt,
  });
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
      id: report.id,
      headline: report.headline,
      summary: report.summary,
      markdown: report.markdown,
      html: report.html,
      sections: report.sections,
      decision: report.decision,
      executiveSummary: report.executiveSummary,
      evidenceSummary: report.evidenceSummary,
      claims: report.claims,
      laneSummaries: report.laneSummaries,
      scenarioComparison: report.scenarioComparison,
      winningRationale: report.winningRationale,
      socialCard: report.socialCard,
      quality: report.quality,
    },
    evidence: params.evidence,
    entities: params.entities,
    claims: params.claims,
    scenarioInputs: params.scenarioInputs,
    laneRounds: params.laneRounds,
    simulations: params.simulations,
    publishedAt: new Date(publishedAt).toISOString(),
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
    summary: report.summary,
    manifest,
    bundleBlob,
  };
}

async function runFullJob(
  job: JobRow,
  store = realityForkBlobStore
): Promise<Record<string, unknown>> {
  clearDerivedProjectState(job.project_id);
  updateProjectState(job.project_id, { status: 'processing', warnings: [] });

  const project = getProject(job.project_id);
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

  let structured: {
    entities: RealityForkEntity[];
    claims: RealityForkClaim[];
    scenarioInputs: RealityForkScenarioInput[];
  };
  if (RF_LLM_ENABLED && getAnthropicClient()) {
    try {
      structured = await extractStructuredArtifactsLLM(
        project,
        hydratedEvidenceRows.map(mapEvidence),
        allChunks
      );
    } catch {
      structured = extractStructuredArtifacts(
        project,
        hydratedEvidenceRows.map(mapEvidence),
        allChunks
      );
    }
  } else {
    structured = extractStructuredArtifacts(
      project,
      hydratedEvidenceRows.map(mapEvidence),
      allChunks
    );
  }

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

  let hypotheses: ReturnType<typeof buildHypotheses>;
  if (RF_LLM_ENABLED && getAnthropicClient()) {
    try {
      hypotheses = await buildHypothesesLLM(project, structured.claims, laneRounds);
    } catch {
      hypotheses = buildHypotheses(project, structured.claims, laneRounds);
    }
  } else {
    hypotheses = buildHypotheses(project, structured.claims, laneRounds);
  }
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
  const estimatedCostUsd = estimateProjectCostUsd({
    simulationConfig: project.simulationConfig,
    evidenceCount: evidence.length,
    chunkCount: allChunks.length,
    claimCount: structured.claims.length,
    scenarioInputCount: structured.scenarioInputs.length,
  });
  const reportDraft = await buildStudioReport({
    project,
    evidence,
    chunks: allChunks,
    entities: structured.entities,
    claims: structured.claims,
    scenarioInputs: structured.scenarioInputs,
    laneRounds,
    simulations: savedSimulations,
    decision: scored.decision,
    store,
  });
  const warnings = [
    ...buildProjectWarnings({
      evidence,
      estimatedCostUsd,
      claimCount: structured.claims.length,
      scenarioInputCount: structured.scenarioInputs.length,
    }),
    ...reportDraft.quality.blockers.map(blocker => `Launch-quality gate: ${blocker}.`),
  ];

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
    warnings,
  });

  appendProjectEvent({
    projectId: job.project_id,
    jobId: job.id,
    eventType: 'report_completed',
    payload: {
      reportId,
      headline: reportDraft.headline,
      winner: scored.decision.winnerHypothesisId,
      estimatedCostUsd,
      warningCount: warnings.length,
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

// Lazy singleton for V9 publisher (persists across publishes to reuse P2P node)
let v9PublisherInstance: InstanceType<
  typeof import('@kamiyo/reality-fork-dkg').RealityForkPublisherV9
> | null = null;

function buildReportPublishData(
  project: RealityForkProject,
  report: RealityForkReport,
  simulations: RealityForkSimulation[]
) {
  const winnerHypId =
    report.decision?.winnerHypothesisId ?? simulations[0]?.hypothesisId ?? 'status_quo';
  const winner = simulations.find(s => s.hypothesisId === winnerHypId) ?? simulations[0];
  return {
    projectId: project.id,
    projectName: project.title,
    description: report.summary,
    hypothesisCount: simulations.length,
    laneCount: project.simulationConfig.lanes.length,
    simulationRounds: project.simulationConfig.rounds,
    winnerHypothesisId: winnerHypId,
    probability: winner?.probability ?? 0.5,
    impactScore: winner?.impactScore ?? 50,
    evidenceCount: report.evidenceSummary?.sourceCount ?? 0,
    reportHash: sha256(report.id),
    createdAt: new Date(report.createdAt).toISOString(),
  };
}

async function publishToDKGv8(
  publicationId: string,
  project: RealityForkProject,
  report: RealityForkReport,
  simulations: RealityForkSimulation[]
): Promise<void> {
  const { getParanetConfig } = await import('../api/routes/_dkg-config');
  const { createDKGClient } = await import('@kamiyo/agent-paranet');
  const { RealityForkPublisher } = await import('@kamiyo/reality-fork-dkg');

  const config = getParanetConfig();
  const dkgClient = await createDKGClient(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publisher = new RealityForkPublisher(dkgClient as any, {
    paranetUAL: config.paranetUAL ?? '',
    epochs: config.epochs ?? 12,
  });

  const reportResult = await publisher.publishReport(
    buildReportPublishData(project, report, simulations)
  );

  if (reportResult.success && reportResult.ual) {
    db.prepare('UPDATE reality_fork_publications SET dkg_report_ual = ? WHERE id = ?').run(
      reportResult.ual,
      publicationId
    );
  }
}

async function publishToDKGv9(
  publicationId: string,
  project: RealityForkProject,
  report: RealityForkReport,
  simulations: RealityForkSimulation[]
): Promise<{ success: boolean; ual?: string; error?: string }> {
  const { RealityForkPublisherV9 } = await import('@kamiyo/reality-fork-dkg');

  if (!v9PublisherInstance) {
    const bootstrapPeers = (process.env.RF_DKG_V9_BOOTSTRAP_PEERS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const operationalKeys = (process.env.RF_DKG_V9_OP_KEYS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Import the V9 agent from services/api where it's installed
    const agentMod = await import('@origintrail-official/dkg-agent');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentFactory = (agentMod as any).DKGAgent ?? (agentMod as any).default?.DKGAgent;

    v9PublisherInstance = new RealityForkPublisherV9(
      {
        dataDir: process.env.RF_DKG_V9_DATA_DIR ?? '/tmp/kamiyo-dkg-v9',
        bootstrapPeers,
        chainRpcUrl: process.env.RF_DKG_V9_CHAIN_RPC ?? '',
        chainHubAddress: process.env.RF_DKG_V9_HUB_ADDRESS ?? '',
        operationalKeys,
        paranetId: process.env.RF_DKG_V9_PARANET_ID ?? '',
        epochs: 12,
      },
      agentFactory
    );
  }

  const publishData = buildReportPublishData(project, report, simulations);
  const reportResult = await v9PublisherInstance.publishReport(publishData);

  if (reportResult.success && reportResult.ual) {
    db.prepare('UPDATE reality_fork_publications SET dkg_report_ual = ? WHERE id = ?').run(
      reportResult.ual,
      publicationId
    );
  }

  // Surface result for debugging
  return reportResult;
}

async function publishToDKG(
  publicationId: string,
  project: RealityForkProject,
  report: RealityForkReport,
  simulations: RealityForkSimulation[]
): Promise<Record<string, unknown>> {
  try {
    const dkgVersion = process.env.RF_DKG_VERSION ?? 'v8';
    if (dkgVersion === 'v9') {
      const result = await publishToDKGv9(publicationId, project, report, simulations);
      return {
        ok: result?.success ?? false,
        version: 'v9',
        ual: result?.ual,
        error: result?.error,
      };
    } else {
      await publishToDKGv8(publicationId, project, report, simulations);
      return { ok: true, version: 'v8' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function runPublishJob(
  job: JobRow,
  store = realityForkBlobStore
): Promise<Record<string, unknown>> {
  updateProjectState(job.project_id, { status: 'publishing' });
  updateJob(job.id, { currentStage: 'publish', progress: 0.5 });

  const project = getProject(job.project_id);
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

  // DKG publishing — awaited but non-fatal (V9 agent init can take 30s+)
  let dkgResult: Record<string, unknown> | null = null;
  if (RF_DKG_ENABLED) {
    try {
      dkgResult = await publishToDKG(
        publicationId,
        project,
        report,
        listSimulations(job.project_id)
      );
    } catch {
      dkgResult = { ok: false, error: 'unexpected throw' };
    }
  }

  return {
    publicationId,
    slug: publicationBundle.slug,
    ...(dkgResult ? { dkg: dkgResult } : {}),
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

function estimateProjectCostUsd(params: {
  simulationConfig: RealityForkSimulationConfig;
  evidenceCount: number;
  chunkCount: number;
  claimCount: number;
  scenarioInputCount: number;
}): number {
  const extractionCost =
    params.evidenceCount * 0.07 + params.chunkCount * 0.008 + params.claimCount * 0.014;
  const simulationCost =
    params.simulationConfig.lanes.length *
      (params.simulationConfig.rounds * 0.03 + params.simulationConfig.activeAgents * 0.02) +
    params.simulationConfig.representedPopulation * 0.002;
  const reportCost = params.scenarioInputCount * 0.04 + 0.18;
  return round(extractionCost + simulationCost + reportCost);
}

function buildProjectWarnings(params: {
  evidence: RealityForkEvidence[];
  estimatedCostUsd: number;
  claimCount: number;
  scenarioInputCount: number;
}): string[] {
  const warnings: string[] = [];
  const degraded = params.evidence.filter(item => item.warning);
  if (degraded.length > 0) {
    warnings.push(
      `${degraded.length} source${degraded.length === 1 ? '' : 's'} degraded during ingest and may weaken citation coverage.`
    );
  }
  if (params.claimCount < 4) {
    warnings.push(
      'The evidence set produced only a small claim set, so scenario divergence is limited.'
    );
  }
  if (params.scenarioInputCount < 2) {
    warnings.push(
      'Topic coverage is narrow. Add more evidence if you need broader scenario exploration.'
    );
  }
  if (params.estimatedCostUsd >= realityForkLimits.highEstimatedCostUsd) {
    warnings.push(
      `Estimated pipeline spend is $${params.estimatedCostUsd.toFixed(2)} for this run.`
    );
  }
  return warnings;
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
  purgeStaleUploads(store);
  const blob = persistBlob(
    store.put({
      data: input.data,
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
    })
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
  purgeStaleUploads(store);
  assertProjectCreationQuota(input.clientIp ?? null);
  const prompt = input.prompt?.trim() || input.claim?.trim() || '';
  const title = input.title?.trim() || titleFromPrompt(prompt);
  const claim = prompt;
  if (!prompt) throw new Error('prompt required');
  const uploadIds = [...new Set(input.uploadIds ?? [])];
  const urls = [...new Set((input.urls ?? []).map(value => value.trim()).filter(Boolean))];
  if (uploadIds.length > realityForkLimits.maxProjectUploads) {
    throw new Error(`project accepts at most ${realityForkLimits.maxProjectUploads} uploads`);
  }
  if (urls.length > realityForkLimits.maxProjectUrls) {
    throw new Error(`project accepts at most ${realityForkLimits.maxProjectUrls} urls`);
  }

  const uploads = uploadIds.map(uploadId => {
    const upload = getUploadRow(uploadId);
    if (!upload) throw new Error(`upload not found: ${uploadId}`);
    return upload;
  });
  const totalUploadBytes = uploads.reduce((sum, upload) => sum + upload.size_bytes, 0);
  if (totalUploadBytes > realityForkLimits.maxProjectUploadBytes) {
    throw new Error('project upload payload exceeds the 20 MB limit');
  }

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

  for (const upload of uploads) {
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

  for (const sourceUrl of urls) {
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
  const chunks = listChunks(projectId);
  const entities = listEntities(projectId);
  const claims = listClaims(projectId);
  const scenarioInputs = listScenarioInputs(projectId);
  const laneRounds = listLaneRounds(projectId);
  const simulations = listSimulations(projectId);
  const report = loadReportById(project.latestReportId, store);
  const publication = loadPublicationById(project.latestPublicationId, store);
  return {
    ...project,
    uploads: listUploads(projectId),
    evidence,
    chunks,
    entities,
    claims,
    scenarioInputs,
    extractions: listExtractions(projectId),
    laneRounds,
    simulations,
    decision: report?.decision ?? null,
    report: report
      ? enrichReport({
          report,
          project,
          evidence,
          chunks,
          entities,
          claims,
          scenarioInputs,
          laneRounds,
          simulations,
          publishedAt: publication?.publishedAt ?? null,
        })
      : null,
    publication,
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
          })
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
  if (kind === 'publish') {
    assertPublicationQuota(project?.createdByIp ?? null);
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
    SELECT id, project_id, report_id, slug, title, summary, manifest_json, bundle_blob_id, status, dkg_report_ual, created_at, published_at
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
