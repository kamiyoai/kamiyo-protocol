import { randomUUID } from 'crypto';
import type { DB } from '../db-types';

export interface Episode {
  id: string;
  agentId: string;
  input: string;
  output: string;
  summary: string | null;
  tags: string | null;
  qualityScore: number | null;
  variantId: string | null;
  goalId: string | null;
  runId: string | null;
  turns: number | null;
  toolsUsed: string | null;
  durationMs: number | null;
  createdAt: number;
}

export interface EpisodicRecallOptions {
  query?: string;
  limit?: number;
  minScore?: number;
  goalId?: string;
}

export class EpisodicMemory {
  constructor(
    private db: DB,
    private agentId: string
  ) {}

  store(episode: {
    input: string;
    output: string;
    summary?: string;
    tags?: string[];
    qualityScore?: number;
    variantId?: string;
    goalId?: string;
    runId?: string;
    turns?: number;
    toolsUsed?: string[];
    durationMs?: number;
  }): string {
    const id = randomUUID();
    this.db
      .prepare(
        `
      INSERT INTO agent_episodes_content
        (id, agent_id, input, output, summary, tags, quality_score, variant_id, goal_id, run_id, turns, tools_used, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        this.agentId,
        episode.input,
        episode.output,
        episode.summary ?? null,
        episode.tags?.join(',') ?? null,
        episode.qualityScore ?? null,
        episode.variantId ?? null,
        episode.goalId ?? null,
        episode.runId ?? null,
        episode.turns ?? null,
        episode.toolsUsed?.join(',') ?? null,
        episode.durationMs ?? null
      );
    return id;
  }

  recall(opts: EpisodicRecallOptions = {}): Episode[] {
    const limit = opts.limit ?? 10;

    if (opts.query) {
      return this.ftsSearch(opts.query, limit, opts.minScore);
    }

    if (opts.goalId) {
      return this.db
        .prepare(
          `
        SELECT * FROM agent_episodes_content
        WHERE agent_id = ? AND goal_id = ?
        ORDER BY created_at DESC LIMIT ?
      `
        )
        .all(this.agentId, opts.goalId, limit) as Episode[];
    }

    return this.db
      .prepare(
        `
      SELECT * FROM agent_episodes_content
      WHERE agent_id = ?
      ORDER BY created_at DESC LIMIT ?
    `
      )
      .all(this.agentId, limit) as Episode[];
  }

  private ftsSearch(query: string, limit: number, minScore?: number): Episode[] {
    const sanitized = sanitizeFtsQuery(query);
    if (!sanitized) return [];

    let rows: (Episode & { rank: number })[];
    try {
      rows = this.db
        .prepare(
          `
        SELECT c.*, rank
        FROM agent_episodes_fts f
        JOIN agent_episodes_content c ON c.rowid = f.rowid
        WHERE agent_episodes_fts MATCH ?
          AND c.agent_id = ?
        ORDER BY rank
        LIMIT ?
      `
        )
        .all(sanitized, this.agentId, limit) as (Episode & { rank: number })[];
    } catch {
      return [];
    }

    if (minScore !== undefined) {
      return rows.filter(r => r.qualityScore !== null && r.qualityScore >= minScore);
    }
    return rows;
  }

  getById(id: string): Episode | null {
    return (
      (this.db
        .prepare(
          `
      SELECT * FROM agent_episodes_content WHERE id = ? AND agent_id = ?
    `
        )
        .get(id, this.agentId) as Episode) ?? null
    );
  }

  count(): number {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM agent_episodes_content WHERE agent_id = ?
    `
      )
      .get(this.agentId) as { cnt: number };
    return row.cnt;
  }

  recent(n: number): Episode[] {
    return this.db
      .prepare(
        `
      SELECT * FROM agent_episodes_content
      WHERE agent_id = ?
      ORDER BY created_at DESC LIMIT ?
    `
      )
      .all(this.agentId, n) as Episode[];
  }
}

function sanitizeFtsQuery(query: string): string {
  // strip FTS5 operators and special chars, keep alphanumeric + spaces
  const cleaned = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  if (!cleaned) return '';
  // wrap each word in quotes for exact matching
  return cleaned
    .split(/\s+/)
    .map(w => `"${w}"`)
    .join(' ');
}
