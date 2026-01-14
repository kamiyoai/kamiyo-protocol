import { Strategy, Trigger, PriceTrigger } from './vibe-types';
import { HyperliquidExchange } from './exchange';

export class PriceFeed {
  private exchange: HyperliquidExchange;
  private prices: Map<string, number> = new Map();
  private subscribers: Map<string, Set<(price: number) => void>> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(exchange: HyperliquidExchange) {
    this.exchange = exchange;
  }

  async start(pollMs = 1000): Promise<void> {
    if (this.pollInterval) return;
    await this.poll();
    this.pollInterval = setInterval(() => this.poll(), pollMs);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const mids = await this.exchange.getAllMids();
      for (const [asset, price] of Object.entries(mids)) {
        const numPrice = parseFloat(price);
        const oldPrice = this.prices.get(asset);
        this.prices.set(asset, numPrice);
        if (oldPrice !== numPrice) {
          this.subscribers.get(asset)?.forEach(cb => cb(numPrice));
        }
      }
    } catch (e) {
      console.error('Price poll failed:', e);
    }
  }

  async getPrice(asset: string): Promise<number> {
    return this.prices.get(asset) ?? 0;
  }

  subscribe(asset: string, callback: (price: number) => void): () => void {
    if (!this.subscribers.has(asset)) {
      this.subscribers.set(asset, new Set());
    }
    this.subscribers.get(asset)!.add(callback);
    return () => this.subscribers.get(asset)?.delete(callback);
  }
}

export class ConditionMonitor {
  private feed: PriceFeed;
  private strategies: Map<string, Strategy> = new Map();
  private previousPrices: Map<string, number> = new Map();
  private callbacks: Map<string, () => void> = new Map();

  constructor(feed: PriceFeed) {
    this.feed = feed;
  }

  watch(strategy: Strategy, onTrigger: (strategy: Strategy) => void): void {
    this.strategies.set(strategy.id, strategy);

    if (!strategy.trigger || Object.keys(strategy.trigger).length === 0) {
      onTrigger(strategy);
      return;
    }

    const assets = this.extractAssets(strategy.trigger);
    for (const asset of assets) {
      const unsubscribe = this.feed.subscribe(asset, (price) => {
        const prev = this.previousPrices.get(asset) || price;
        if (this.checkTrigger(strategy.trigger, asset, price, prev)) {
          this.unwatch(strategy.id);
          onTrigger(strategy);
        }
        this.previousPrices.set(asset, price);
      });
      this.callbacks.set(`${strategy.id}:${asset}`, unsubscribe);
    }
  }

  unwatch(strategyId: string): void {
    this.strategies.delete(strategyId);
    for (const [key, unsubscribe] of this.callbacks) {
      if (key.startsWith(strategyId)) {
        unsubscribe();
        this.callbacks.delete(key);
      }
    }
  }

  private extractAssets(trigger: Trigger): string[] {
    const assets: string[] = [];
    if (trigger.price) assets.push(trigger.price.asset);
    if (trigger.and) trigger.and.forEach(t => assets.push(...this.extractAssets(t)));
    if (trigger.or) trigger.or.forEach(t => assets.push(...this.extractAssets(t)));
    return [...new Set(assets)];
  }

  private checkTrigger(trigger: Trigger, asset: string, current: number, prev: number): boolean {
    if (trigger.price && trigger.price.asset === asset) {
      return this.checkPriceTrigger(trigger.price, current, prev);
    }
    if (trigger.and) return trigger.and.every(t => this.checkTrigger(t, asset, current, prev));
    if (trigger.or) return trigger.or.some(t => this.checkTrigger(t, asset, current, prev));
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
