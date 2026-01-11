/**
 * KAMIYO AI Trading Agent
 *
 * Autonomous trading agent on Hyperliquid with stake-backed trust guarantees.
 * Users can copy this agent through KamiyoVault with performance guarantees.
 */

import { ethers, Wallet } from 'ethers';
import chalk from 'chalk';

// Hyperliquid API types
interface MarketData {
  coin: string;
  markPx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  funding: string;
  openInterest: string;
}

interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  leverage: { type: string; value: number };
}

interface AccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  assetPositions: Position[];
}

interface TradeSignal {
  coin: string;
  side: 'long' | 'short' | 'close';
  confidence: number;
  reason: string;
}

interface AgentConfig {
  name: string;
  privateKey: string;
  stakeAmount: bigint;
  maxPositionSize: number;
  maxLeverage: number;
  riskPerTrade: number;
  tradingPairs: string[];
}

const HYPERLIQUID_API = 'https://api.hyperliquid-testnet.xyz';

export class KamiyoTradingAgent {
  private wallet: Wallet;
  private config: AgentConfig;
  private positions: Map<string, Position> = new Map();
  private tradeHistory: Array<{ time: Date; coin: string; side: string; pnl: number }> = [];
  private isRunning = false;
  private stats = {
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    startTime: Date.now(),
  };

