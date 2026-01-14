/**
 * Production-grade vibe trading orchestrator.
 */

import { Wallet } from 'ethers';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HyperliquidExchange } from './exchange';
import { ThesisParser } from './vibe-parser';
import { PriceFeed, ConditionMonitor } from './vibe-monitor';
import {
  Strategy, VibePosition, VibeEvent, VibeEventHandler, VibeEventType,
  RiskLimits, DEFAULT_RISK_LIMITS, ExecutionResult, PersistedState,
  STATE_VERSION, ExecutionError, ValidationError
} from './vibe-types';
import {
  Logger, nullLogger, createConsoleLogger, Mutex, withRetry,
  CircuitBreaker, createMetrics, Metrics
} from './vibe-utils';

export interface VibeTraderConfig {
  wallet: Wallet;
  anthropicApiKey?: string;
  network?: 'mainnet' | 'testnet';
  pricePollMs?: number;
  riskLimits?: Partial<RiskLimits>;
  statePath?: string;
  logger?: Logger;
  maxStrategies?: number;
}

const MAX_STRATEGIES_DEFAULT = 1000;
const STALE_STRATEGY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class RiskManager {
  private limits: RiskLimits;
  private dailyPnl = 0;
  private dailyResetDate: string;
  private logger: Logger;

  constructor(limits: Partial<RiskLimits> = {}, logger: Logger = nullLogger) {
    this.limits = { ...DEFAULT_RISK_LIMITS, ...limits };
    this.logger = logger;
    this.dailyResetDate = this.getTodayUTC();
  }

  check(strategy: Strategy, exposure: number, posCount: number): { allowed: boolean; reason?: string } {
    if (strategy.sizeUsd > this.limits.maxPositionUsd) {
      return { allowed: false, reason: `Position $${strategy.sizeUsd} exceeds max $${this.limits.maxPositionUsd}` };
    }
    if (exposure + strategy.sizeUsd > this.limits.maxTotalExposureUsd) {
      return { allowed: false, reason: `Would exceed total exposure $${this.limits.maxTotalExposureUsd}` };
    }
    if (strategy.leverage > this.limits.maxLeverage) {
      return { allowed: false, reason: `Leverage ${strategy.leverage}x exceeds max ${this.limits.maxLeverage}x` };
    }
    if (posCount >= this.limits.maxConcurrentPositions) {
      return { allowed: false, reason: `Max concurrent positions (${this.limits.maxConcurrentPositions}) reached` };
    }
    if (this.limits.requireStopLoss && strategy.risk.stopLossPercent === undefined) {
      return { allowed: false, reason: 'Stop loss required' };
    }
    if (strategy.risk.stopLossPercent !== undefined && strategy.risk.stopLossPercent < this.limits.minStopLossPercent) {
      return { allowed: false, reason: `Stop loss too wide (max ${this.limits.minStopLossPercent * 100}%)` };
    }

    this.resetDailyIfNeeded();
    const potentialLoss = strategy.sizeUsd * Math.abs(strategy.risk.stopLossPercent || this.limits.minStopLossPercent);
    if (this.dailyPnl - potentialLoss < -this.limits.maxDailyLossUsd) {
      return { allowed: false, reason: `Would exceed daily loss limit $${this.limits.maxDailyLossUsd}` };
    }

    return { allowed: true };
  }

  recordPnl(pnl: number): void {
    this.resetDailyIfNeeded();
    this.dailyPnl += pnl;
    this.logger.info('PnL recorded', { pnl, dailyTotal: this.dailyPnl });
  }

  getLimits(): RiskLimits { return { ...this.limits }; }
  getDailyPnl(): number { return this.dailyPnl; }
  getDailyResetDate(): string { return this.dailyResetDate; }

  restore(dailyPnl: number, resetDate: string): void {
    this.dailyPnl = dailyPnl;
    this.dailyResetDate = resetDate;
    this.resetDailyIfNeeded();
  }

  private resetDailyIfNeeded(): void {
    const today = this.getTodayUTC();
    if (today !== this.dailyResetDate) {
      this.logger.info('Daily PnL reset', { oldDate: this.dailyResetDate, newDate: today, oldPnl: this.dailyPnl });
      this.dailyPnl = 0;
      this.dailyResetDate = today;
    }
  }

  private getTodayUTC(): string {
    return new Date().toISOString().split('T')[0];
  }
}

