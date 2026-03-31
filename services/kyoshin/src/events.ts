/**
 * Streaming Tick Events
 *
 * Provides a typed event bus for Kyoshin runtime events.
 * Enables real-time visibility into tick phases — useful for
 * dashboards, debugging, and SSE streaming.
 *
 * @module events
 */

import { EventEmitter } from 'node:events';

export type KyoshinEventKind =
  | 'tick:start'
  | 'tick:complete'
  | 'tick:error'
  | 'swarm:opportunities'
  | 'swarm:missions'
  | 'swarm:executing'
  | 'swarm:result'
  | 'tick:settlement';

export type KyoshinEvent = {
  kind: KyoshinEventKind;
  tickId: string;
  at: string;
  agentId?: string;
  payload?: Record<string, unknown>;
};

export class KyoshinEventBus extends EventEmitter {
  private _lastEvent: KyoshinEvent | null = null;
  private _eventCount = 0;

  emitKyoshin(event: KyoshinEvent): void {
    this._lastEvent = event;
    this._eventCount += 1;
    this.emit('kyoshin', event);
  }

  onKyoshin(listener: (event: KyoshinEvent) => void): this {
    this.on('kyoshin', listener);
    return this;
  }

  get lastEvent(): KyoshinEvent | null {
    return this._lastEvent;
  }

  get eventCount(): number {
    return this._eventCount;
  }
}

export function formatSseEvent(event: KyoshinEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.kind}\ndata: ${data}\n\n`;
}

export function formatSseHeartbeat(): string {
  return `: heartbeat ${new Date().toISOString()}\n\n`;
}
