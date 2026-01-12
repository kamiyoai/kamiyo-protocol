/**
 * Type-safe event emitter for agent lifecycle events.
 */

export interface KamiyoEvents {
  // Lifecycle
  'agent:initialized': { agentId: string; network: string };
  'agent:shutdown': { agentId: string; reason?: string };

  // API consumption
  'api:request': { endpoint: string; method: string; paymentId: string };
  'api:response': { endpoint: string; paymentId: string; status: number; latencyMs: number };
  'api:error': { endpoint: string; paymentId?: string; error: string };
  'api:quality': { endpoint: string; paymentId: string; score: number; passesThreshold: boolean };

  // Escrow
  'escrow:creating': { provider: string; amount: number; transactionId: string };
  'escrow:created': { escrowAddress: string; transactionId: string; amount: number };
  'escrow:released': { escrowAddress: string; transactionId: string };
  'escrow:error': { transactionId: string; error: string };

  // Disputes
  'dispute:filing': { paymentId: string; reason: string };
  'dispute:filed': { disputeId: string; paymentId: string };
  'dispute:resolved': { disputeId: string; outcome: string; refundPercentage: number };

  // ZK Reputation
  'reputation:commitment': { commitment: string; tier: number };
  'reputation:proving': { threshold: number; tier: number };
  'reputation:proved': { threshold: number; tier: number; cached: boolean };
  'reputation:verified': { agentId: string; tier: number; valid: boolean };

  // Circuit breaker
  'circuit:opened': { endpoint: string; failures: number };
  'circuit:halfOpen': { endpoint: string };
  'circuit:closed': { endpoint: string };

  // Rate limiting
  'ratelimit:exceeded': { endpoint: string; waitMs: number };

  // Storage
  'storage:persisted': { key: string };
  'storage:loaded': { key: string };
  'storage:error': { key: string; error: string };

  // Health
  'health:check': { status: 'healthy' | 'degraded' | 'unhealthy'; components: Record<string, boolean> };
}

export type EventName = keyof KamiyoEvents;
export type EventPayload<E extends EventName> = KamiyoEvents[E];

export type EventHandler<E extends EventName> = (payload: EventPayload<E>) => void | Promise<void>;
export type WildcardHandler = (event: EventName, payload: unknown) => void | Promise<void>;

interface Subscription {
  id: string;
  event: EventName | '*';
  handler: EventHandler<EventName> | WildcardHandler;
  once: boolean;
}

interface EventRecord {
  event: EventName;
  payload: unknown;
  timestamp: number;
}

export interface EventEmitterOptions {
  maxHistorySize?: number;
  asyncHandlers?: boolean;
  errorHandler?: (event: EventName, error: Error) => void;
}

export class KamiyoEventEmitter {
  private subscriptions = new Map<string, Subscription>();
  private eventIndex = new Map<EventName | '*', Set<string>>();
  private history: EventRecord[] = [];
  private maxHistorySize: number;
  private asyncHandlers: boolean;
  private errorHandler: (event: EventName, error: Error) => void;
  private nextId = 0;

  constructor(options: EventEmitterOptions = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.asyncHandlers = options.asyncHandlers ?? true;
    this.errorHandler = options.errorHandler ?? ((event, err) => console.error(`Event handler error [${event}]:`, err));
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.addSubscription(event, handler as EventHandler<EventName>, false);
  }

