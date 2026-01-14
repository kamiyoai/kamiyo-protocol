/**
 * Price feed and trigger monitoring with production resilience.
 */

import { Strategy, Trigger, PriceTrigger, isValidAsset, ValidationError } from './vibe-types';
import { HyperliquidExchange } from './exchange';
import { withRetry, Logger, nullLogger } from './vibe-utils';

export interface PriceFeedConfig {
  exchange: HyperliquidExchange;
  pollMs?: number;
  maxRetries?: number;
  logger?: Logger;
}

export class PriceFeed {
  private exchange: HyperliquidExchange;
  private prices: Map<string, number> = new Map();
  private subscribers: Map<string, Set<(price: number) => void>> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pollMs: number;
  private maxRetries: number;
  private logger: Logger;
  private lastUpdate = 0;
  private consecutiveFailures = 0;
  private running = false;

  constructor(config: PriceFeedConfig) {
    this.exchange = config.exchange;
    this.pollMs = config.pollMs ?? 1000;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? nullLogger;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.poll();
    this.pollInterval = setInterval(() => this.poll(), this.pollMs);
    this.logger.info('Price feed started', { pollMs: this.pollMs });
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.running = false;
    this.logger.info('Price feed stopped');
  }

  private async poll(): Promise<void> {
    try {
      const mids = await withRetry(
        () => this.exchange.getAllMids(),
        'price_poll',
        { maxAttempts: this.maxRetries, timeoutMs: 10000 },
        this.logger
      );

      for (const [asset, price] of Object.entries(mids)) {
        const numPrice = parseFloat(price as string);
        if (isNaN(numPrice) || numPrice <= 0) continue;

        const oldPrice = this.prices.get(asset);
        this.prices.set(asset, numPrice);

        if (oldPrice !== numPrice) {
          this.notifySubscribers(asset, numPrice);
        }
      }

      this.lastUpdate = Date.now();
      this.consecutiveFailures = 0;
    } catch (e) {
      this.consecutiveFailures++;
      this.logger.error('Price poll failed', {
        error: e instanceof Error ? e.message : String(e),
        consecutiveFailures: this.consecutiveFailures,
      });
    }
  }