class PositionManager {
  private feed: PriceFeed;
  private exchange: HyperliquidExchange;
  private positions: Map<string, VibePosition> = new Map();
  private unsubscribers: Map<string, () => void> = new Map();
  private closeMutex: Mutex;
  private logger: Logger;
  private onEvent: (event: VibeEvent) => void;

  constructor(
    feed: PriceFeed,
    exchange: HyperliquidExchange,
    onEvent: (event: VibeEvent) => void,
    logger: Logger = nullLogger
  ) {
    this.feed = feed;
    this.exchange = exchange;
    this.onEvent = onEvent;
    this.logger = logger;
    this.closeMutex = new Mutex();
  }

  async open(strategy: Strategy, entryPrice: number, orderId?: number): Promise<VibePosition> {
    const position: VibePosition = {
      strategyId: strategy.id,
      asset: strategy.asset,
      direction: strategy.direction,
      entryPrice,
      currentPrice: entryPrice,
      sizeUsd: strategy.sizeUsd,
      leverage: strategy.leverage,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      openedAt: Date.now(),
      orderId,
      closing: false,
    };

    this.positions.set(strategy.id, position);
    this.monitor(strategy);
    this.logger.info('Position opened', { strategyId: strategy.id, asset: strategy.asset, entryPrice });
    return position;
  }

  private monitor(strategy: Strategy): void {
    const pos = this.positions.get(strategy.id);
    if (!pos) return;

    const unsubscribe = this.feed.subscribe(pos.asset, async (price) => {
      const p = this.positions.get(strategy.id);
      if (!p || p.closing) return;

      this.update(strategy.id, price);

      if (strategy.risk.stopLossPercent !== undefined && p.unrealizedPnlPercent <= strategy.risk.stopLossPercent) {
        this.onEvent({
          type: 'stop_loss',
          strategyId: strategy.id,
          timestamp: Date.now(),
          data: { pnl: p.unrealizedPnlPercent, price },
        });
        await this.close(strategy.id, 'stop_loss');
        return;
      }

      if (strategy.risk.takeProfitPercent !== undefined && p.unrealizedPnlPercent >= strategy.risk.takeProfitPercent) {
        this.onEvent({
          type: 'take_profit',
          strategyId: strategy.id,
          timestamp: Date.now(),
          data: { pnl: p.unrealizedPnlPercent, price },
        });
        await this.close(strategy.id, 'take_profit');
      }
    });

    this.unsubscribers.set(strategy.id, unsubscribe);
  }

  private update(strategyId: string, price: number): void {
    const p = this.positions.get(strategyId);
    if (!p) return;
    p.currentPrice = price;
    const change = (price - p.entryPrice) / p.entryPrice;
    const dir = p.direction === 'long' ? 1 : -1;
    p.unrealizedPnlPercent = change * dir * p.leverage;
    p.unrealizedPnl = p.sizeUsd * p.unrealizedPnlPercent;
  }

  async close(strategyId: string, reason: string): Promise<number> {
    const release = await this.closeMutex.acquire();
    try {
      const pos = this.positions.get(strategyId);
      if (!pos) {
        this.logger.warn('Position not found for close', { strategyId });
        return 0;
      }

      if (pos.closing) {
        this.logger.warn('Position already closing', { strategyId });
        return 0;
      }

      pos.closing = true;

      this.unsubscribers.get(strategyId)?.();
      this.unsubscribers.delete(strategyId);

      try {
        await withRetry(
          () => this.exchange.closePosition(pos.asset, 100),
          'close_position',
          { maxAttempts: 3, timeoutMs: 30000 },
          this.logger
        );
      } catch (e) {
        this.logger.error('Failed to close position on exchange', {
          strategyId,
          error: e instanceof Error ? e.message : String(e),
        });
        pos.closing = false;
        throw e;
      }

      const pnl = pos.unrealizedPnl;
      this.onEvent({
        type: 'strategy_closed',
        strategyId,
        timestamp: Date.now(),
        data: { reason, pnl, asset: pos.asset },
      });

      this.positions.delete(strategyId);
      this.logger.info('Position closed', { strategyId, reason, pnl });
      return pnl;
    } finally {
      release();
    }
  }

