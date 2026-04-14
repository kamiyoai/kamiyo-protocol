import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

process.env.DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), `kamiyo-perf-${Date.now()}`);
await fs.mkdir(process.env.DATA_DIR, { recursive: true });

const {
  recordAgentPerformance,
  getAgentPerformance,
  getAgentLeaderboard,
  applyQualityScoreToEvent,
} = await import('../agent-performance');

describe('agent-performance', () => {
  it('records events and updates EWMA reputation', async () => {

    recordAgentPerformance({
      agentId: 'agent-a',
      taskType: 'research',
      cost: 1.2,
      latencyMs: 1500,
      outcome: 'completed',
      qualityScore: 0.8,
    });

    recordAgentPerformance({
      agentId: 'agent-a',
      taskType: 'research',
      cost: 0.9,
      latencyMs: 1000,
      outcome: 'completed',
      qualityScore: 0.6,
    });

    recordAgentPerformance({
      agentId: 'agent-b',
      taskType: 'research',
      cost: 1.0,
      latencyMs: 2000,
      outcome: 'completed',
      qualityScore: 0.4,
    });

    const summary = getAgentPerformance('agent-a');
    expect(summary.recentEvents).toHaveLength(2);
    expect(summary.byTaskType).toHaveLength(1);
    const rep = summary.byTaskType[0];
    expect(rep.sampleCount).toBe(2);
    expect(rep.ewmaScore).toBeGreaterThan(0.6);
    expect(rep.ewmaScore).toBeLessThanOrEqual(0.8);

    const leaderboard = getAgentLeaderboard('research', 1, 10);
    expect(leaderboard[0].agentId).toBe('agent-a');
    expect(leaderboard[0].rank).toBe(1);
  });

  it('applies quality score to existing event', async () => {
    recordAgentPerformance({
      agentId: 'agent-c',
      runId: 'run-1',
      nodeId: 'n1',
      taskType: 'analysis',
      cost: 0.5,
      latencyMs: 800,
      outcome: 'completed',
    });

    const graded = applyQualityScoreToEvent({
      runId: 'run-1',
      nodeId: 'n1',
      qualityScore: 0.9,
      gradedBy: 'oracle',
    });

    expect(graded).not.toBeNull();
    expect(graded?.qualityScore).toBeCloseTo(0.9);
    expect(graded?.gradedBy).toBe('oracle');

    const summary = getAgentPerformance('agent-c');
    expect(summary.byTaskType[0].sampleCount).toBe(1);
    expect(summary.byTaskType[0].ewmaScore).toBeCloseTo(0.9);
  });
});
