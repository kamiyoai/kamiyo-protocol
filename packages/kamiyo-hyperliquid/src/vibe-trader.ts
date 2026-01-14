import { Wallet } from 'ethers';
import { HyperliquidExchange } from './exchange';
import { ThesisParser } from './vibe-parser';
import { PriceFeed, ConditionMonitor } from './vibe-monitor';
import {
  Strategy, VibePosition, VibeEvent, VibeEventHandler,
  RiskLimits, DEFAULT_RISK_LIMITS, ExecutionResult
} from './vibe-types';

export interface VibeTraderConfig {
  wallet: Wallet;
  anthropicApiKey?: string;
  network?: 'mainnet' | 'testnet';
  pricePollMs?: number;
  riskLimits?: Partial<RiskLimits>;
}

class RiskManager {
  private limits: RiskLimits;
  private dailyPnl = 0;
  private dailyResetTime = 0;

  constructor(limits: Partial<RiskLimits> = {}) {
    this.limits = { ...DEFAULT_RISK_LIMITS, ...limits };
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
  }

  getLimits(): RiskLimits { return { ...this.limits }; }
  getDailyPnl(): number { return this.dailyPnl; }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    if (now - this.dailyResetTime > 86400000) {
      this.dailyPnl = 0;
      this.dailyResetTime = now;
    }
  }
}

class PositionManager {
  private feed: PriceFeed;
  private exchange: HyperliquidExchange;
  private positions: Map<string, VibePosition> = new Map();
  private unsubscribers: Map<string, () => void> = new Map();
  private onEvent: (event: VibeEvent) => void;

  constructor(feed: PriceFeed, exchange: HyperliquidExchange, onEvent: (event: VibeEvent) => void) {
    this.feed = feed;
    this.exchange = exchange;
    this.onEvent = onEvent;
  }

