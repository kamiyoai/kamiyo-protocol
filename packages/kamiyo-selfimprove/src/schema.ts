import type { DatabaseAdapter } from './adapters';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_variants (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  genome_hash TEXT NOT NULL,
  genome_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  sample_count INTEGER NOT NULL DEFAULT 0,
  rep_score REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  promoted_at INTEGER,
  archived_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_variants_agent_task ON agent_variants(agent_id, task_type);
CREATE INDEX IF NOT EXISTS idx_agent_variants_status ON agent_variants(task_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_variants_genome ON agent_variants(agent_id, task_type, genome_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_variants_one_promoted
  ON agent_variants(task_type) WHERE status = 'promoted';

CREATE TABLE IF NOT EXISTS variant_tournaments (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  max_participants INTEGER NOT NULL,
  budget_cap REAL NOT NULL,
  policy_json TEXT,
  receipt_id TEXT,
  winner_variant_id TEXT,
  promotion_event_id TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS variant_tournament_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  performance_event_id TEXT,
  quality_score REAL,
  cost REAL,
  latency_ms INTEGER,
  outcome TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_variant_entries_tournament ON variant_tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_variant_entries_variant ON variant_tournament_entries(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_entries_variant_time ON variant_tournament_entries(variant_id, created_at);

CREATE TABLE IF NOT EXISTS variant_events (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT,
  receipt_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_variant_events_variant ON variant_events(variant_id, created_at);

CREATE TABLE IF NOT EXISTS task_rubrics (
  task_type TEXT PRIMARY KEY,
  rubric TEXT NOT NULL,
  weights_json TEXT,
  model_id TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  daily_budget_usd REAL NOT NULL DEFAULT 5.0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS judge_cache (
  cache_key TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  score REAL NOT NULL,
  rationale TEXT,
  model_id TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_judge_cache_task ON judge_cache(task_type, created_at);

CREATE TABLE IF NOT EXISTS judge_runs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  variant_id TEXT,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  score REAL,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_judge_runs_task_day ON judge_runs(task_type, created_at);

CREATE TABLE IF NOT EXISTS pairwise_matches (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('a','b','tie')),
  input_hash TEXT,
  elo_a_before REAL NOT NULL,
  elo_b_before REAL NOT NULL,
  elo_a_after REAL NOT NULL,
  elo_b_after REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pairwise_matches_task ON pairwise_matches(task_type, created_at);
CREATE INDEX IF NOT EXISTS idx_pairwise_matches_variants ON pairwise_matches(variant_a, variant_b);

CREATE TABLE IF NOT EXISTS pairwise_cache (
  cache_key TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('a','b','tie')),
  rationale TEXT,
  model_id TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pairwise_cache_task ON pairwise_cache(task_type, created_at);

CREATE TABLE IF NOT EXISTS genome_proposals (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  parent_variant_id TEXT NOT NULL,
  proposed_variant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('llm','jitter','crossover')),
  rationale TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_genome_proposals_task ON genome_proposals(task_type, created_at);
CREATE INDEX IF NOT EXISTS idx_genome_proposals_parent ON genome_proposals(parent_variant_id);

CREATE TABLE IF NOT EXISTS coldstart_evals (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  mean_score REAL NOT NULL,
  errors INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  payload_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_coldstart_evals_variant ON coldstart_evals(variant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coldstart_evals_task ON coldstart_evals(task_type, created_at);

CREATE TABLE IF NOT EXISTS shadow_runs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  primary_variant_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  input_text TEXT,
  output_text TEXT,
  quality_score REAL,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  is_primary INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_shadow_runs_task ON shadow_runs(task_type, created_at);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_variant ON shadow_runs(variant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_batch ON shadow_runs(batch_id);
CREATE INDEX IF NOT EXISTS idx_shadow_runs_input_hash ON shadow_runs(task_type, input_hash);

CREATE TABLE IF NOT EXISTS canary_rollouts (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  canary_variant_id TEXT NOT NULL,
  baseline_variant_id TEXT NOT NULL,
  traffic_pct REAL NOT NULL DEFAULT 0.1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','promoted','rolled_back')),
  min_samples INTEGER NOT NULL DEFAULT 50,
  rollback_threshold REAL NOT NULL DEFAULT 0.05,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at INTEGER,
  decision TEXT,
  decision_event_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_canary_rollouts_task ON canary_rollouts(task_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_canary_rollouts_active
  ON canary_rollouts(task_type) WHERE status = 'active';
`;

const ELO_MIGRATION = `ALTER TABLE agent_variants ADD COLUMN elo_rating REAL NOT NULL DEFAULT 1200`;

export function applySchema(db: DatabaseAdapter): void {
  const schemaWithoutPartialIndexes = SCHEMA_SQL.replace(
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_variants_one_promoted[^;]*;/,
    ''
  ).replace(/CREATE UNIQUE INDEX IF NOT EXISTS idx_canary_rollouts_active[^;]*;/, '');
  db.exec(schemaWithoutPartialIndexes);

  const partialIndexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_variants_one_promoted ON agent_variants(task_type) WHERE status = 'promoted'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_canary_rollouts_active ON canary_rollouts(task_type) WHERE status = 'active'`,
  ];
  for (const ddl of partialIndexes) {
    try {
      db.exec(ddl);
    } catch {
      // dirty DB: constraint violation from existing data — skip index
    }
  }

  try {
    db.exec(ELO_MIGRATION);
  } catch {
    // column already exists
  }
}
