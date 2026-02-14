import { io, type Socket } from 'socket.io-client';
import { createLogger, truncate } from '../lib';
import { AcpClient } from './acp-client';
import { AcpJobPhase, SocketEvent, type AcpJobEventData } from './acp-types';
import { getOfferingHandlers } from './acp-offerings';

const log = createLogger('nika:acp:seller');

export interface AcpSellerConfig {
  enabled: boolean;
  apiUrl: string;
  socketUrl: string;
  apiKey: string;
  maxConcurrentJobs: number;
}

export interface AcpSellerStatus {
  enabled: boolean;
  running: boolean;
  connected: boolean;
  walletAddress: string | null;
  maxConcurrentJobs: number;
  runningJobs: number;
  queuedJobs: number;
  lastEventAt: string | null;
  lastError: string | null;
}

function resolveOfferingName(data: AcpJobEventData): string | null {
  try {
    const negotiationMemo = data.memos.find((m) => m.nextPhase === AcpJobPhase.NEGOTIATION);
    if (!negotiationMemo) return null;
    const parsed = JSON.parse(negotiationMemo.content) as { name?: unknown };
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}

function resolveServiceRequirements(data: AcpJobEventData): Record<string, unknown> {
  const negotiationMemo = data.memos.find((m) => m.nextPhase === AcpJobPhase.NEGOTIATION);
  if (!negotiationMemo) return {};
  try {
    const parsed = JSON.parse(negotiationMemo.content) as { requirement?: unknown };
    if (parsed.requirement && typeof parsed.requirement === 'object') return parsed.requirement as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function phaseLabel(phase: AcpJobPhase): string {
  return AcpJobPhase[phase] ?? String(phase);
}

export class AcpSeller {
  private config: AcpSellerConfig;
  private running = false;
  private connected = false;
  private socket: Socket | null = null;
  private client: AcpClient | null = null;
  private walletAddress: string | null = null;
  private queue: AcpJobEventData[] = [];
  private active = new Set<number>();
  private handledPhase = new Map<number, AcpJobPhase>();
  private lastEventAt: Date | null = null;
  private lastError: string | null = null;

  constructor(config: AcpSellerConfig) {
    this.config = {
      ...config,
      maxConcurrentJobs: Math.max(1, Math.min(10, Math.floor(config.maxConcurrentJobs))),
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): AcpSellerStatus {
    return {
      enabled: this.config.enabled,
      running: this.running,
      connected: this.connected,
      walletAddress: this.walletAddress,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      runningJobs: this.active.size,
      queuedJobs: this.queue.length,
      lastEventAt: this.lastEventAt ? this.lastEventAt.toISOString() : null,
      lastError: this.lastError,
    };
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      log.info('ACP seller disabled');
      return;
    }
    if (this.running) return;

    this.running = true;
    this.lastError = null;
    this.client = new AcpClient({ apiUrl: this.config.apiUrl, apiKey: this.config.apiKey });

    const me = await this.client.getMe();
    this.walletAddress = me.walletAddress;

    log.info('ACP seller starting', {
      socketUrl: this.config.socketUrl,
      apiUrl: this.config.apiUrl,
      walletAddress: this.walletAddress,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
    });

    const socket = io(this.config.socketUrl, {
      auth: { walletAddress: this.walletAddress },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelayMax: 20_000,
    });

    this.socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      log.info('ACP socket connected');
    });

    socket.on('disconnect', (reason) => {
      this.connected = false;
      log.warn('ACP socket disconnected', { reason });
    });

    socket.on('connect_error', (err: any) => {
      const msg = err?.message ? String(err.message) : String(err);
      this.lastError = msg;
      log.error('ACP socket connection error', { error: msg });
    });

    socket.on(SocketEvent.ROOM_JOINED, (_data: unknown, callback?: (ack: boolean) => void) => {
      if (typeof callback === 'function') callback(true);
      log.info('ACP socket joined room');
    });

    socket.on(SocketEvent.ON_NEW_TASK, (data: AcpJobEventData, callback?: (ack: boolean) => void) => {
      if (typeof callback === 'function') callback(true);
      this.lastEventAt = new Date();
      this.enqueue(data);
    });

    socket.on(SocketEvent.ON_EVALUATE, (data: AcpJobEventData, callback?: (ack: boolean) => void) => {
      if (typeof callback === 'function') callback(true);
      this.lastEventAt = new Date();
      log.info('ACP onEvaluate received', { jobId: data.id, phase: phaseLabel(data.phase) });
    });
  }

  stop(): void {
    this.running = false;
    this.connected = false;
    this.queue = [];
    this.active.clear();
    this.socket?.disconnect();
    this.socket = null;
    log.info('ACP seller stopped');
  }

  private enqueue(task: AcpJobEventData): void {
    if (!this.running) return;

    // Basic de-dupe on phase.
    const already = this.handledPhase.get(task.id);
    if (already !== undefined && already >= task.phase) return;

    if (this.active.size >= this.config.maxConcurrentJobs) {
      this.queue.push(task);
      return;
    }

    void this.process(task);
  }

  private pump(): void {
    if (!this.running) return;

    while (this.active.size < this.config.maxConcurrentJobs && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      void this.process(next);
    }
  }

  private async process(task: AcpJobEventData): Promise<void> {
    if (!this.client) return;
    if (this.active.has(task.id)) return;
    this.active.add(task.id);

    const jobId = task.id;
    const phase = task.phase;

    try {
      log.info('ACP job received', {
        jobId,
        phase: phaseLabel(phase),
        client: task.clientAddress,
        price: task.price,
      });

      if (phase === AcpJobPhase.REQUEST) {
        await this.handleRequest(task);
        this.handledPhase.set(jobId, phase);
        return;
      }

      if (phase === AcpJobPhase.TRANSACTION) {
        await this.handleTransaction(task);
        this.handledPhase.set(jobId, phase);
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.lastError = msg;
      log.error('ACP job processing error', { jobId, phase: phaseLabel(phase), error: msg });
    } finally {
      this.active.delete(jobId);
      this.pump();
    }
  }

  private async handleRequest(task: AcpJobEventData): Promise<void> {
    if (!this.client) return;
    const jobId = task.id;

    if (!task.memoToSign) return;

    const negotiationMemo = task.memos.find((m) => m.id === Number(task.memoToSign));
    if (negotiationMemo?.nextPhase !== AcpJobPhase.NEGOTIATION) return;

    const offeringName = resolveOfferingName(task);
    const requirements = resolveServiceRequirements(task);

    if (!offeringName) {
      await this.client.acceptOrRejectJob(jobId, { accept: false, reason: 'Invalid offering name' });
      return;
    }

    const handlers = getOfferingHandlers(offeringName);
    if (!handlers) {
      await this.client.acceptOrRejectJob(jobId, { accept: false, reason: `Unknown offering: ${offeringName}` });
      return;
    }

    const validation = handlers.validate(requirements);
    if (!validation.ok) {
      await this.client.acceptOrRejectJob(jobId, { accept: false, reason: truncate(validation.reason, 300) });
      return;
    }

    await this.client.acceptOrRejectJob(jobId, { accept: true, reason: 'Job accepted' });

    const paymentReason = handlers.requestPayment(validation.request);
    await this.client.requestPayment(jobId, { content: paymentReason });

    log.info('ACP job accepted; payment requested', { jobId, offeringName });
  }

  private async handleTransaction(task: AcpJobEventData): Promise<void> {
    if (!this.client) return;
    const jobId = task.id;

    const offeringName = resolveOfferingName(task);
    const requirements = resolveServiceRequirements(task);

    if (!offeringName) {
      await this.client.deliverJob(jobId, { deliverable: 'Error: Could not resolve offering name for this job.' });
      return;
    }

    const handlers = getOfferingHandlers(offeringName);
    if (!handlers) {
      await this.client.deliverJob(jobId, { deliverable: `Error: Unknown offering "${offeringName}".` });
      return;
    }

    const validation = handlers.validate(requirements);
    if (!validation.ok) {
      await this.client.deliverJob(jobId, { deliverable: `Error: Invalid requirements (${truncate(validation.reason, 300)}).` });
      return;
    }

    const result = await handlers.execute(validation.request);
    await this.client.deliverJob(jobId, {
      deliverable: result.deliverable,
      payableDetail: result.payableDetail,
    });

    log.info('ACP job delivered', { jobId, offeringName });
  }
}

