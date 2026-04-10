import { createHash, randomUUID } from 'crypto';
import db from './db';
import './revenue-events';

export const COMPANY_UNIT_IDS = [
  'acquisition',
  'delivery',
  'payments',
  'treasury',
  'experiments',
] as const;

export type CompanyUnitId = (typeof COMPANY_UNIT_IDS)[number];

export const DEFAULT_COMPANY_GOAL_IDS: Record<CompanyUnitId, string> = {
  acquisition: 'goal_acquisition_pipeline',
  delivery: 'goal_delivery_paid_jobs',
  payments: 'goal_payments_settlement',
  treasury: 'goal_treasury_fees',
  experiments: 'goal_experiments_canary',
};

db.exec(`
  CREATE TABLE IF NOT EXISTS company_units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mission TEXT NOT NULL DEFAULT '',
    schedule TEXT NOT NULL DEFAULT '',
    budget_policy_json TEXT NOT NULL DEFAULT '{}',
    approval_policy_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS company_goals (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL,
    parent_goal_id TEXT,
    title TEXT NOT NULL,
    metric_key TEXT,
    metric_target REAL,
    window TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (unit_id) REFERENCES company_units(id)
  );

  CREATE INDEX IF NOT EXISTS idx_company_goals_unit ON company_goals(unit_id, status);

  CREATE TABLE IF NOT EXISTS company_tickets (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    goal_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 0,
    expected_gross_usd REAL NOT NULL DEFAULT 0,
    expected_cost_usd REAL NOT NULL DEFAULT 0,
    expected_net_usd REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    urgency REAL NOT NULL DEFAULT 0,
    requires_approval INTEGER NOT NULL DEFAULT 0,
    approval_reason TEXT,
    assigned_agent_id TEXT,
    assigned_team_id TEXT,
    execution_path TEXT,
    idempotency_key TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    last_event_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (unit_id) REFERENCES company_units(id),
    FOREIGN KEY (goal_id) REFERENCES company_goals(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tickets_source_ref
  ON company_tickets(source, source_ref);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tickets_idempotency
  ON company_tickets(idempotency_key);

  CREATE INDEX IF NOT EXISTS idx_company_tickets_unit_status
  ON company_tickets(unit_id, status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS company_ticket_events (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT,
    source TEXT,
    source_ref TEXT,
    receipt_id TEXT,
    settlement_ref TEXT,
    idempotency_key TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (ticket_id) REFERENCES company_tickets(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_ticket_events_ticket_idempotency
  ON company_ticket_events(ticket_id, idempotency_key);

  CREATE INDEX IF NOT EXISTS idx_company_ticket_events_ticket_created
  ON company_ticket_events(ticket_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS company_approvals (
    id TEXT PRIMARY KEY,
    ticket_id TEXT,
    unit_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    threshold_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    approved_at INTEGER,
    rejected_at INTEGER,
    FOREIGN KEY (ticket_id) REFERENCES company_tickets(id),
    FOREIGN KEY (unit_id) REFERENCES company_units(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_approvals_idempotency
  ON company_approvals(idempotency_key);

  CREATE INDEX IF NOT EXISTS idx_company_approvals_ticket_status
  ON company_approvals(ticket_id, status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS company_heartbeat_runs (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL,
    status TEXT NOT NULL,
    selected_ticket_ids_json TEXT NOT NULL DEFAULT '[]',
    blocked_ticket_ids_json TEXT NOT NULL DEFAULT '[]',
    spend_planned_usd REAL NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    started_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (unit_id) REFERENCES company_units(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_company_heartbeat_runs_idempotency
  ON company_heartbeat_runs(idempotency_key);

  CREATE INDEX IF NOT EXISTS idx_company_heartbeat_runs_unit_started
  ON company_heartbeat_runs(unit_id, started_at DESC);
`);

type SqliteRow = Record<string, unknown>;

