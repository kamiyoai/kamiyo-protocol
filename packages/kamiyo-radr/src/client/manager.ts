/**
 * Singleton manager for ShadowWire and Kamiyo clients.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { ShadowWireWrapper, createShadowWireClient } from './shadow-wire';
import { PrivateEscrowHandler, createPrivateEscrowHandler } from '../escrow/private-escrow';
import { ShadowIdReputationGate, createShadowIdReputationGate } from '../reputation/shadow-id-gate';
import type { PrivateEscrowConfig } from '../types';

const DEFAULT_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

interface CachedClients {
  shadowWire: ShadowWireWrapper | null;
  escrowHandler: PrivateEscrowHandler | null;
  reputationGate: ShadowIdReputationGate | null;
  lastUsed: number;
}

interface ManagerConfig {
  maxAge?: number;
  autoCleanup?: boolean;
  cleanupInterval?: number;
  referralId?: string;
}

export class RadrClientManager {
  private static instance: RadrClientManager | null = null;

  private clients: Map<string, CachedClients> = new Map();
  private config: { maxAge: number; autoCleanup: boolean; cleanupInterval: number; referralId?: string };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(config?: ManagerConfig) {
    this.config = {
      maxAge: config?.maxAge ?? 5 * 60 * 1000,
      autoCleanup: config?.autoCleanup ?? true,
      cleanupInterval: config?.cleanupInterval ?? 60 * 1000,
      referralId: config?.referralId,
    };

    if (this.config.autoCleanup) this.startCleanupTimer();
  }

  static getInstance(config?: ManagerConfig): RadrClientManager {
    if (!RadrClientManager.instance) {
      RadrClientManager.instance = new RadrClientManager(config);
    }
    return RadrClientManager.instance;
  }

  static resetInstance(): void {
    if (RadrClientManager.instance) {
      RadrClientManager.instance.cleanup();
      RadrClientManager.instance = null;
    }
  }

  async getShadowWire(connection: Connection, debug = false): Promise<ShadowWireWrapper> {
    const key = this.getConnectionKey(connection);
    let cached = this.clients.get(key);

    if (cached?.shadowWire) {
      cached.lastUsed = Date.now();
      return cached.shadowWire;
    }

    const client = await createShadowWireClient(connection, {
      debug,
      referralId: this.config.referralId,
    });

    if (!cached) {
      cached = {
        shadowWire: null,
        escrowHandler: null,
        reputationGate: null,
        lastUsed: Date.now(),
      };
      this.clients.set(key, cached);
    }

    cached.shadowWire = client;
    cached.lastUsed = Date.now();

    return client;
  }

  async getEscrowHandler(
    connection: Connection,
    programId?: PublicKey,
    config?: Partial<PrivateEscrowConfig>
  ): Promise<PrivateEscrowHandler> {
    const key = this.getConnectionKey(connection);
    let cached = this.clients.get(key);

    if (cached?.escrowHandler) {
      cached.lastUsed = Date.now();
      return cached.escrowHandler;
    }

    const handler = await createPrivateEscrowHandler(
      connection,
      programId ?? DEFAULT_PROGRAM_ID,
      config
    );

    if (!cached) {
      cached = {
        shadowWire: null,
        escrowHandler: null,
        reputationGate: null,
        lastUsed: Date.now(),
      };
      this.clients.set(key, cached);
    }

    cached.escrowHandler = handler;
    cached.lastUsed = Date.now();

    return handler;
  }

  getReputationGate(connection: Connection, programId?: PublicKey): ShadowIdReputationGate {
    const key = this.getConnectionKey(connection);
    let cached = this.clients.get(key);

    if (cached?.reputationGate) {
      cached.lastUsed = Date.now();
      return cached.reputationGate;
    }

    const gate = createShadowIdReputationGate(connection, programId ?? DEFAULT_PROGRAM_ID);

    if (!cached) {
      cached = {
        shadowWire: null,
        escrowHandler: null,
        reputationGate: null,
        lastUsed: Date.now(),
      };
      this.clients.set(key, cached);
    }

    cached.reputationGate = gate;
    cached.lastUsed = Date.now();

    return gate;
  }

  cleanupStale(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.clients.entries()) {
      if (now - cached.lastUsed > this.config.maxAge) {
        try {
          (cached.shadowWire as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.close?.();
          (cached.shadowWire as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.destroy?.();
          (cached.escrowHandler as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.close?.();
          (cached.escrowHandler as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.destroy?.();
        } catch {}
        this.clients.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  cleanup(): void {
    this.stopCleanupTimer();
    for (const cached of this.clients.values()) {
      try {
        (cached.shadowWire as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.close?.();
        (cached.shadowWire as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.destroy?.();
        (cached.escrowHandler as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.close?.();
        (cached.escrowHandler as unknown as { close?: () => void; destroy?: () => void; disconnect?: () => void })?.destroy?.();
      } catch {}
    }
    this.clients.clear();
  }

  get size(): number {
    return this.clients.size;
  }

  private getConnectionKey(connection: Connection): string {
    return connection.rpcEndpoint;
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupStale();
    }, this.config.cleanupInterval);

    if ((this.cleanupTimer as unknown as { unref?: () => void }).unref) {
      (this.cleanupTimer as unknown as { unref?: () => void }).unref?.();
    }
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export function getClientManager(config?: ManagerConfig): RadrClientManager {
  return RadrClientManager.getInstance(config);
}

export function cleanupClients(): void {
  RadrClientManager.resetInstance();
}
