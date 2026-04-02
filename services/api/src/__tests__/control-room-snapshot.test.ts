import { describe, expect, it } from 'vitest';
import { captureCounterfactualSnapshot } from '../control-room/snapshot';

describe('control-room snapshot', () => {
  it('produces a stable hash for manual evidence snapshots', async () => {
    const params = {
      teamId: 'team-1',
      mission: 'Investigate the anomaly.',
      source: { type: 'manual_evidence' as const },
      members: [
        { id: 'mem-1', agentId: 'agent-1', role: 'research', drawLimit: 10 },
      ],
      manualEvidence: {
        zeta: 'last',
        alpha: 'first',
      },
    };

    const first = await captureCounterfactualSnapshot(params);
    const second = await captureCounterfactualSnapshot(params);

    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.snapshot.manualEvidence).toEqual({ zeta: 'last', alpha: 'first' });
  });
});
