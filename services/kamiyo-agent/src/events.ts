/**
 * Streaming Tick Events
 *
 * Provides a typed event bus for Kamiyo Agent runtime events.
 * Enables real-time visibility into tick phases — useful for
 * dashboards, debugging, and SSE streaming.
 *
 * @module events
 */

import { EventEmitter } from 'node:events';

export type KamiyoAgentEventKind =
  | 'tick:start'
  | 'tick:complete'
  | 'tick:error'
  | 'swarm:opportunities'
  | 'swarm:missions'
  | 'swarm:executing'
  | 'swarm:result'
  | 'tick:settlement';

export type KamiyoAgentEvent = {
  kind: KamiyoAgentEventKind;
  tickId: string;
  at: string;
  agentId?: string;
  payload?: Record<string, unknown>;
};

export class KamiyoAgentEventBus extends EventEmitter {
  private _lastEvent: KamiyoAgentEvent | null = null;
  private _eventCount = 0;

  emitKamiyoAgent(event: KamiyoAgentEvent): void {
    this._lastEvent = event;
    this._eventCount += 1;
    this.emit('kamiyo-agent', event);
  }

  onKamiyoAgent(listener: (event: KamiyoAgentEvent) => void): this {
    this.on('kamiyo-agent', listener);
    return this;
  }

  get lastEvent(): KamiyoAgentEvent | null {
    return this._lastEvent;
  }

  get eventCount(): number {
    return this._eventCount;
  }
}

export function formatSseEvent(event: KamiyoAgentEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.kind}\ndata: ${data}\n\n`;
}

export function formatSseHeartbeat(): string {
  return `: heartbeat ${new Date().toISOString()}\n\n`;
}