  async open(strategy: Strategy, entryPrice: number): Promise<VibePosition> {
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
    };
    this.positions.set(strategy.id, position);
    this.monitor(strategy);
    return position;
  }

  private monitor(strategy: Strategy): void {
    const pos = this.positions.get(strategy.id);
    if (!pos) return;

    const unsubscribe = this.feed.subscribe(pos.asset, async (price) => {
      this.update(strategy.id, price);
      const p = this.positions.get(strategy.id);
      if (!p) return;

      if (strategy.risk.stopLossPercent !== undefined && p.unrealizedPnlPercent <= strategy.risk.stopLossPercent) {
        this.onEvent({ type: 'stop_loss', strategyId: strategy.id, timestamp: Date.now(), data: { pnl: p.unrealizedPnlPercent } });
        await this.close(strategy.id, 'stop_loss');
        return;
      }
      if (strategy.risk.takeProfitPercent !== undefined && p.unrealizedPnlPercent >= strategy.risk.takeProfitPercent) {
        this.onEvent({ type: 'take_profit', strategyId: strategy.id, timestamp: Date.now(), data: { pnl: p.unrealizedPnlPercent } });
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
    const pos = this.positions.get(strategyId);
    if (!pos) return 0;
    this.unsubscribers.get(strategyId)?.();
    this.unsubscribers.delete(strategyId);
    await this.exchange.closePosition(pos.asset, 100);
    const pnl = pos.unrealizedPnl;
    this.onEvent({ type: 'strategy_closed', strategyId, timestamp: Date.now(), data: { reason, pnl } });
    this.positions.delete(strategyId);
    return pnl;
  }

  get(strategyId: string): VibePosition | undefined { return this.positions.get(strategyId); }
  getAll(): VibePosition[] { return Array.from(this.positions.values()); }
  getExposure(): number { return this.getAll().reduce((sum, p) => sum + p.sizeUsd, 0); }
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
  private pollMs: number;

  constructor(config: VibeTraderConfig) {
    this.parser = new ThesisParser(config.anthropicApiKey);
    this.exchange = new HyperliquidExchange({
      wallet: config.wallet,
      network: config.network || 'testnet',
    });
    this.feed = new PriceFeed(this.exchange);
    this.monitor = new ConditionMonitor(this.feed);
    this.risk = new RiskManager(config.riskLimits);
    this.positions = new PositionManager(this.feed, this.exchange, (e) => {
      this.emit(e);
      if (e.type === 'strategy_closed' && e.data?.pnl !== undefined) {
        this.risk.recordPnl(e.data.pnl as number);
      }
    });
    this.pollMs = config.pricePollMs || 1000;
  }

  async init(): Promise<void> {
    await this.exchange.init();
    await this.feed.start(this.pollMs);
  }

  async shutdown(): Promise<void> {
    this.feed.stop();
  }

  onEvent(handler: VibeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: VibeEvent): void {
    this.handlers.forEach(h => { try { h(event); } catch {} });
  }

  async submitThesis(thesis: string): Promise<Strategy> {
    const strategy = await this.parser.parse(thesis);
    this.strategies.set(strategy.id, strategy);
    this.emit({ type: 'strategy_created', strategyId: strategy.id, timestamp: Date.now(), data: { thesis, asset: strategy.asset, direction: strategy.direction } });
    return strategy;
  }

  checkRisk(strategyId: string): { allowed: boolean; reason?: string } {
    const s = this.strategies.get(strategyId);
    if (!s) return { allowed: false, reason: 'Strategy not found' };
    return this.risk.check(s, this.positions.getExposure(), this.positions.getAll().length);
  }

  activate(strategyId: string): void {
    const s = this.strategies.get(strategyId);
    if (!s) throw new Error(`Strategy not found: ${strategyId}`);
    if (s.status !== 'pending') throw new Error(`Strategy not pending: ${s.status}`);

    const check = this.risk.check(s, this.positions.getExposure(), this.positions.getAll().length);
    if (!check.allowed) throw new Error(`Risk check failed: ${check.reason}`);

    this.monitor.watch(s, async (strategy) => {
      const recheck = this.risk.check(strategy, this.positions.getExposure(), this.positions.getAll().length);
      if (!recheck.allowed) {
        strategy.status = 'failed';
        this.emit({ type: 'strategy_failed', strategyId: strategy.id, timestamp: Date.now(), data: { error: recheck.reason } });
        return;
      }

      strategy.status = 'triggered';
      this.emit({ type: 'strategy_triggered', strategyId: strategy.id, timestamp: Date.now() });

      const result = await this.execute(strategy);
      if (result.success) {
        strategy.status = 'active';
        await this.positions.open(strategy, result.fillPrice!);
        this.emit({ type: 'strategy_activated', strategyId: strategy.id, timestamp: Date.now(), data: { fillPrice: result.fillPrice } });
      } else {
        strategy.status = 'failed';
        this.emit({ type: 'strategy_failed', strategyId: strategy.id, timestamp: Date.now(), data: { error: result.error } });
      }
    });
  }

  private async execute(strategy: Strategy): Promise<ExecutionResult> {
    try {
      await this.exchange.setLeverage(strategy.asset, strategy.leverage);
      const price = await this.feed.getPrice(strategy.asset);
      if (!price) return { success: false, error: `No price for ${strategy.asset}` };

      const size = strategy.sizeUsd / price;
      const result = await this.exchange.marketOrder(strategy.asset, strategy.direction === 'long', size, 50);

      if (result.status === 'ok' && result.response?.data?.statuses?.[0]?.filled) {
        const fill = result.response.data.statuses[0].filled;
        return { success: true, orderId: fill.oid, fillPrice: parseFloat(fill.avgPx), fillSize: parseFloat(fill.totalSz) };
      }
      return { success: false, error: result.response?.data?.statuses?.[0]?.error || result.error || 'Unknown error' };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  cancel(strategyId: string): void {
    const s = this.strategies.get(strategyId);
    if (!s) return;
    this.monitor.unwatch(strategyId);
    s.status = 'expired';
  }

  async closePosition(strategyId: string): Promise<void> {
    await this.positions.close(strategyId, 'manual');
    const s = this.strategies.get(strategyId);
    if (s) s.status = 'closed';
  }

  getStrategy(id: string): Strategy | undefined { return this.strategies.get(id); }
  getAllStrategies(): Strategy[] { return Array.from(this.strategies.values()); }
  getPosition(strategyId: string): VibePosition | undefined { return this.positions.get(strategyId); }
  getAllPositions(): VibePosition[] { return this.positions.getAll(); }
  async getPrice(asset: string): Promise<number> { return this.feed.getPrice(asset); }
  async getAccountState() { return this.exchange.getAccountState(); }
  getRiskLimits(): RiskLimits { return this.risk.getLimits(); }
  getDailyPnl(): number { return this.risk.getDailyPnl(); }
}