  async closeAll(reason: string): Promise<void> {
    const ids = Array.from(this.positions.keys());
    for (const id of ids) {
      try {
        await this.close(id, reason);
      } catch (e) {
        this.logger.error('Failed to close position', { strategyId: id, error: e });
      }
    }
  }

  get(strategyId: string): VibePosition | undefined {
    return this.positions.get(strategyId);
  }

  getAll(): VibePosition[] {
    return Array.from(this.positions.values());
  }

  getExposure(): number {
    return this.getAll().reduce((sum, p) => sum + p.sizeUsd, 0);
  }

  restore(positions: VibePosition[]): void {
    for (const pos of positions) {
      this.positions.set(pos.strategyId, { ...pos, closing: false });
    }
    this.logger.info('Positions restored', { count: positions.length });
  }
}

export class VibeTrader {
  private parser: ThesisParser;
  private exchange: HyperliquidExchange;
  private feed: PriceFeed;
  private monitor: ConditionMonitor;
  private positions: PositionManager;
  private risk: RiskManager;
  private strategies: Map<string, Strategy> = new Map();
  private handlers: Set<VibeEventHandler> = new Set();
  private activatedIds: Set<string> = new Set();
  private executeMutex: Mutex;
  private circuit: CircuitBreaker;
  private logger: Logger;
  private statePath: string | null;
  private maxStrategies: number;
  private metrics: Metrics;
  private running = false;
  private shuttingDown = false;

