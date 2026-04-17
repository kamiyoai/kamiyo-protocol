import type { DB } from '@kamiyo-org/agent';
import { escapeLike } from '@kamiyo-org/agent';

export interface SharedFact {
  agentId: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: number;
}

export class SharedMemory {
  constructor(private db: DB) {}

  readFact(agentId: string, key: string): SharedFact | null {
    const row = this.db
      .prepare(
        `
      SELECT agent_id, key, value, confidence, source, updated_at
      FROM agent_facts WHERE agent_id = ? AND key = ?
    `
      )
      .get(agentId, key) as Record<string, unknown> | undefined;
    return row ? mapFact(row) : null;
  }

  readAllFacts(agentId: string): SharedFact[] {
    return (
      this.db
        .prepare(
          `
      SELECT agent_id, key, value, confidence, source, updated_at
      FROM agent_facts WHERE agent_id = ? ORDER BY key
    `
        )
        .all(agentId) as Record<string, unknown>[]
    ).map(mapFact);
  }

  searchFacts(opts: { key?: string; value?: string; minConfidence?: number }): SharedFact[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.key) {
      conditions.push('key LIKE ?');
      params.push(`%${escapeLike(opts.key)}%`);
    }
    if (opts.value) {
      conditions.push('value LIKE ?');
      params.push(`%${escapeLike(opts.value)}%`);
    }
    if (opts.minConfidence != null) {
      conditions.push('confidence >= ?');
      params.push(opts.minConfidence);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return (
      this.db
        .prepare(
          `
      SELECT agent_id, key, value, confidence, source, updated_at
      FROM agent_facts ${where} ORDER BY updated_at DESC LIMIT 100
    `
        )
        .all(...params) as Record<string, unknown>[]
    ).map(mapFact);
  }

  writeFact(
    agentId: string,
    key: string,
    value: string,
    opts?: { confidence?: number; source?: string }
  ): void {
    this.db
      .prepare(
        `
      INSERT INTO agent_facts (agent_id, key, value, confidence, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, key) DO UPDATE SET
        value = excluded.value,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
      )
      .run(
        agentId,
        key,
        value,
        Math.max(0, Math.min(1, opts?.confidence ?? 1.0)),
        opts?.source ?? 'shared',
        Date.now()
      );
  }

  deleteFact(agentId: string, key: string): boolean {
    const exists = this.db
      .prepare(
        `
      SELECT 1 FROM agent_facts WHERE agent_id = ? AND key = ?
    `
      )
      .get(agentId, key);
    if (!exists) return false;
    this.db
      .prepare(
        `
      DELETE FROM agent_facts WHERE agent_id = ? AND key = ?
    `
      )
      .run(agentId, key);
    return true;
  }

  readEpisodes(agentId: string, limit = 10): Record<string, unknown>[] {
    return this.db
      .prepare(
        `
      SELECT * FROM agent_episodes_content WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
    `
      )
      .all(agentId, limit) as Record<string, unknown>[];
  }

  readGoals(agentId: string, state?: string): Record<string, unknown>[] {
    if (state) {
      return this.db
        .prepare(
          `
        SELECT * FROM agent_goals WHERE agent_id = ? AND state = ? ORDER BY priority DESC
      `
        )
        .all(agentId, state) as Record<string, unknown>[];
    }
    return this.db
      .prepare(
        `
      SELECT * FROM agent_goals WHERE agent_id = ? ORDER BY priority DESC
    `
      )
      .all(agentId) as Record<string, unknown>[];
  }
}

function mapFact(row: Record<string, unknown>): SharedFact {
  return {
    agentId: row.agent_id as string,
    key: row.key as string,
    value: row.value as string,
    confidence: row.confidence as number,
    source: row.source as string,
    updatedAt: row.updated_at as number,
  };
}
