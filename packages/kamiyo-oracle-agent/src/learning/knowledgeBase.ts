import Database from 'better-sqlite3';
import { createLogger } from '../lib/logger';
import type { DeliberationResult } from '../deliberation/types';

const log = createLogger('knowledge-base');

export interface OutcomeRecord {
  id: string;
  escrowPda: string;
  ourScore: number;
  consensusScore: number | null;
  deviation: number | null;
  wasSlashed: boolean;
  rewardAmount: number;
  deliberationId: string;
  timestamp: number;
  finalized: boolean;
}

export interface CalibrationParams {
  confidenceThresholdLow: number;
  confidenceThresholdMedium: number;
  confidenceThresholdHigh: number;
  riskWeightFraudHigh: number;
  riskWeightFraudMedium: number;
  riskWeightFraudLow: number;
  advocateAggressiveness: number;
  historicalAccuracy: number;
  totalVotes: number;
  accurateVotes: number;
  slashEvents: number;
  lastUpdated: number;
}

export interface LearnedPattern {
  id: string;
  patternType: string;
  description: string;
  successRate: number;
  sampleSize: number;
  firstSeen: number;
  lastSeen: number;
  metadata: string;
}

const DEFAULT_CALIBRATION: CalibrationParams = {
  confidenceThresholdLow: 0.3,
  confidenceThresholdMedium: 0.5,
  confidenceThresholdHigh: 0.7,
  riskWeightFraudHigh: 0.9,
  riskWeightFraudMedium: 0.6,
  riskWeightFraudLow: 0.3,
  advocateAggressiveness: 0.7,
  historicalAccuracy: 1.0,
  totalVotes: 0,
  accurateVotes: 0,
  slashEvents: 0,
  lastUpdated: Date.now(),
};

