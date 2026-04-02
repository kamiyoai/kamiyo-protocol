import { describe, expect, it } from 'vitest';
import { replayScenarioEvents } from './replay';

describe('replayScenarioEvents', () => {
  it('orders events and assigns replay offsets', () => {
    const events = replayScenarioEvents(
      [
        {
          id: 'b',
          caseId: 'case-1',
          branchId: 'branch-1',
          eventType: 'branch_completed',
          payload: { status: 'completed' },
          createdAt: 2000,
        },
        {
          id: 'a',
          caseId: 'case-1',
          branchId: null,
          eventType: 'case_created',
          payload: { mission: 'Test' },
          createdAt: 1000,
        },
      ],
      { 'branch-1': 'Baseline' },
      { stepMs: 500 }
    );

    expect(events.map((event: (typeof events)[number]) => event.id)).toEqual(['a', 'b']);
    expect(events.map((event: (typeof events)[number]) => event.offsetMs)).toEqual([0, 500]);
    expect(events[1]?.branchLabel).toBe('Baseline');
  });
});