  constructor(config: VibeTraderConfig) {
    this.logger = config.logger ?? createConsoleLogger('VibeTrader');
    this.statePath = config.statePath ?? null;
    this.maxStrategies = config.maxStrategies ?? MAX_STRATEGIES_DEFAULT;
    this.executeMutex = new Mutex();
    this.metrics = createMetrics();
    this.circuit = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60000 }, this.logger);

    this.parser = new ThesisParser({
      apiKey: config.anthropicApiKey,
      logger: this.logger,
    });

    this.exchange = new HyperliquidExchange({
      wallet: config.wallet,
      network: config.network || 'testnet',
    });

    this.feed = new PriceFeed({
      exchange: this.exchange,
      pollMs: config.pricePollMs ?? 1000,
      logger: this.logger,
    });

    this.monitor = new ConditionMonitor({
      feed: this.feed,
      logger: this.logger,
    });

    this.risk = new RiskManager(config.riskLimits, this.logger);

    this.positions = new PositionManager(
      this.feed,
      this.exchange,
      (e) => this.handlePositionEvent(e),
      this.logger
    );
  }

  private handlePositionEvent(event: VibeEvent): void {
    this.emit(event);
    if (event.type === 'strategy_closed' && event.data?.pnl !== undefined) {
      this.risk.recordPnl(event.data.pnl as number);
      this.metrics.strategiesClosed++;
    }
    if (event.type === 'stop_loss') {
      this.metrics.stopLossTriggered++;
    }
    if (event.type === 'take_profit') {
      this.metrics.takeProfitTriggered++;
    }
    this.persistState();
  }

  async init(): Promise<void> {
    if (this.running) return;
    this.logger.info('Initializing VibeTrader');

    await this.exchange.init();
    await this.loadState();
    await this.feed.start();

    this.running = true;
    this.logger.info('VibeTrader initialized');
  }

  async shutdown(closePositions = false): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.logger.info('Shutting down VibeTrader', { closePositions });

    this.monitor.unwatchAll();

    if (closePositions) {
      await this.positions.closeAll('shutdown');
    }

    this.feed.stop();
    await this.persistState();
    this.running = false;
    this.shuttingDown = false;
    this.logger.info('VibeTrader shutdown complete');
  }

  onEvent(handler: VibeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: VibeEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        this.logger.error('Event handler error', {
          type: event.type,
          strategyId: event.strategyId,
          error: e instanceof Error ? e.message : String(e),
        });
        this.emit({
          type: 'error',
          strategyId: event.strategyId,
          timestamp: Date.now(),
          data: { originalEvent: event.type, error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
  }

  async submitThesis(thesis: string): Promise<Strategy> {
    if (this.shuttingDown) {
      throw new ValidationError('Trader is shutting down');
    }

    const strategy = await this.circuit.execute(
      () => this.parser.parse(thesis),
      'parse_thesis'
    );

    this.pruneOldStrategies();
    this.strategies.set(strategy.id, strategy);
    this.metrics.strategiesCreated++;

    this.emit({
      type: 'strategy_created',
      strategyId: strategy.id,
      timestamp: Date.now(),
      data: { thesis, asset: strategy.asset, direction: strategy.direction },
    });

    await this.persistState();
    this.logger.info('Strategy created', { id: strategy.id, asset: strategy.asset });
    return strategy;
  }

  checkRisk(strategyId: string): { allowed: boolean; reason?: string } {
    const s = this.strategies.get(strategyId);
    if (!s) return { allowed: false, reason: 'Strategy not found' };
    return this.risk.check(s, this.positions.getExposure(), this.positions.getAll().length);
  }

  activate(strategyId: string): void {
    if (this.shuttingDown) {
      throw new ValidationError('Trader is shutting down');
    }

    const s = this.strategies.get(strategyId);
    if (!s) throw new ValidationError(`Strategy not found: ${strategyId}`);
    if (s.status !== 'pending') throw new ValidationError(`Strategy not pending: ${s.status}`);

    if (this.activatedIds.has(strategyId)) {
      this.logger.warn('Strategy already activated', { strategyId });
      return;
    }

    const check = this.risk.check(s, this.positions.getExposure(), this.positions.getAll().length);
    if (!check.allowed) throw new ValidationError(`Risk check failed: ${check.reason}`);

    this.activatedIds.add(strategyId);

    this.monitor.watch(s, async (strategy) => {
      await this.onTrigger(strategy);
    });

    this.logger.info('Strategy activated', { strategyId, trigger: s.trigger });
  }

  private async onTrigger(strategy: Strategy): Promise<void> {
    const release = await this.executeMutex.acquire();
    try {
      const s = this.strategies.get(strategy.id);
      if (!s || s.status !== 'pending') {
        this.logger.warn('Strategy not executable', { strategyId: strategy.id, status: s?.status });
        return;
      }

      const recheck = this.risk.check(strategy, this.positions.getExposure(), this.positions.getAll().length);
      if (!recheck.allowed) {
        this.failStrategy(strategy, recheck.reason!);
        return;
      }

      strategy.status = 'triggered';
      this.emit({ type: 'strategy_triggered', strategyId: strategy.id, timestamp: Date.now() });

      const result = await this.execute(strategy);
      if (result.success) {
        strategy.status = 'active';
        strategy.activatedAt = Date.now();
        await this.positions.open(strategy, result.fillPrice!, result.orderId);
        this.metrics.strategiesActivated++;
        this.emit({
          type: 'strategy_activated',
          strategyId: strategy.id,
          timestamp: Date.now(),
          data: { fillPrice: result.fillPrice, orderId: result.orderId },
        });
      } else {
        this.failStrategy(strategy, result.error!);
      }

      await this.persistState();
    } finally {
      release();
    }
  }

  private failStrategy(strategy: Strategy, error: string): void {
    strategy.status = 'failed';
    strategy.errorMessage = error;
    this.metrics.strategiesFailed++;
    this.emit({
      type: 'strategy_failed',
      strategyId: strategy.id,
      timestamp: Date.now(),
      data: { error },
    });
    this.logger.error('Strategy failed', { strategyId: strategy.id, error });
  }

  private async execute(strategy: Strategy): Promise<ExecutionResult> {
    try {
      await this.exchange.setLeverage(strategy.asset, strategy.leverage);

      const price = await this.feed.getPrice(strategy.asset);
      if (!price) {
        this.metrics.ordersFailed++;
        return { success: false, error: `No price for ${strategy.asset}` };
      }

      const size = strategy.sizeUsd / price;
      this.metrics.ordersPlaced++;

      const result = await withRetry(
        () => this.exchange.marketOrder(strategy.asset, strategy.direction === 'long', size, 50),
        'market_order',
        { maxAttempts: 3, timeoutMs: 30000 },
        this.logger
      );

      if (result.status === 'ok' && result.response?.data?.statuses?.[0]?.filled) {
        const fill = result.response.data.statuses[0].filled;
        this.metrics.ordersFilled++;
        return {
          success: true,
          orderId: fill.oid,
          fillPrice: parseFloat(fill.avgPx),
          fillSize: parseFloat(fill.totalSz),
        };
      }

      this.metrics.ordersFailed++;
      return {
        success: false,
        error: result.response?.data?.statuses?.[0]?.error || result.error || 'Unknown error',
      };
    } catch (e) {
      this.metrics.ordersFailed++;
      this.metrics.apiErrors++;
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  cancel(strategyId: string): void {
    const s = this.strategies.get(strategyId);
    if (!s) return;

    this.monitor.unwatch(strategyId);
    this.activatedIds.delete(strategyId);
    s.status = 'expired';
    this.logger.info('Strategy cancelled', { strategyId });
    this.persistState();
  }

  async closePosition(strategyId: string): Promise<void> {
    await this.positions.close(strategyId, 'manual');
    const s = this.strategies.get(strategyId);
    if (s) {
      s.status = 'closed';
      s.closedAt = Date.now();
    }
    this.activatedIds.delete(strategyId);
    await this.persistState();
  }

  private pruneOldStrategies(): void {
    if (this.strategies.size < this.maxStrategies) return;

    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, s] of this.strategies) {
      if (s.status === 'pending' || s.status === 'active' || s.status === 'triggered') continue;
      if (now - s.createdAt > STALE_STRATEGY_MS) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.strategies.delete(id);
      this.activatedIds.delete(id);
    }

    if (toDelete.length > 0) {
      this.logger.info('Pruned old strategies', { count: toDelete.length });
    }
  }

  private async persistState(): Promise<void> {
    if (!this.statePath) return;

    const state: PersistedState = {
      version: STATE_VERSION,
      strategies: Array.from(this.strategies.values()),
      positions: this.positions.getAll(),
      dailyPnl: this.risk.getDailyPnl(),
      dailyResetDate: this.risk.getDailyResetDate(),
      lastUpdated: Date.now(),
    };

    try {
      const dir = path.dirname(this.statePath);
      await fs.mkdir(dir, { recursive: true });
      const tempPath = `${this.statePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
      await fs.rename(tempPath, this.statePath);
    } catch (e) {
      this.logger.error('Failed to persist state', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private async loadState(): Promise<void> {
    if (!this.statePath) return;

    try {
      const data = await fs.readFile(this.statePath, 'utf-8');
      const state: PersistedState = JSON.parse(data);

      if (state.version !== STATE_VERSION) {
        this.logger.warn('State version mismatch, ignoring', { stored: state.version, current: STATE_VERSION });
        return;
      }

      for (const s of state.strategies) {
        this.strategies.set(s.id, s);
        if (s.status === 'pending' && this.monitor.isWatching(s.id)) {
          this.activatedIds.add(s.id);
        }
      }

      this.positions.restore(state.positions);
      this.risk.restore(state.dailyPnl, state.dailyResetDate);

      this.logger.info('State loaded', {
        strategies: state.strategies.length,
        positions: state.positions.length,
        dailyPnl: state.dailyPnl,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to load state', { error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  getStrategy(id: string): Strategy | undefined { return this.strategies.get(id); }
  getAllStrategies(): Strategy[] { return Array.from(this.strategies.values()); }
  getPosition(strategyId: string): VibePosition | undefined { return this.positions.get(strategyId); }
  getAllPositions(): VibePosition[] { return this.positions.getAll(); }
  async getPrice(asset: string): Promise<number> { return this.feed.getPrice(asset); }
  async getAccountState() { return this.exchange.getAccountState(); }
  getRiskLimits(): RiskLimits { return this.risk.getLimits(); }
  getDailyPnl(): number { return this.risk.getDailyPnl(); }
  getMetrics(): Metrics { return { ...this.metrics }; }

  isHealthy(): boolean {
    return this.running && !this.shuttingDown && this.feed.isHealthy();
  }

  getHealth(): { healthy: boolean; feed: ReturnType<PriceFeed['getStats']>; circuit: string } {
    return {
      healthy: this.isHealthy(),
      feed: this.feed.getStats(),
      circuit: this.circuit.getState(),
    };
  }
}