export class KnowledgeBase {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath = './oracle_knowledge.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.initialize();
    log.info('Knowledge base initialized', { path: dbPath });
  }

  private initialize(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        escrowPda TEXT NOT NULL,
        ourScore INTEGER NOT NULL,
        consensusScore INTEGER,
        deviation INTEGER,
        wasSlashed INTEGER NOT NULL DEFAULT 0,
        rewardAmount REAL NOT NULL DEFAULT 0,
        deliberationId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        finalized INTEGER NOT NULL DEFAULT 0,
        UNIQUE(escrowPda)
      );

      CREATE TABLE IF NOT EXISTS calibration (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        confidenceThresholdLow REAL NOT NULL,
        confidenceThresholdMedium REAL NOT NULL,
        confidenceThresholdHigh REAL NOT NULL,
        riskWeightFraudHigh REAL NOT NULL,
        riskWeightFraudMedium REAL NOT NULL,
        riskWeightFraudLow REAL NOT NULL,
        advocateAggressiveness REAL NOT NULL,
        historicalAccuracy REAL NOT NULL,
        totalVotes INTEGER NOT NULL DEFAULT 0,
        accurateVotes INTEGER NOT NULL DEFAULT 0,
        slashEvents INTEGER NOT NULL DEFAULT 0,
        lastUpdated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        patternType TEXT NOT NULL,
        description TEXT NOT NULL,
        successRate REAL NOT NULL,
        sampleSize INTEGER NOT NULL,
        firstSeen INTEGER NOT NULL,
        lastSeen INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS deliberations (
        id TEXT PRIMARY KEY,
        escrowPda TEXT NOT NULL,
        finalScore INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        transcript TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(escrowPda)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_escrow ON outcomes(escrowPda);
      CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON outcomes(timestamp);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(patternType);
    `);

    // Initialize calibration if not exists
    const existing = this.db.prepare('SELECT id FROM calibration WHERE id = 1').get();
    if (!existing) {
      this.saveCalibration(DEFAULT_CALIBRATION);
    }
  }

  // Outcome methods
  recordOutcome(outcome: Omit<OutcomeRecord, 'id'>): string {
    const id = `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.db.prepare(`
      INSERT OR REPLACE INTO outcomes
      (id, escrowPda, ourScore, consensusScore, deviation, wasSlashed, rewardAmount, deliberationId, timestamp, finalized)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      outcome.escrowPda,
      outcome.ourScore,
      outcome.consensusScore,
      outcome.deviation,
      outcome.wasSlashed ? 1 : 0,
      outcome.rewardAmount,
      outcome.deliberationId,
      outcome.timestamp,
      outcome.finalized ? 1 : 0
    );

    log.debug('Outcome recorded', { id, escrow: outcome.escrowPda.slice(0, 8) });
    return id;
  }

  getOutcome(escrowPda: string): OutcomeRecord | null {
    const row = this.db.prepare('SELECT * FROM outcomes WHERE escrowPda = ?').get(escrowPda) as any;
    if (!row) return null;

    return {
      ...row,
      wasSlashed: !!row.wasSlashed,
      finalized: !!row.finalized,
    };
  }

  getRecentOutcomes(limit = 100): OutcomeRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM outcomes ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];

    return rows.map((row) => ({
      ...row,
      wasSlashed: !!row.wasSlashed,
      finalized: !!row.finalized,
    }));
  }

  getFinalizedOutcomes(): OutcomeRecord[] {
    const rows = this.db.prepare(
      'SELECT * FROM outcomes WHERE finalized = 1 ORDER BY timestamp DESC'
    ).all() as any[];

    return rows.map((row) => ({
      ...row,
      wasSlashed: !!row.wasSlashed,
      finalized: true,
    }));
  }

  finalizeOutcome(escrowPda: string, consensusScore: number, wasSlashed: boolean, reward: number): void {
    const deviation = this.db.prepare('SELECT ourScore FROM outcomes WHERE escrowPda = ?').get(escrowPda) as any;
    const ourScore = deviation?.ourScore ?? 0;

    this.db.prepare(`
      UPDATE outcomes
      SET consensusScore = ?, deviation = ?, wasSlashed = ?, rewardAmount = ?, finalized = 1
      WHERE escrowPda = ?
    `).run(
      consensusScore,
      Math.abs(ourScore - consensusScore),
      wasSlashed ? 1 : 0,
      reward,
      escrowPda
    );

    log.info('Outcome finalized', {
      escrow: escrowPda.slice(0, 8),
      ourScore,
      consensus: consensusScore,
      slashed: wasSlashed,
    });
  }

  // Calibration methods
  getCalibration(): CalibrationParams {
    const row = this.db.prepare('SELECT * FROM calibration WHERE id = 1').get() as any;
    if (!row) return DEFAULT_CALIBRATION;
    return row;
  }

  saveCalibration(params: CalibrationParams): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO calibration
      (id, confidenceThresholdLow, confidenceThresholdMedium, confidenceThresholdHigh,
       riskWeightFraudHigh, riskWeightFraudMedium, riskWeightFraudLow,
       advocateAggressiveness, historicalAccuracy, totalVotes, accurateVotes, slashEvents, lastUpdated)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.confidenceThresholdLow,
      params.confidenceThresholdMedium,
      params.confidenceThresholdHigh,
      params.riskWeightFraudHigh,
      params.riskWeightFraudMedium,
      params.riskWeightFraudLow,
      params.advocateAggressiveness,
      params.historicalAccuracy,
      params.totalVotes,
      params.accurateVotes,
      params.slashEvents,
      params.lastUpdated
    );

    log.debug('Calibration saved', { accuracy: params.historicalAccuracy });
  }

  // Pattern methods
  recordPattern(pattern: Omit<LearnedPattern, 'id'>): string {
    const id = `pattern-${pattern.patternType}-${Date.now()}`;

    this.db.prepare(`
      INSERT OR REPLACE INTO patterns
      (id, patternType, description, successRate, sampleSize, firstSeen, lastSeen, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      pattern.patternType,
      pattern.description,
      pattern.successRate,
      pattern.sampleSize,
      pattern.firstSeen,
      pattern.lastSeen,
      pattern.metadata
    );

    return id;
  }

  getPatternsByType(patternType: string): LearnedPattern[] {
    return this.db.prepare(
      'SELECT * FROM patterns WHERE patternType = ? ORDER BY successRate DESC'
    ).all(patternType) as LearnedPattern[];
  }

  updatePattern(id: string, updates: Partial<LearnedPattern>): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.successRate !== undefined) {
      sets.push('successRate = ?');
      values.push(updates.successRate);
    }
    if (updates.sampleSize !== undefined) {
      sets.push('sampleSize = ?');
      values.push(updates.sampleSize);
    }
    if (updates.lastSeen !== undefined) {
      sets.push('lastSeen = ?');
      values.push(updates.lastSeen);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE patterns SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  // Deliberation storage
  storeDeliberation(result: DeliberationResult): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO deliberations
      (id, escrowPda, finalScore, confidence, reasoning, transcript, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.id,
      result.escrowPda,
      result.finalScore,
      result.confidence,
      result.arbiterReasoning,
      JSON.stringify(result.transcript),
      Date.now()
    );
  }

  getDeliberation(escrowPda: string): DeliberationResult | null {
    const row = this.db.prepare(
      'SELECT * FROM deliberations WHERE escrowPda = ?'
    ).get(escrowPda) as any;

    if (!row) return null;

    return {
      id: row.id,
      escrowPda: row.escrowPda,
      transcript: JSON.parse(row.transcript),
      arbiterAnalysis: { agentStrengths: [], agentWeaknesses: [], providerStrengths: [], providerWeaknesses: [], investigatorInsights: [], evidenceWeight: { supportingAgent: 0, supportingProvider: 0, inconclusive: 0 } },
      finalScore: row.finalScore,
      confidence: row.confidence,
      arbiterReasoning: row.reasoning,
      keyFactors: [],
      metadata: { totalRounds: 0, totalLLMCalls: 0, deliberationTimeMs: 0, modelUsed: '' },
    };
  }

  // Statistics
  getStatistics(): {
    totalOutcomes: number;
    finalizedOutcomes: number;
    accuracy: number;
    slashRate: number;
    averageDeviation: number;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN finalized = 1 THEN 1 ELSE 0 END) as finalized,
        AVG(CASE WHEN finalized = 1 AND deviation IS NOT NULL THEN deviation ELSE NULL END) as avgDeviation,
        SUM(CASE WHEN wasSlashed = 1 THEN 1 ELSE 0 END) as slashed
      FROM outcomes
    `).get() as any;

    const finalized = stats.finalized || 0;
    const slashed = stats.slashed || 0;
    const accurate = this.db.prepare(
      'SELECT COUNT(*) as count FROM outcomes WHERE finalized = 1 AND deviation <= 15'
    ).get() as any;

    return {
      totalOutcomes: stats.total || 0,
      finalizedOutcomes: finalized,
      accuracy: finalized > 0 ? (accurate.count / finalized) : 1,
      slashRate: finalized > 0 ? (slashed / finalized) : 0,
      averageDeviation: stats.avgDeviation || 0,
    };
  }

  close(): void {
    this.db.close();
    log.info('Knowledge base closed');
  }
}
