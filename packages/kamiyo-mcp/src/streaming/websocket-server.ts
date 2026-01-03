import { EventEmitter } from 'events';
import { X402Program } from '../solana/anchor.js';
import { PublicKey } from '@solana/web3.js';

export interface StreamEvent {
  type: 'escrow_created' | 'escrow_updated' | 'dispute_filed' | 'funds_released' | 'quality_assessed';
  timestamp: number;
  data: any;
}

export interface Subscription {
  id: string;
  filter: {
    eventTypes?: StreamEvent['type'][];
    escrowAddress?: string;
    agentAddress?: string;
  };
  callback: (event: StreamEvent) => void;
}

export class StreamingService extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventBuffer: StreamEvent[] = [];
  private maxBufferSize = 1000;

  constructor(private program: X402Program) {
    super();
    this.startPolling();
  }

  subscribe(filter: Subscription['filter'], callback: (event: StreamEvent) => void): string {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subscription: Subscription = {
      id: subscriptionId,
      filter,
      callback,
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  private async startPolling(): Promise<void> {
    setInterval(async () => {
      await this.pollForEvents();
    }, 2000);
  }

  private async pollForEvents(): Promise<void> {
    try {
      const recentSlot = await this.program.program.provider.connection.getSlot();
      const signatures = await this.program.program.provider.connection.getSignaturesForAddress(
        this.program.program.programId,
        { limit: 10 }
      );

      for (const sig of signatures) {
        await this.processTransaction(sig.signature);
      }
    } catch (error) {
      console.error('Error polling for events:', error);
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.program.program.provider.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return;

      const event = this.parseTransactionToEvent(tx, signature);
      if (event) {
        this.emitEvent(event);
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  }

  private parseTransactionToEvent(tx: any, signature: string): StreamEvent | null {
    if (!tx.meta || tx.meta.err) return null;

    const logs = tx.meta.logMessages || [];

    if (logs.some((log: string) => log.includes('InitializeEscrow'))) {
      return {
        type: 'escrow_created',
        timestamp: Date.now(),
        data: {
          signature,
          slot: tx.slot,
          accounts: tx.transaction.message.accountKeys.map((k: any) => k.toString()),
        },
      };
    }

    if (logs.some((log: string) => log.includes('MarkDisputed'))) {
      return {
        type: 'dispute_filed',
        timestamp: Date.now(),
        data: {
          signature,
          slot: tx.slot,
        },
      };
    }

    if (logs.some((log: string) => log.includes('ReleaseFunds'))) {
      return {
        type: 'funds_released',
        timestamp: Date.now(),
        data: {
          signature,
          slot: tx.slot,
        },
      };
    }

    return null;
  }

  private emitEvent(event: StreamEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    this.emit('event', event);

    for (const [id, subscription] of this.subscriptions) {
      if (this.matchesFilter(event, subscription.filter)) {
        try {
          subscription.callback(event);
        } catch (error) {
          console.error(`Error in subscription ${id}:`, error);
        }
      }
    }
  }

  private matchesFilter(event: StreamEvent, filter: Subscription['filter']): boolean {
    if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
      return false;
    }

    if (filter.escrowAddress && event.data.escrowAddress !== filter.escrowAddress) {
      return false;
    }

    if (filter.agentAddress && event.data.agentAddress !== filter.agentAddress) {
      return false;
    }

    return true;
  }

  getRecentEvents(count: number = 10): StreamEvent[] {
    return this.eventBuffer.slice(-count);
  }

  async emitCustomEvent(type: StreamEvent['type'], data: any): Promise<void> {
    const event: StreamEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.emitEvent(event);
  }
}

export class WebSocketMCPServer {
  private streaming: StreamingService;

  constructor(program: X402Program) {
    this.streaming = new StreamingService(program);
  }

  async handleSubscription(filter: Subscription['filter']): Promise<string> {
    return this.streaming.subscribe(filter, (event) => {
      console.log('Event received:', event);
    });
  }

  async handleUnsubscribe(subscriptionId: string): Promise<void> {
    this.streaming.unsubscribe(subscriptionId);
  }

  async getEventStream(escrowAddress?: string): Promise<AsyncGenerator<StreamEvent>> {
    const events: StreamEvent[] = [];
    let resolveNext: ((value: StreamEvent) => void) | null = null;

    const subscriptionId = this.streaming.subscribe(
      { escrowAddress },
      (event) => {
        if (resolveNext) {
          resolveNext(event);
          resolveNext = null;
        } else {
          events.push(event);
        }
      }
    );

    async function* generator() {
      try {
        while (true) {
          if (events.length > 0) {
            yield events.shift()!;
          } else {
            yield await new Promise<StreamEvent>((resolve) => {
              resolveNext = resolve;
            });
          }
        }
      } finally {
        console.log('Stream closed');
      }
    }

    return generator();
  }
}
