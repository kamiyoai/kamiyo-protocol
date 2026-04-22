export const AGENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_episodes_content (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  summary TEXT,
  tags TEXT,
  quality_score REAL,
  variant_id TEXT,
  goal_id TEXT,
  run_id TEXT,
  turns INTEGER,
  tools_used TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_episodes_agent
  ON agent_episodes_content(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episodes_goal
  ON agent_episodes_content(goal_id) WHERE goal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_facts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'inferred',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(agent_id, key)
);

CREATE INDEX IF NOT EXISTS idx_facts_agent
  ON agent_facts(agent_id);

CREATE TABLE IF NOT EXISTS agent_goals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  description TEXT NOT NULL,
  success_criteria TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 50,
  parent_id TEXT REFERENCES agent_goals(id),
  progress REAL NOT NULL DEFAULT 0.0,
  plan_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  failed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_agent_state
  ON agent_goals(agent_id, state);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES agent_goals(id),
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  tool TEXT,
  params_json TEXT,
  result_json TEXT,
  error_text TEXT,
  depends_on TEXT,
  ordering INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_goal
  ON agent_tasks(goal_id, ordering);

CREATE VIRTUAL TABLE IF NOT EXISTS agent_episodes_fts
  USING fts5(input, output, summary, tags, content=agent_episodes_content, content_rowid=rowid);

CREATE TRIGGER IF NOT EXISTS trg_episodes_fts_insert
  AFTER INSERT ON agent_episodes_content BEGIN
    INSERT INTO agent_episodes_fts(rowid, input, output, summary, tags)
    VALUES (NEW.rowid, NEW.input, NEW.output, NEW.summary, NEW.tags);
  END;

CREATE TABLE IF NOT EXISTS agent_run_receipts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  service TEXT NOT NULL,
  task_type TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  variant_id TEXT,
  variant_strategy TEXT,
  outcome TEXT,
  quality_score REAL,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  receipt_json TEXT NOT NULL,
  reconcile_after INTEGER,
  reconciled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_run_receipts_service_created
  ON agent_run_receipts(service, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_receipts_subject
  ON agent_run_receipts(service, subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_receipts_reconcile
  ON agent_run_receipts(reconcile_after, reconciled_at)
  WHERE reconcile_after IS NOT NULL;
`;

export function applyAgentSchema(db: Pick<import('./db-types').DB, 'exec'>): void {
  db.exec(AGENT_SCHEMA_SQL);
}
