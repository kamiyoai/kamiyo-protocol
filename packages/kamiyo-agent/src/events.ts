import type { ToolCall, ToolCallResult } from './tool';
import type { ChatResponse } from './provider';

export type AgentEventMap = {
  'turn:start': { runId: string; turn: number; input: string };
  'turn:end': { runId: string; turn: number; response: ChatResponse };
  'tool:call': { runId: string; call: ToolCall };
  'tool:result': { runId: string; result: ToolCallResult };
  'tool:error': { runId: string; toolName: string; error: unknown };
  'run:start': { runId: string; input: string };
  'run:end': { runId: string; text: string; turns: number; durationMs: number };
  'run:error': { runId: string; error: unknown };
  'improve:score': { runId: string; score: number; taskType: string };
  'improve:promote': { taskType: string; variantId: string };
  'improve:error': { taskType: string; error: string };
};

type EventHandler<T> = (data: T) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler<unknown>>>();

  on<K extends keyof AgentEventMap>(event: K, handler: EventHandler<AgentEventMap[K]>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler<unknown>);
    return () => set.delete(handler as EventHandler<unknown>);
  }

  emit<K extends keyof AgentEventMap>(event: K, data: AgentEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch {
        // don't let handler errors break the agent loop
      }
    }
  }

  removeAll(): void {
    this.handlers.clear();
  }
}