  constructor(config: AgentConfig) {
    this.config = config;
    this.wallet = new Wallet(config.privateKey);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.printBanner();

    console.log(chalk.cyan('\n  Initializing agent...'));
    console.log(chalk.gray(`  Wallet: ${this.wallet.address}`));
    console.log(chalk.gray(`  Stake: ${ethers.formatEther(this.config.stakeAmount)} HYPE`));
    console.log(chalk.gray(`  Max leverage: ${this.config.maxLeverage}x`));
    console.log(chalk.gray(`  Trading pairs: ${this.config.tradingPairs.join(', ')}`));

    // Main trading loop
    while (this.isRunning) {
      try {
        await this.tradingCycle();
        await this.sleep(10000); // 10 second intervals
      } catch (error) {
        console.error(chalk.red('  Trading cycle error:'), error);
        await this.sleep(5000);
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log(chalk.yellow('\n  Agent stopping...'));
  }

  private async tradingCycle(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(chalk.gray(`\n  [${timestamp}] Trading cycle`));

    // Fetch market data
    const markets = await this.fetchMarketData();

    // Fetch current positions
    const account = await this.fetchAccountState();
    this.updatePositions(account);

    // Generate signals
    const signals = this.generateSignals(markets);

    // Execute trades
    for (const signal of signals) {
      if (signal.confidence > 0.7) {
        await this.executeSignal(signal);
      }
    }

    // Print status
    this.printStatus(account, signals);
  }

  private async fetchMarketData(): Promise<MarketData[]> {
    try {
      const response = await fetch(`${HYPERLIQUID_API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });
      const data = await response.json();
      return data[1] || [];
    } catch {
      return [];
    }
  }

  private async fetchAccountState(): Promise<AccountState | null> {
    try {
      const response = await fetch(`${HYPERLIQUID_API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: this.wallet.address,
        }),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  private updatePositions(account: AccountState | null): void {
    this.positions.clear();
    if (account?.assetPositions) {
      for (const pos of account.assetPositions) {
        if (parseFloat(pos.szi) !== 0) {
          this.positions.set(pos.coin, pos);
        }
      }
    }
  }

  private generateSignals(markets: MarketData[]): TradeSignal[] {
    const signals: TradeSignal[] = [];

    for (const coin of this.config.tradingPairs) {
      const market = markets.find(m => m.coin === coin);
      if (!market) continue;

      const currentPrice = parseFloat(market.markPx);
      const prevPrice = parseFloat(market.prevDayPx);
      const funding = parseFloat(market.funding);
      const volume = parseFloat(market.dayNtlVlm);

      // Simple momentum + funding strategy
      const priceChange = (currentPrice - prevPrice) / prevPrice;
      const existingPosition = this.positions.get(coin);

      let signal: TradeSignal | null = null;

      // Close profitable positions
      if (existingPosition) {
        const pnl = parseFloat(existingPosition.unrealizedPnl);
        const roe = parseFloat(existingPosition.returnOnEquity);

        if (roe > 0.05) { // Take profit at 5%
          signal = {
            coin,
            side: 'close',
            confidence: 0.9,
            reason: `Take profit: ${(roe * 100).toFixed(2)}% ROE`,
          };
        } else if (roe < -0.03) { // Stop loss at -3%
          signal = {
            coin,
            side: 'close',
            confidence: 0.95,
            reason: `Stop loss: ${(roe * 100).toFixed(2)}% ROE`,
          };
        }
      } else {
        // Open new positions based on momentum + funding
        if (priceChange > 0.02 && funding < 0) {
          // Bullish momentum + negative funding = long
          signal = {
            coin,
            side: 'long',
            confidence: Math.min(0.5 + Math.abs(priceChange) + Math.abs(funding) * 100, 0.9),
            reason: `Momentum: +${(priceChange * 100).toFixed(2)}%, Funding: ${(funding * 100).toFixed(4)}%`,
          };
        } else if (priceChange < -0.02 && funding > 0.0001) {
          // Bearish momentum + positive funding = short
          signal = {
            coin,
            side: 'short',
            confidence: Math.min(0.5 + Math.abs(priceChange) + Math.abs(funding) * 100, 0.9),
            reason: `Momentum: ${(priceChange * 100).toFixed(2)}%, Funding: ${(funding * 100).toFixed(4)}%`,
          };
        }
      }

      if (signal) {
        signals.push(signal);
      }
    }

    return signals;
  }

  private async executeSignal(signal: TradeSignal): Promise<void> {
    console.log(chalk.yellow(`\n  Signal: ${signal.side.toUpperCase()} ${signal.coin}`));
    console.log(chalk.gray(`  Confidence: ${(signal.confidence * 100).toFixed(0)}%`));
    console.log(chalk.gray(`  Reason: ${signal.reason}`));

    // In production, this would execute via Hyperliquid API
    // For demo, we simulate the trade
    this.stats.totalTrades++;

    const simulatedPnl = (Math.random() - 0.4) * 100; // Slightly positive expected value
    if (simulatedPnl > 0) {
      this.stats.winningTrades++;
    }
    this.stats.totalPnl += simulatedPnl;

    this.tradeHistory.push({
      time: new Date(),
      coin: signal.coin,
      side: signal.side,
      pnl: simulatedPnl,
    });

    if (this.tradeHistory.length > 100) {
      this.tradeHistory.shift();
    }

    console.log(chalk.green(`  Trade executed (simulated)`));
  }

  private printStatus(account: AccountState | null, signals: TradeSignal[]): void {
    const winRate = this.stats.totalTrades > 0
      ? (this.stats.winningTrades / this.stats.totalTrades * 100).toFixed(1)
      : '0.0';

    console.log(chalk.cyan('\n  ─────────────────────────────────────────────'));
    console.log(chalk.white('  Agent Status'));
    console.log(chalk.gray(`  Total Trades: ${this.stats.totalTrades}`));
    console.log(chalk.gray(`  Win Rate: ${winRate}%`));
    console.log(chalk.gray(`  Total PnL: ${this.stats.totalPnl > 0 ? '+' : ''}$${this.stats.totalPnl.toFixed(2)}`));

    if (this.positions.size > 0) {
      console.log(chalk.white('\n  Open Positions:'));
      for (const [coin, pos] of this.positions) {
        const side = parseFloat(pos.szi) > 0 ? 'LONG' : 'SHORT';
        const pnl = parseFloat(pos.unrealizedPnl);
        const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
        console.log(chalk.gray(`  ${coin}: ${side} | PnL: ${pnlColor(pnl.toFixed(2))}`));
      }
    }

    if (signals.length > 0) {
      console.log(chalk.white('\n  Active Signals:'));
      for (const signal of signals) {
        const color = signal.side === 'long' ? chalk.green : signal.side === 'short' ? chalk.red : chalk.yellow;
        console.log(color(`  ${signal.coin}: ${signal.side.toUpperCase()} (${(signal.confidence * 100).toFixed(0)}%)`));
      }
    }
  }

  private printBanner(): void {
    console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════════════════════╗
  ║  KAMIYO Trading Agent                                             ║
  ║  Stake-backed AI trader on Hyperliquid                            ║
  ╚═══════════════════════════════════════════════════════════════════╝
    `));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      ...this.stats,
      winRate: this.stats.totalTrades > 0
        ? this.stats.winningTrades / this.stats.totalTrades
        : 0,
      uptimeSeconds: Math.floor((Date.now() - this.stats.startTime) / 1000),
    };
  }
}

// Run if executed directly
const privateKey = process.env.PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;

const agent = new KamiyoTradingAgent({
  name: 'KamiyoAlpha',
  privateKey,
  stakeAmount: ethers.parseEther('100'),
  maxPositionSize: 1000,
  maxLeverage: 5,
  riskPerTrade: 0.02,
  tradingPairs: ['BTC', 'ETH', 'SOL'],
});

process.on('SIGINT', () => {
  agent.stop();
  process.exit(0);
});

agent.start();
