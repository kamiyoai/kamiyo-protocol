import { randomUUID } from 'crypto';
import type { DB } from '../db-types';
import { escapeLike } from '../utils';

export interface Fact {
  id: string;
  agentId: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export class SemanticMemory {
  constructor(
    private db: DB,
    private agentId: string
  ) {}

  set(key: string, value: string, opts?: { confidence?: number; source?: string }): void {
    if (!key) throw new Error('Semantic memory key must be non-empty');
    const confidence = Math.max(0, Math.min(1, opts?.confidence ?? 1.0));
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `
      INSERT INTO agent_facts (id, agent_id, key, value, confidence, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
      )
      .run(
        randomUUID(),
        this.agentId,
        key,
        value,
        confidence,
        opts?.source ?? 'inferred',
        now,
        now
      );
  }

  get(key: string): Fact | null {
    return (
      (this.db
        .prepare(
          `
      SELECT * FROM agent_facts WHERE agent_id = ? AND key = ?
    `
        )
        .get(this.agentId, key) as Fact) ?? null
    );
  }

  getValue(key: string): string | null {
    const fact = this.get(key);
    return fact?.value ?? null;
  }

  delete(key: string): boolean {
    const row = this.db
      .prepare(
        `
      SELECT id FROM agent_facts WHERE agent_id = ? AND key = ?
    `
      )
      .get(this.agentId, key);
    if (!row) return false;
    this.db
      .prepare(`DELETE FROM agent_facts WHERE agent_id = ? AND key = ?`)
      .run(this.agentId, key);
    return true;
  }

  list(opts?: { prefix?: string; minConfidence?: number }): Fact[] {
    if (opts?.prefix) {
      const pattern = escapeLike(opts.prefix) + '%';
      const minConf = opts.minConfidence ?? 0;
      return this.db
        .prepare(
          `
        SELECT * FROM agent_facts
        WHERE agent_id = ? AND key LIKE ? AND confidence >= ?
        ORDER BY key
      `
        )
        .all(this.agentId, pattern, minConf) as Fact[];
    }

    const minConf = opts?.minConfidence ?? 0;
    return this.db
      .prepare(
        `
      SELECT * FROM agent_facts
      WHERE agent_id = ? AND confidence >= ?
      ORDER BY key
    `
      )
      .all(this.agentId, minConf) as Fact[];
  }

  search(substring: string): Fact[] {
    const pattern = `%${escapeLike(substring)}%`;
    return this.db
      .prepare(
        `
      SELECT * FROM agent_facts
      WHERE agent_id = ? AND (key LIKE ? OR value LIKE ?)
      ORDER BY updated_at DESC
    `
      )
      .all(this.agentId, pattern, pattern) as Fact[];
  }

  count(): number {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM agent_facts WHERE agent_id = ?
    `
      )
      .get(this.agentId) as { cnt: number };
    return row.cnt;
  }

  toContext(minConfidence = 0.5): string {
    const facts = this.list({ minConfidence });
    if (facts.length === 0) return '';
    const lines = facts.map(f => `- ${f.key}: ${f.value}`);
    return `Known facts:\n${lines.join('\n')}`;
  }
}