  private notifySubscribers(asset: string, price: number): void {
    const subs = this.subscribers.get(asset);
    if (!subs) return;

    for (const cb of subs) {
      try {
        cb(price);
      } catch (e) {
        this.logger.error('Subscriber callback error', {
          asset,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  async getPrice(asset: string): Promise<number> {
    const price = this.prices.get(asset);
    if (price === undefined) {
      if (!isValidAsset(asset)) {
        throw new ValidationError(`Unsupported asset: ${asset}`);
      }
      throw new Error(`No price available for ${asset}`);
    }
    return price;
  }

  hasPrice(asset: string): boolean {
    return this.prices.has(asset);
  }

  subscribe(asset: string, callback: (price: number) => void): () => void {
    if (!this.subscribers.has(asset)) {
      this.subscribers.set(asset, new Set());
    }
    this.subscribers.get(asset)!.add(callback);
    return () => this.subscribers.get(asset)?.delete(callback);
  }

  isHealthy(): boolean {
    if (!this.running) return false;
    if (this.consecutiveFailures >= 3) return false;
    if (Date.now() - this.lastUpdate > this.pollMs * 5) return false;
    return true;
  }

  getStats(): { lastUpdate: number; assetCount: number; failures: number } {
    return {
      lastUpdate: this.lastUpdate,
      assetCount: this.prices.size,
      failures: this.consecutiveFailures,
    };
  }
}

export interface ConditionMonitorConfig {
  feed: PriceFeed;
  logger?: Logger;
}

export class ConditionMonitor {
  private feed: PriceFeed;
  private logger: Logger;
  private strategies: Map<string, Strategy> = new Map();
  private previousPrices: Map<string, number> = new Map();
  private subscriptions: Map<string, () => void> = new Map();

  constructor(config: ConditionMonitorConfig) {
    this.feed = config.feed;
    this.logger = config.logger ?? nullLogger;
  }

  watch(strategy: Strategy, onTrigger: (strategy: Strategy) => void): void {
    if (this.strategies.has(strategy.id)) {
      this.logger.warn('Strategy already being watched', { strategyId: strategy.id });
      return;
    }

    this.strategies.set(strategy.id, strategy);

    if (!strategy.trigger || Object.keys(strategy.trigger).length === 0) {
      this.logger.info('Immediate execution (no trigger)', { strategyId: strategy.id });
      setImmediate(() => {
        this.strategies.delete(strategy.id);
        onTrigger(strategy);
      });
      return;
    }

    const assets = this.extractAssets(strategy.trigger);
    this.logger.info('Watching strategy', {
      strategyId: strategy.id,
      assets,
      trigger: strategy.trigger,
    });

    for (const asset of assets) {
      const subKey = `${strategy.id}:${asset}`;
      const unsubscribe = this.feed.subscribe(asset, (price) => {
        this.onPriceUpdate(strategy, asset, price, onTrigger);
      });
      this.subscriptions.set(subKey, unsubscribe);
    }
  }

  private onPriceUpdate(
    strategy: Strategy,
    asset: string,
    price: number,
    onTrigger: (strategy: Strategy) => void
  ): void {
    if (!this.strategies.has(strategy.id)) return;

    const prevKey = `${strategy.id}:${asset}`;
    const prev = this.previousPrices.get(prevKey) ?? price;

    if (this.checkTrigger(strategy.trigger, asset, price, prev)) {
      this.logger.info('Trigger condition met', {
        strategyId: strategy.id,
        asset,
        price,
        prev,
      });
      this.unwatch(strategy.id);
      onTrigger(strategy);
    }

    this.previousPrices.set(prevKey, price);
  }

  unwatch(strategyId: string): void {
    if (!this.strategies.has(strategyId)) return;

    this.strategies.delete(strategyId);

    for (const [key, unsubscribe] of this.subscriptions) {
      if (key.startsWith(`${strategyId}:`)) {
        unsubscribe();
        this.subscriptions.delete(key);
      }
    }

    for (const key of this.previousPrices.keys()) {
      if (key.startsWith(`${strategyId}:`)) {
        this.previousPrices.delete(key);
      }
    }

    this.logger.debug('Unwatched strategy', { strategyId });
  }

  unwatchAll(): void {
    for (const [, unsubscribe] of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions.clear();
    this.strategies.clear();
    this.previousPrices.clear();
  }

  isWatching(strategyId: string): boolean {
    return this.strategies.has(strategyId);
  }

  getWatchedCount(): number {
    return this.strategies.size;
  }

  private extractAssets(trigger: Trigger): string[] {
    const assets: string[] = [];
    if (trigger.price) {
      if (!isValidAsset(trigger.price.asset)) {
        this.logger.warn('Invalid trigger asset', { asset: trigger.price.asset });
      } else {
        assets.push(trigger.price.asset);
      }
    }
    if (trigger.and) {
      trigger.and.forEach(t => assets.push(...this.extractAssets(t)));
    }
    if (trigger.or) {
      trigger.or.forEach(t => assets.push(...this.extractAssets(t)));
    }
    return [...new Set(assets)];
  }

  private checkTrigger(trigger: Trigger, asset: string, current: number, prev: number): boolean {
    if (trigger.price && trigger.price.asset === asset) {
      return this.checkPriceTrigger(trigger.price, current, prev);
    }
    if (trigger.and) {
      return trigger.and.every(t => this.checkTrigger(t, asset, current, prev));
    }
    if (trigger.or) {
      return trigger.or.some(t => this.checkTrigger(t, asset, current, prev));
    }
    return false;
  }

  private checkPriceTrigger(t: PriceTrigger, current: number, prev: number): boolean {
    switch (t.operator) {
      case '>': return current > t.price;
      case '<': return current < t.price;
      case '>=': return current >= t.price;
      case '<=': return current <= t.price;
      case 'crosses_above': return prev < t.price && current >= t.price;
      case 'crosses_below': return prev > t.price && current <= t.price;
      default: return false;
    }
  }
}
