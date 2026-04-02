import { describe, expect, it, vi } from 'vitest';
import { createCompanionControlRoomClient } from './companion';

describe('CompanionControlRoomClient', () => {
  it('targets the control-room case detail route', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ caseId: 'case-1' }),
    })) as unknown as typeof fetch;

    const client = createCompanionControlRoomClient({
      baseUrl: 'https://api.kamiyo.ai/',
      token: 'demo-token',
      fetchImpl,
    });

    const detail = await client.getCase('team-1', 'case-1');
    expect(detail.caseId).toBe('case-1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.kamiyo.ai/api/hive-teams/team-1/control-room/cases/case-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer demo-token',
        }),
      })
    );
  });

  it('parses streamed case events', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'event: case_created',
              'data: {"id":"evt-1","caseId":"case-1","branchId":null,"eventType":"case_created","payload":{},"createdAt":1}',
              '',
              'event: done',
              'data: {"caseId":"case-1","status":"ready"}',
              '',
            ].join('\n')
          )
        );
        controller.close();
      },
    });

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: stream,
    })) as unknown as typeof fetch;

    const client = createCompanionControlRoomClient({
      baseUrl: 'https://api.kamiyo.ai',
      fetchImpl,
    });

    const seen: string[] = [];
    for await (const event of client.streamCaseEvents('team-1', 'case-1')) {
      seen.push(event.eventType);
    }

    expect(seen).toEqual(['case_created']);
  });
});