export interface CompanyUnit {
  id: CompanyUnitId;
  name: string;
  mission: string;
  schedule: string;
  budgetPolicy: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyGoal {
  id: string;
  unitId: CompanyUnitId;
  parentGoalId: string | null;
  title: string;
  metricKey: string | null;
  metricTarget: number | null;
  window: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyTicket {
  id: string;
  source: string;
  sourceRef: string;
  unitId: CompanyUnitId;
  goalId: string | null;
  title: string;
  description: string;
  status: string;
  priority: number;
  expectedGrossUsd: number;
  expectedCostUsd: number;
  expectedNetUsd: number;
  confidence: number;
  urgency: number;
  requiresApproval: boolean;
  approvalReason: string | null;
  assignedAgentId: string | null;
  assignedTeamId: string | null;
  executionPath: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyTicketEvent {
  id: string;
  ticketId: string;
  eventType: string;
  status: string | null;
  source: string | null;
  sourceRef: string | null;
  receiptId: string | null;
  settlementRef: string | null;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CompanyApproval {
  id: string;
  ticketId: string | null;
  unitId: CompanyUnitId;
  reason: string;
  thresholdType: string;
  status: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export interface CompanyHeartbeatRun {
  id: string;
  unitId: CompanyUnitId;
  status: string;
  selectedTicketIds: string[];
  blockedTicketIds: string[];
  spendPlannedUsd: number;
  payload: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
}

export interface CompanyTicketInput {
  ticketId?: string;
  source: string;
  sourceRef: string;
  unitId: CompanyUnitId;
  goalId?: string | null;
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  expectedGrossUsd?: number;
  expectedCostUsd?: number;
  expectedNetUsd?: number;
  confidence?: number;
  urgency?: number;
  requiresApproval?: boolean;
  approvalReason?: string | null;
  assignedAgentId?: string | null;
  assignedTeamId?: string | null;
  executionPath?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompanyTicketEventInput {
  eventId?: string;
  ticketId: string;
  eventType: string;
  status?: string | null;
  source?: string | null;
  sourceRef?: string | null;
  receiptId?: string | null;
  settlementRef?: string | null;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
}

export interface CompanyApprovalInput {
  approvalId?: string;
  ticketId?: string | null;
  unitId: CompanyUnitId;
  reason: string;
  thresholdType: string;
  status?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

type HeartbeatCandidate = CompanyTicket & { score: number };

const DEFAULT_UNITS: Array<{
  id: CompanyUnitId;
  name: string;
  mission: string;
  schedule: string;
  budgetPolicy: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
  enabled: boolean;
}> = [
  {
    id: 'acquisition',
    name: 'Acquisition',
    mission: 'Source qualified paid work and route only verifiable opportunities.',
    schedule: 'openclaw.timer',
    budgetPolicy: { dailyBudgetUsd: 75, maxSelectedTickets: 12, minConfidence: 0.45 },
    approvalPolicy: { autoApproveBelowUsd: 10, allowlistedOnly: true },
    enabled: true,
  },
  {
    id: 'delivery',
    name: 'Delivery',
    mission: 'Convert paid jobs and task queues into durable receipts and repeatable delivery.',
    schedule: '*/15 * * * *',
    budgetPolicy: { dailyBudgetUsd: 250, maxSelectedTickets: 16, minConfidence: 0.35 },
    approvalPolicy: { autoApproveBelowUsd: 50, requirePositiveNet: true },
    enabled: true,
  },
  {
    id: 'payments',
    name: 'Payments',
    mission: 'Verify, settle, and reconcile payment flows without breaking treasury guardrails.',
    schedule: '*/10 * * * *',
    budgetPolicy: { dailyBudgetUsd: 100, maxSelectedTickets: 20, minConfidence: 0.6 },
    approvalPolicy: { autoApproveBelowUsd: 25, requireSettlementEvidence: true },
    enabled: true,
  },
  {
    id: 'treasury',
    name: 'Treasury',
    mission: 'Route fees, preserve reserve health, and only move capital under policy.',
    schedule: '0 * * * *',
    budgetPolicy: { dailyBudgetUsd: 40, maxSelectedTickets: 8, minConfidence: 0.75 },
    approvalPolicy: { autoApproveBelowUsd: 5, requireAllowlist: true },
    enabled: true,
  },
  {
    id: 'experiments',
    name: 'Experiments',
    mission: 'Run canary revenue experiments behind hard pause and reconciliation gates.',
    schedule: 'manual',
    budgetPolicy: { dailyBudgetUsd: 15, maxSelectedTickets: 3, minConfidence: 0.8, paused: true },
    approvalPolicy: { manualOnly: true, autoApproveBelowUsd: 0 },
    enabled: false,
  },
];

const DEFAULT_GOALS: Array<{
  id: string;
  unitId: CompanyUnitId;
  title: string;
  metricKey: string;
  metricTarget: number;
  window: string;
}> = [
  {
    id: DEFAULT_COMPANY_GOAL_IDS.acquisition,
    unitId: 'acquisition',
    title: 'Keep paid opportunity intake non-empty and policy-compliant.',
    metricKey: 'qualified_opportunities_7d',
    metricTarget: 25,
    window: '7d',
  },
  {
    id: DEFAULT_COMPANY_GOAL_IDS.delivery,
    unitId: 'delivery',
    title: 'Maximize settled paid jobs and paid API delivery with receipts.',
    metricKey: 'settled_jobs_7d',
    metricTarget: 20,
    window: '7d',
  },
  {
    id: DEFAULT_COMPANY_GOAL_IDS.payments,
    unitId: 'payments',
    title: 'Keep payment settlement exactly-once and fully reconciled.',
    metricKey: 'settled_payments_7d',
    metricTarget: 50,
    window: '7d',
  },
  {
    id: DEFAULT_COMPANY_GOAL_IDS.treasury,
    unitId: 'treasury',
    title: 'Sweep protocol fees into treasury with no unreconciled movement.',
    metricKey: 'fee_sweeps_7d',
    metricTarget: 7,
    window: '7d',
  },
  {
    id: DEFAULT_COMPANY_GOAL_IDS.experiments,
    unitId: 'experiments',
    title: 'Keep canary experiments profitable and auto-paused on drift.',
    metricKey: 'profitable_days_14d',
    metricTarget: 14,
    window: '14d',
  },
];

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function clamp01(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value as number));
}

function cleanText(value: string | undefined | null, fallback = ''): string {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function numeric(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolInt(value: boolean | undefined): number {
  return value ? 1 : 0;
}

export function buildCompanyTicketId(source: string, sourceRef: string): string {
  const digest = createHash('sha256')
    .update(`${source.trim().toLowerCase()}:${sourceRef.trim()}`)
    .digest('hex')
    .slice(0, 18);
  return `ctk_${digest}`;
}

export function defaultGoalIdForUnit(unitId: CompanyUnitId): string {
  return DEFAULT_COMPANY_GOAL_IDS[unitId];
}

function mapUnit(row: SqliteRow): CompanyUnit {
  return {
    id: row.id as CompanyUnitId,
    name: String(row.name),
    mission: String(row.mission ?? ''),
    schedule: String(row.schedule ?? ''),
    budgetPolicy: parseObject(row.budget_policy_json),
    approvalPolicy: parseObject(row.approval_policy_json),
    enabled: Boolean(row.enabled),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapGoal(row: SqliteRow): CompanyGoal {
  return {
    id: String(row.id),
    unitId: row.unit_id as CompanyUnitId,
    parentGoalId: typeof row.parent_goal_id === 'string' ? row.parent_goal_id : null,
    title: String(row.title),
    metricKey: typeof row.metric_key === 'string' ? row.metric_key : null,
    metricTarget: typeof row.metric_target === 'number' ? row.metric_target : null,
    window: typeof row.window === 'string' ? row.window : null,
    status: String(row.status),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapTicket(row: SqliteRow): CompanyTicket {
  return {
    id: String(row.id),
    source: String(row.source),
    sourceRef: String(row.source_ref),
    unitId: row.unit_id as CompanyUnitId,
    goalId: typeof row.goal_id === 'string' ? row.goal_id : null,
    title: String(row.title),
    description: String(row.description ?? ''),
    status: String(row.status),
    priority: numeric(row.priority),
    expectedGrossUsd: numeric(row.expected_gross_usd),
    expectedCostUsd: numeric(row.expected_cost_usd),
    expectedNetUsd: numeric(row.expected_net_usd),
    confidence: clamp01(numeric(row.confidence)),
    urgency: clamp01(numeric(row.urgency)),
    requiresApproval: Boolean(row.requires_approval),
    approvalReason: typeof row.approval_reason === 'string' ? row.approval_reason : null,
    assignedAgentId: typeof row.assigned_agent_id === 'string' ? row.assigned_agent_id : null,
    assignedTeamId: typeof row.assigned_team_id === 'string' ? row.assigned_team_id : null,
    executionPath: typeof row.execution_path === 'string' ? row.execution_path : null,
    idempotencyKey: typeof row.idempotency_key === 'string' ? row.idempotency_key : null,
    metadata: parseObject(row.metadata_json),
    lastEventAt: toIso(row.last_event_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function mapEvent(row: SqliteRow): CompanyTicketEvent {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    eventType: String(row.event_type),
    status: typeof row.status === 'string' ? row.status : null,
    source: typeof row.source === 'string' ? row.source : null,
    sourceRef: typeof row.source_ref === 'string' ? row.source_ref : null,
    receiptId: typeof row.receipt_id === 'string' ? row.receipt_id : null,
    settlementRef: typeof row.settlement_ref === 'string' ? row.settlement_ref : null,
    idempotencyKey: typeof row.idempotency_key === 'string' ? row.idempotency_key : null,
    payload: parseObject(row.payload_json),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function mapApproval(row: SqliteRow): CompanyApproval {
  return {
    id: String(row.id),
    ticketId: typeof row.ticket_id === 'string' ? row.ticket_id : null,
    unitId: row.unit_id as CompanyUnitId,
    reason: String(row.reason),
    thresholdType: String(row.threshold_type),
    status: String(row.status),
    payload: parseObject(row.payload_json),
    idempotencyKey: typeof row.idempotency_key === 'string' ? row.idempotency_key : null,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    approvedAt: toIso(row.approved_at),
    rejectedAt: toIso(row.rejected_at),
  };
}

function mapHeartbeat(row: SqliteRow): CompanyHeartbeatRun {
  return {
    id: String(row.id),
    unitId: row.unit_id as CompanyUnitId,
    status: String(row.status),
    selectedTicketIds: parseArray(row.selected_ticket_ids_json),
    blockedTicketIds: parseArray(row.blocked_ticket_ids_json),
    spendPlannedUsd: numeric(row.spend_planned_usd),
    payload: parseObject(row.payload_json),
    startedAt: toIso(row.started_at) ?? new Date(0).toISOString(),
    completedAt: toIso(row.completed_at),
  };
}

export function ensureCompanyDefaults(): void {
  const insertUnit = db.prepare(`
    INSERT OR IGNORE INTO company_units (
      id, name, mission, schedule, budget_policy_json, approval_policy_json, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateUnit = db.prepare(`
    UPDATE company_units
    SET name = ?, mission = ?, schedule = ?, budget_policy_json = ?, approval_policy_json = ?, enabled = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
  const insertGoal = db.prepare(`
    INSERT OR IGNORE INTO company_goals (
      id, unit_id, title, metric_key, metric_target, window, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'active')
  `);

  for (const unit of DEFAULT_UNITS) {
    insertUnit.run(
      unit.id,
      unit.name,
      unit.mission,
      unit.schedule,
      JSON.stringify(unit.budgetPolicy),
      JSON.stringify(unit.approvalPolicy),
      boolInt(unit.enabled)
    );
    updateUnit.run(
      unit.name,
      unit.mission,
      unit.schedule,
      JSON.stringify(unit.budgetPolicy),
      JSON.stringify(unit.approvalPolicy),
      boolInt(unit.enabled),
      unit.id
    );
  }

  for (const goal of DEFAULT_GOALS) {
    insertGoal.run(
      goal.id,
      goal.unitId,
      goal.title,
      goal.metricKey,
      goal.metricTarget,
      goal.window
    );
  }
}

ensureCompanyDefaults();

export function listCompanyUnits(): CompanyUnit[] {
  const rows = db.prepare(`
    SELECT id, name, mission, schedule, budget_policy_json, approval_policy_json, enabled, created_at, updated_at
    FROM company_units
    ORDER BY id ASC
  `).all() as SqliteRow[];
  return rows.map(mapUnit);
}

export function listCompanyGoals(): CompanyGoal[] {
  const rows = db.prepare(`
    SELECT id, unit_id, parent_goal_id, title, metric_key, metric_target, window, status, created_at, updated_at
    FROM company_goals
    ORDER BY unit_id ASC, id ASC
  `).all() as SqliteRow[];
  return rows.map(mapGoal);
}

export function getCompanyTicket(ticketId: string): CompanyTicket | null {
  const row = db.prepare(`
    SELECT *
    FROM company_tickets
    WHERE id = ?
    LIMIT 1
  `).get(ticketId) as SqliteRow | undefined;
  return row ? mapTicket(row) : null;
}

function getCompanyTicketBySource(source: string, sourceRef: string): CompanyTicket | null {
  const row = db.prepare(`
    SELECT *
    FROM company_tickets
    WHERE source = ? AND source_ref = ?
    LIMIT 1
  `).get(source, sourceRef) as SqliteRow | undefined;
  return row ? mapTicket(row) : null;
}

export function upsertCompanyTicket(input: CompanyTicketInput): CompanyTicket {
  ensureCompanyDefaults();

  const source = cleanText(input.source);
  const sourceRef = cleanText(input.sourceRef);
  const unitId = input.unitId;
  if (!source || !sourceRef || !COMPANY_UNIT_IDS.includes(unitId)) {
    throw new Error('source, sourceRef, and unitId are required');
  }

  const existing =
    (input.ticketId ? getCompanyTicket(input.ticketId) : null) || getCompanyTicketBySource(source, sourceRef);
  const ticketId = cleanText(input.ticketId) || existing?.id || buildCompanyTicketId(source, sourceRef);
  const expectedGrossUsd = numeric(input.expectedGrossUsd);
  const expectedCostUsd = numeric(input.expectedCostUsd);
  const expectedNetUsd = Number.isFinite(input.expectedNetUsd as number)
    ? numeric(input.expectedNetUsd)
    : expectedGrossUsd - expectedCostUsd;

  db.prepare(`
    INSERT INTO company_tickets (
      id,
      source,
      source_ref,
      unit_id,
      goal_id,
      title,
      description,
      status,
      priority,
      expected_gross_usd,
      expected_cost_usd,
      expected_net_usd,
      confidence,
      urgency,
      requires_approval,
      approval_reason,
      assigned_agent_id,
      assigned_team_id,
      execution_path,
      idempotency_key,
      metadata_json,
      last_event_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      source_ref = excluded.source_ref,
      unit_id = excluded.unit_id,
      goal_id = excluded.goal_id,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      priority = excluded.priority,
      expected_gross_usd = excluded.expected_gross_usd,
      expected_cost_usd = excluded.expected_cost_usd,
      expected_net_usd = excluded.expected_net_usd,
      confidence = excluded.confidence,
      urgency = excluded.urgency,
      requires_approval = excluded.requires_approval,
      approval_reason = excluded.approval_reason,
      assigned_agent_id = excluded.assigned_agent_id,
      assigned_team_id = excluded.assigned_team_id,
      execution_path = excluded.execution_path,
      idempotency_key = excluded.idempotency_key,
      metadata_json = excluded.metadata_json,
      last_event_at = COALESCE(excluded.last_event_at, company_tickets.last_event_at),
      updated_at = unixepoch()
  `).run(
    ticketId,
    source,
    sourceRef,
    unitId,
    input.goalId ?? existing?.goalId ?? defaultGoalIdForUnit(unitId),
    cleanText(input.title, existing?.title ?? sourceRef),
    cleanText(input.description, existing?.description ?? ''),
    cleanText(input.status, existing?.status ?? 'open'),
    Math.max(0, Math.round(numeric(input.priority, existing?.priority ?? 0))),
    expectedGrossUsd,
    expectedCostUsd,
    expectedNetUsd,
    clamp01(input.confidence ?? existing?.confidence),
    clamp01(input.urgency ?? existing?.urgency),
    boolInt(Boolean(input.requiresApproval ?? existing?.requiresApproval)),
    cleanText(input.approvalReason, existing?.approvalReason ?? '') || null,
    cleanText(input.assignedAgentId, existing?.assignedAgentId ?? '') || null,
    cleanText(input.assignedTeamId, existing?.assignedTeamId ?? '') || null,
    cleanText(input.executionPath, existing?.executionPath ?? '') || null,
    cleanText(input.idempotencyKey, existing?.idempotencyKey ?? '') || null,
    JSON.stringify(input.metadata ?? existing?.metadata ?? {}),
    existing?.lastEventAt ? Math.floor(Date.parse(existing.lastEventAt) / 1000) : null
  );

  return getCompanyTicket(ticketId) as CompanyTicket;
}

export function recordCompanyTicketEvent(input: CompanyTicketEventInput): CompanyTicketEvent {
  const ticket = getCompanyTicket(input.ticketId);
  if (!ticket) throw new Error('ticket not found');

  if (input.idempotencyKey) {
    const existing = db.prepare(`
      SELECT *
      FROM company_ticket_events
      WHERE ticket_id = ? AND idempotency_key = ?
      LIMIT 1
    `).get(input.ticketId, input.idempotencyKey) as SqliteRow | undefined;
    if (existing) return mapEvent(existing);
  }

  const eventId = cleanText(input.eventId) || `tev_${randomUUID().slice(0, 16)}`;
  const createdAt = nowUnix();
  db.prepare(`
    INSERT INTO company_ticket_events (
      id, ticket_id, event_type, status, source, source_ref, receipt_id, settlement_ref, idempotency_key, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    input.ticketId,
    cleanText(input.eventType),
    cleanText(input.status, '') || null,
    cleanText(input.source, '') || null,
    cleanText(input.sourceRef, '') || null,
    cleanText(input.receiptId, '') || null,
    cleanText(input.settlementRef, '') || null,
    cleanText(input.idempotencyKey, '') || null,
    JSON.stringify(input.payload ?? {}),
    createdAt
  );

  db.prepare(`
    UPDATE company_tickets
    SET
      status = COALESCE(?, status),
      last_event_at = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).run(cleanText(input.status, '') || null, createdAt, input.ticketId);

  const row = db.prepare(`
    SELECT *
    FROM company_ticket_events
    WHERE id = ?
    LIMIT 1
  `).get(eventId) as SqliteRow;

  return mapEvent(row);
}

function getPendingApproval(ticketId: string): CompanyApproval | null {
  const row = db.prepare(`
    SELECT *
    FROM company_approvals
    WHERE ticket_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(ticketId) as SqliteRow | undefined;
  return row ? mapApproval(row) : null;
}

export function upsertCompanyApproval(input: CompanyApprovalInput): CompanyApproval {
  ensureCompanyDefaults();

  if (input.idempotencyKey) {
    const existing = db.prepare(`
      SELECT *
      FROM company_approvals
      WHERE idempotency_key = ?
      LIMIT 1
    `).get(input.idempotencyKey) as SqliteRow | undefined;
    if (existing) return mapApproval(existing);
  }

  if (input.ticketId) {
    const pending = getPendingApproval(input.ticketId);
    if (pending && (input.status ?? 'pending') === 'pending') {
      return pending;
    }
  }

  const approvalId = cleanText(input.approvalId) || `apr_${randomUUID().slice(0, 16)}`;
  const status = cleanText(input.status, 'pending');
  const updatedAt = nowUnix();
  const approvedAt = status === 'approved' ? updatedAt : null;
  const rejectedAt = status === 'rejected' ? updatedAt : null;

  db.prepare(`
    INSERT INTO company_approvals (
      id, ticket_id, unit_id, reason, threshold_type, status, payload_json, idempotency_key, created_at, updated_at, approved_at, rejected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ticket_id = excluded.ticket_id,
      unit_id = excluded.unit_id,
      reason = excluded.reason,
      threshold_type = excluded.threshold_type,
      status = excluded.status,
      payload_json = excluded.payload_json,
      idempotency_key = excluded.idempotency_key,
      updated_at = excluded.updated_at,
      approved_at = excluded.approved_at,
      rejected_at = excluded.rejected_at
  `).run(
    approvalId,
    cleanText(input.ticketId, '') || null,
    input.unitId,
    cleanText(input.reason),
    cleanText(input.thresholdType),
    status,
    JSON.stringify(input.payload ?? {}),
    cleanText(input.idempotencyKey, '') || null,
    updatedAt,
    updatedAt,
    approvedAt,
    rejectedAt
  );

  if (input.ticketId) {
    const nextStatus = status === 'approved' ? 'open' : status === 'rejected' ? 'rejected' : 'blocked';
    db.prepare(`
      UPDATE company_tickets
      SET status = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(nextStatus, input.ticketId);
  }

  const row = db.prepare(`
    SELECT *
    FROM company_approvals
    WHERE id = ?
    LIMIT 1
  `).get(approvalId) as SqliteRow;

  return mapApproval(row);
}

function parseBudgetNumber(policy: Record<string, unknown>, key: string, fallback: number): number {
  const raw = policy[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function computeHeartbeatScore(ticket: CompanyTicket): number {
  return (
    ticket.expectedNetUsd * 1.5 +
    ticket.confidence * 25 +
    ticket.urgency * 15 +
    ticket.priority * 5
  );
}

function listHeartbeatCandidates(unitId: CompanyUnitId): HeartbeatCandidate[] {
  const rows = db.prepare(`
    SELECT *
    FROM company_tickets
    WHERE unit_id = ? AND status IN ('open', 'queued', 'ready')
    ORDER BY updated_at DESC, created_at DESC
  `).all(unitId) as SqliteRow[];
  return rows.map(mapTicket).map((ticket) => ({ ...ticket, score: computeHeartbeatScore(ticket) }));
}

export function runCompanyHeartbeat(unitId: CompanyUnitId, options: { dryRun?: boolean; idempotencyKey?: string | null } = {}) {
  ensureCompanyDefaults();
  const unit = listCompanyUnits().find((entry) => entry.id === unitId);
  if (!unit) throw new Error('unit not found');

  if (options.idempotencyKey) {
    const existing = db.prepare(`
      SELECT *
      FROM company_heartbeat_runs
      WHERE idempotency_key = ?
      LIMIT 1
    `).get(options.idempotencyKey) as SqliteRow | undefined;
    if (existing) return mapHeartbeat(existing);
  }

  const budgetPolicy = unit.budgetPolicy;
  const dailyBudgetUsd = Math.max(0, parseBudgetNumber(budgetPolicy, 'dailyBudgetUsd', 0));
  const maxSelectedTickets = Math.max(1, Math.round(parseBudgetNumber(budgetPolicy, 'maxSelectedTickets', 8)));
  const minConfidence = clamp01(parseBudgetNumber(budgetPolicy, 'minConfidence', 0));
  const paused = !unit.enabled || budgetPolicy.paused === true || unit.approvalPolicy.manualOnly === true;

  const candidates = listHeartbeatCandidates(unitId).sort((a, b) => b.score - a.score);
  const selected: HeartbeatCandidate[] = [];
  const blocked: Array<HeartbeatCandidate & { reason: string; approvalId?: string }> = [];
  let plannedSpendUsd = 0;

  for (const ticket of candidates) {
    if (paused) {
      blocked.push({ ...ticket, reason: 'unit_paused' });
      continue;
    }
    if (ticket.requiresApproval) {
      const approval = upsertCompanyApproval({
        ticketId: ticket.id,
        unitId,
        reason: ticket.approvalReason ?? 'manual approval required',
        thresholdType: 'manual',
        payload: { ticketId: ticket.id, source: ticket.source, sourceRef: ticket.sourceRef },
        idempotencyKey: `approval:${ticket.id}:manual`,
      });
      blocked.push({ ...ticket, reason: 'approval_required', approvalId: approval.id });
      continue;
    }
    if (ticket.expectedNetUsd <= 0) {
      blocked.push({ ...ticket, reason: 'expected_net_non_positive' });
      continue;
    }
    if (ticket.confidence < minConfidence) {
      blocked.push({ ...ticket, reason: 'confidence_below_threshold' });
      continue;
    }
    if (selected.length >= maxSelectedTickets) {
      blocked.push({ ...ticket, reason: 'selection_limit_reached' });
      continue;
    }
    if (dailyBudgetUsd > 0 && plannedSpendUsd + ticket.expectedCostUsd > dailyBudgetUsd) {
      blocked.push({ ...ticket, reason: 'budget_exceeded' });
      continue;
    }
    selected.push(ticket);
    plannedSpendUsd += ticket.expectedCostUsd;
  }

  if (!options.dryRun) {
    const updateStatus = db.prepare(`
      UPDATE company_tickets
      SET status = ?, updated_at = unixepoch()
      WHERE id = ?
    `);
    for (const ticket of selected) {
      updateStatus.run('scheduled', ticket.id);
    }
    for (const ticket of blocked) {
      if (ticket.reason === 'approval_required') {
        updateStatus.run('blocked', ticket.id);
      }
    }
  }

  const startedAt = nowUnix();
  const completedAt = nowUnix();
  const runId = `hrt_${randomUUID().slice(0, 16)}`;
  const payload = {
    dryRun: Boolean(options.dryRun),
    policy: {
      dailyBudgetUsd,
      maxSelectedTickets,
      minConfidence,
      paused,
    },
    selected: selected.map((ticket) => ({
      ticketId: ticket.id,
      score: ticket.score,
      expectedNetUsd: ticket.expectedNetUsd,
      expectedCostUsd: ticket.expectedCostUsd,
    })),
    blocked: blocked.map((ticket) => ({
      ticketId: ticket.id,
      reason: ticket.reason,
      score: ticket.score,
      approvalId: ticket.approvalId ?? null,
    })),
  };

  db.prepare(`
    INSERT INTO company_heartbeat_runs (
      id, unit_id, status, selected_ticket_ids_json, blocked_ticket_ids_json, spend_planned_usd, payload_json, idempotency_key, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    unitId,
    paused ? 'paused' : 'completed',
    JSON.stringify(selected.map((ticket) => ticket.id)),
    JSON.stringify(blocked.map((ticket) => ticket.id)),
    plannedSpendUsd,
    JSON.stringify(payload),
    cleanText(options.idempotencyKey, '') || null,
    startedAt,
    completedAt
  );

  return mapHeartbeat({
    id: runId,
    unit_id: unitId,
    status: paused ? 'paused' : 'completed',
    selected_ticket_ids_json: JSON.stringify(selected.map((ticket) => ticket.id)),
    blocked_ticket_ids_json: JSON.stringify(blocked.map((ticket) => ticket.id)),
    spend_planned_usd: plannedSpendUsd,
    payload_json: JSON.stringify(payload),
    started_at: startedAt,
    completed_at: completedAt,
  });
}

export function getCompanyDashboard() {
  ensureCompanyDefaults();

  const units = listCompanyUnits();
  const goals = listCompanyGoals();
  const ticketCountsRows = db.prepare(`
    SELECT unit_id, status, COUNT(*) AS total
    FROM company_tickets
    GROUP BY unit_id, status
  `).all() as SqliteRow[];
  const approvalCountsRows = db.prepare(`
    SELECT unit_id, status, COUNT(*) AS total
    FROM company_approvals
    GROUP BY unit_id, status
  `).all() as SqliteRow[];
  const recentTickets = db.prepare(`
    SELECT *
    FROM company_tickets
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 20
  `).all() as SqliteRow[];
  const recentEvents = db.prepare(`
    SELECT *
    FROM company_ticket_events
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as SqliteRow[];
  const recentHeartbeats = db.prepare(`
    SELECT *
    FROM company_heartbeat_runs
    ORDER BY started_at DESC
    LIMIT 10
  `).all() as SqliteRow[];
  const recentRevenueRows = db.prepare(`
    SELECT source, gross, fees, net, metadata_json, occurred_at
    FROM revenue_events
    WHERE occurred_at >= ?
    ORDER BY occurred_at DESC
    LIMIT 500
  `).all(nowUnix() - 7 * 86400) as SqliteRow[];

  const ticketCounts = new Map<string, Record<string, number>>();
  for (const row of ticketCountsRows) {
    const unitId = String(row.unit_id);
    const byStatus = ticketCounts.get(unitId) ?? {};
    byStatus[String(row.status)] = numeric(row.total);
    ticketCounts.set(unitId, byStatus);
  }

  const approvalCounts = new Map<string, Record<string, number>>();
  for (const row of approvalCountsRows) {
    const unitId = String(row.unit_id);
    const byStatus = approvalCounts.get(unitId) ?? {};
    byStatus[String(row.status)] = numeric(row.total);
    approvalCounts.set(unitId, byStatus);
  }

  const revenueByUnit: Record<string, { gross: number; fees: number; net: number; events: number }> = {};
  const revenueBySource: Record<string, { gross: number; fees: number; net: number; events: number }> = {};
  let totalGross = 0;
  let totalFees = 0;
  let totalNet = 0;

  for (const row of recentRevenueRows) {
    const gross = numeric(row.gross);
    const fees = numeric(row.fees);
    const net = numeric(row.net);
    const source = String(row.source);
    const metadata = parseObject(row.metadata_json);
    const unitId = typeof metadata.unitId === 'string' ? metadata.unitId : 'unassigned';

    totalGross += gross;
    totalFees += fees;
    totalNet += net;

    const unitBucket = revenueByUnit[unitId] ?? { gross: 0, fees: 0, net: 0, events: 0 };
    unitBucket.gross += gross;
    unitBucket.fees += fees;
    unitBucket.net += net;
    unitBucket.events += 1;
    revenueByUnit[unitId] = unitBucket;

    const sourceBucket = revenueBySource[source] ?? { gross: 0, fees: 0, net: 0, events: 0 };
    sourceBucket.gross += gross;
    sourceBucket.fees += fees;
    sourceBucket.net += net;
    sourceBucket.events += 1;
    revenueBySource[source] = sourceBucket;
  }

  return {
    generatedAt: new Date().toISOString(),
    units: units.map((unit) => ({
      ...unit,
      goals: goals.filter((goal) => goal.unitId === unit.id),
      ticketCounts: ticketCounts.get(unit.id) ?? {},
      approvalCounts: approvalCounts.get(unit.id) ?? {},
      revenue7d: revenueByUnit[unit.id] ?? { gross: 0, fees: 0, net: 0, events: 0 },
    })),
    pendingApprovals: (approvalCountsRows.find((row) => String(row.status) === 'pending') ? approvalCountsRows
      .filter((row) => String(row.status) === 'pending')
      .reduce((sum, row) => sum + numeric(row.total), 0) : 0),
    recentTickets: recentTickets.map(mapTicket),
    recentEvents: recentEvents.map(mapEvent),
    recentHeartbeats: recentHeartbeats.map(mapHeartbeat),
    revenue7d: {
      gross: Number(totalGross.toFixed(8)),
      fees: Number(totalFees.toFixed(8)),
      net: Number(totalNet.toFixed(8)),
      byUnit: Object.fromEntries(
        Object.entries(revenueByUnit).map(([key, value]) => [
          key,
          {
            gross: Number(value.gross.toFixed(8)),
            fees: Number(value.fees.toFixed(8)),
            net: Number(value.net.toFixed(8)),
            events: value.events,
          },
        ])
      ),
      bySource: Object.fromEntries(
        Object.entries(revenueBySource).map(([key, value]) => [
          key,
          {
            gross: Number(value.gross.toFixed(8)),
            fees: Number(value.fees.toFixed(8)),
            net: Number(value.net.toFixed(8)),
            events: value.events,
          },
        ])
      ),
    },
  };
}
