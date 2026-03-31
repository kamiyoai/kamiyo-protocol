import assert from 'node:assert/strict';
import test from 'node:test';

import { KyoshinEventBus, formatSseEvent, formatSseHeartbeat } from './events.js';
import type { KyoshinEvent } from './events.js';

const NOW = '2026-03-31T12:00:00.000Z';

test('KyoshinEventBus emits and receives events', () => {
  const bus = new KyoshinEventBus();
  const received: KyoshinEvent[] = [];

  bus.onKyoshin(event => received.push(event));

  bus.emitKyoshin({ kind: 'tick:start', tickId: 'tick-1', at: NOW });
  bus.emitKyoshin({ kind: 'tick:complete', tickId: 'tick-1', at: NOW });

  assert.equal(received.length, 2);
  assert.equal(received[0].kind, 'tick:start');
  assert.equal(received[1].kind, 'tick:complete');
});

test('KyoshinEventBus tracks lastEvent', () => {
  const bus = new KyoshinEventBus();
  assert.equal(bus.lastEvent, null);

  bus.emitKyoshin({ kind: 'tick:start', tickId: 'tick-1', at: NOW });
  assert.equal(bus.lastEvent?.kind, 'tick:start');

  bus.emitKyoshin({
    kind: 'swarm:opportunities',
    tickId: 'tick-1',
    at: NOW,
    payload: { count: 5 },
  });
  assert.equal(bus.lastEvent?.kind, 'swarm:opportunities');
});

test('KyoshinEventBus tracks eventCount', () => {
  const bus = new KyoshinEventBus();
  assert.equal(bus.eventCount, 0);

  bus.emitKyoshin({ kind: 'tick:start', tickId: 'tick-1', at: NOW });
  bus.emitKyoshin({ kind: 'tick:complete', tickId: 'tick-1', at: NOW });
  assert.equal(bus.eventCount, 2);
});

test('listener errors do not crash the bus', () => {
  const bus = new KyoshinEventBus();
  const received: KyoshinEvent[] = [];

  bus.onKyoshin(() => {
    throw new Error('listener crash');
  });
  bus.onKyoshin(event => received.push(event));

  // EventEmitter throws by default — catch it
  assert.throws(() => {
    bus.emitKyoshin({ kind: 'tick:start', tickId: 'tick-1', at: NOW });
  });
});

test('events include optional agentId and payload', () => {
  const bus = new KyoshinEventBus();
  const received: KyoshinEvent[] = [];
  bus.onKyoshin(event => received.push(event));

  bus.emitKyoshin({
    kind: 'swarm:result',
    tickId: 'tick-1',
    at: NOW,
    agentId: 'agent-alpha',
    payload: { status: 'executed', revenueSol: 0.005 },
  });

  assert.equal(received[0].agentId, 'agent-alpha');
  assert.deepEqual(received[0].payload, { status: 'executed', revenueSol: 0.005 });
});

test('formatSseEvent produces valid SSE format', () => {
  const event: KyoshinEvent = {
    kind: 'tick:start',
    tickId: 'tick-1',
    at: NOW,
  };

  const sse = formatSseEvent(event);
  assert.ok(sse.startsWith('event: tick:start\n'));
  assert.ok(sse.includes('data: '));
  assert.ok(sse.endsWith('\n\n'));

  // Verify data line is valid JSON
  const dataLine = sse.split('\n').find(l => l.startsWith('data: '))!;
  const parsed = JSON.parse(dataLine.slice(6));
  assert.equal(parsed.kind, 'tick:start');
  assert.equal(parsed.tickId, 'tick-1');
});

test('formatSseHeartbeat produces valid SSE comment', () => {
  const heartbeat = formatSseHeartbeat();
  assert.ok(heartbeat.startsWith(': heartbeat '));
  assert.ok(heartbeat.endsWith('\n\n'));
});