  once<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.addSubscription(event, handler as EventHandler<EventName>, true);
  }

  onAny(handler: WildcardHandler): () => void {
    return this.addSubscription('*', handler, false);
  }

  off<E extends EventName>(event: E, handler?: EventHandler<E>): void {
    const ids = this.eventIndex.get(event);
    if (!ids) return;

    for (const id of ids) {
      const sub = this.subscriptions.get(id);
      if (sub && (!handler || sub.handler === handler)) {
        this.subscriptions.delete(id);
        ids.delete(id);
      }
    }
  }

  offAll(): void {
    this.subscriptions.clear();
    this.eventIndex.clear();
  }

  emit<E extends EventName>(event: E, payload: EventPayload<E>): void {
    // Record in history
    if (this.maxHistorySize > 0) {
      if (this.history.length >= this.maxHistorySize) {
        this.history.shift();
      }
      this.history.push({ event, payload, timestamp: Date.now() });
    }

    const handlers = this.getHandlers(event);
    const wildcardHandlers = this.getWildcardHandlers();

    for (const sub of [...handlers, ...wildcardHandlers]) {
      const execute = async () => {
        try {
          if (sub.event === '*') {
            await (sub.handler as WildcardHandler)(event, payload);
          } else {
            await (sub.handler as EventHandler<E>)(payload);
          }
        } catch (err) {
          this.errorHandler(event, err instanceof Error ? err : new Error(String(err)));
        }

        if (sub.once) {
          this.subscriptions.delete(sub.id);
          this.eventIndex.get(sub.event)?.delete(sub.id);
        }
      };

      if (this.asyncHandlers) {
        execute();
      } else {
        execute().catch(() => {});
      }
    }
  }

  async emitAsync<E extends EventName>(event: E, payload: EventPayload<E>): Promise<void> {
    // Record in history
    if (this.maxHistorySize > 0) {
      if (this.history.length >= this.maxHistorySize) {
        this.history.shift();
      }
      this.history.push({ event, payload, timestamp: Date.now() });
    }

    const handlers = this.getHandlers(event);
    const wildcardHandlers = this.getWildcardHandlers();
    const promises: Promise<void>[] = [];

    for (const sub of [...handlers, ...wildcardHandlers]) {
      const promise = (async () => {
        try {
          if (sub.event === '*') {
            await (sub.handler as WildcardHandler)(event, payload);
          } else {
            await (sub.handler as EventHandler<E>)(payload);
          }
        } catch (err) {
          this.errorHandler(event, err instanceof Error ? err : new Error(String(err)));
        }

        if (sub.once) {
          this.subscriptions.delete(sub.id);
          this.eventIndex.get(sub.event)?.delete(sub.id);
        }
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
  }

  waitFor<E extends EventName>(
    event: E,
    options: { timeout?: number; filter?: (payload: EventPayload<E>) => boolean } = {}
  ): Promise<EventPayload<E>> {
    return new Promise((resolve, reject) => {
      const { timeout, filter } = options;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const cleanup = this.on(event, (payload) => {
        if (filter && !filter(payload)) return;

        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        resolve(payload);
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);
      }
    });
  }

  getHistory(event?: EventName): EventRecord[] {
    if (event) {
      return this.history.filter((r) => r.event === event);
    }
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  listenerCount(event: EventName): number {
    return this.eventIndex.get(event)?.size ?? 0;
  }

  eventNames(): EventName[] {
    const names = new Set<EventName>();
    for (const sub of this.subscriptions.values()) {
      if (sub.event !== '*') {
        names.add(sub.event as EventName);
      }
    }
    return Array.from(names);
  }

  private addSubscription(
    event: EventName | '*',
    handler: EventHandler<EventName> | WildcardHandler,
    once: boolean
  ): () => void {
    const id = `${++this.nextId}`;
    const subscription: Subscription = { id, event, handler, once };

    this.subscriptions.set(id, subscription);

    if (!this.eventIndex.has(event)) {
      this.eventIndex.set(event, new Set());
    }
    this.eventIndex.get(event)!.add(id);

    return () => {
      this.subscriptions.delete(id);
      this.eventIndex.get(event)?.delete(id);
    };
  }

  private getHandlers(event: EventName): Subscription[] {
    const ids = this.eventIndex.get(event);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscriptions.get(id))
      .filter((sub): sub is Subscription => sub !== undefined);
  }

  private getWildcardHandlers(): Subscription[] {
    const ids = this.eventIndex.get('*');
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscriptions.get(id))
      .filter((sub): sub is Subscription => sub !== undefined);
  }
}

// Typed event shortcuts
export function createEventEmitter(options?: EventEmitterOptions): KamiyoEventEmitter {
  return new KamiyoEventEmitter(options);
}

// Event middleware type
export type EventMiddleware = (
  event: EventName,
  payload: unknown,
  next: () => void
) => void | Promise<void>;

// Event emitter with middleware support
export class KamiyoEventBus extends KamiyoEventEmitter {
  private middlewares: EventMiddleware[] = [];

  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  emit<E extends EventName>(event: E, payload: EventPayload<E>): void {
    let index = 0;

    const next = () => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        middleware(event, payload, next);
      } else {
        super.emit(event, payload);
      }
    };

    next();
  }
}

// Logging middleware
export const loggingMiddleware: EventMiddleware = (event, payload, next) => {
  console.log(`[Event] ${event}:`, payload);
  next();
};

// Metrics middleware factory
export function metricsMiddleware(
  onEvent: (event: EventName, payload: unknown) => void
): EventMiddleware {
  return (event, payload, next) => {
    onEvent(event, payload);
    next();
  };
}
