/**
 * KAMIYO Trading Dashboard
 *
 * Real-time visualization of AI agent trading activity,
 * copy positions, and trust metrics.
 */

import chalk from 'chalk';
import { ethers } from 'ethers';

interface AgentData {
  address: string;
  name: string;
  stake: bigint;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  copiers: number;
  aum: bigint; // Assets under management
}

interface PositionData {
  id: number;
  user: string;
  deposit: bigint;
  currentValue: bigint;
  returnPct: number;
  lockRemaining: number;
  status: 'active' | 'profitable' | 'at_risk';
}

interface TradeEvent {
  time: Date;
  coin: string;
  side: 'LONG' | 'SHORT' | 'CLOSE';
  size: number;
  price: number;
  pnl?: number;
}

class Dashboard {
  private agent: AgentData;
  private positions: PositionData[] = [];
  private trades: TradeEvent[] = [];
  private marketPrices: Map<string, number> = new Map();
  private isRunning = false;

  constructor() {
    // Initialize with demo data
    this.agent = {
      address: '0x1234...5678',
      name: 'KamiyoAlpha',
      stake: ethers.parseEther('500'),
      totalTrades: 247,
      winRate: 0.68,
      totalPnl: 12450.32,
      copiers: 23,
      aum: ethers.parseEther('4520'),
    };

    this.positions = [
      { id: 1, user: '0xabc...123', deposit: ethers.parseEther('100'), currentValue: ethers.parseEther('108.5'), returnPct: 8.5, lockRemaining: 86400 * 5, status: 'profitable' },
      { id: 2, user: '0xdef...456', deposit: ethers.parseEther('250'), currentValue: ethers.parseEther('245'), returnPct: -2.0, lockRemaining: 86400 * 12, status: 'active' },
      { id: 3, user: '0x789...abc', deposit: ethers.parseEther('500'), currentValue: ethers.parseEther('535'), returnPct: 7.0, lockRemaining: 86400 * 3, status: 'profitable' },
      { id: 4, user: '0xfed...321', deposit: ethers.parseEther('75'), currentValue: ethers.parseEther('71.25'), returnPct: -5.0, lockRemaining: 86400 * 20, status: 'at_risk' },
    ];

    this.trades = [
      { time: new Date(Date.now() - 60000), coin: 'BTC', side: 'LONG', size: 0.5, price: 97250, pnl: 125 },
      { time: new Date(Date.now() - 120000), coin: 'ETH', side: 'SHORT', size: 5, price: 3420, pnl: -45 },
      { time: new Date(Date.now() - 300000), coin: 'SOL', side: 'LONG', size: 100, price: 198.5, pnl: 280 },
      { time: new Date(Date.now() - 600000), coin: 'BTC', side: 'CLOSE', size: 0.3, price: 97100, pnl: 89 },
    ];

    this.marketPrices.set('BTC', 97350);
    this.marketPrices.set('ETH', 3415);
    this.marketPrices.set('SOL', 199.2);
  }

  async start(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      console.clear();
      this.render();
      await this.sleep(2000);
      this.simulateUpdates();
    }
  }

  stop(): void {
    this.isRunning = false;
  }

  private render(): void {
    this.renderHeader();
    this.renderAgentStats();
    this.renderTrustMetrics();
    this.renderPositions();
    this.renderRecentTrades();
    this.renderMarketData();
    this.renderFooter();
  }

  private renderHeader(): void {
    console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════════════════════════════════╗
  ║                                                                               ║
  ║   ${chalk.bold('KAMIYO')} ${chalk.gray('×')} ${chalk.bold('HYPERLIQUID')}    ${chalk.white('AI Agent Copy Trading Dashboard')}              ║
  ║                                                                               ║
  ╚═══════════════════════════════════════════════════════════════════════════════╝
    `));
  }

  private renderAgentStats(): void {
    const winRateColor = this.agent.winRate >= 0.6 ? chalk.green : this.agent.winRate >= 0.5 ? chalk.yellow : chalk.red;
    const pnlColor = this.agent.totalPnl >= 0 ? chalk.green : chalk.red;

    console.log(chalk.white.bold('  Agent: ') + chalk.cyan(this.agent.name) + chalk.gray(` (${this.agent.address})`));
    console.log('');
    console.log(chalk.gray('  ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐'));
    console.log(chalk.gray('  │') + chalk.white(' Stake           ') + chalk.gray('│') + chalk.white(' Win Rate        ') + chalk.gray('│') + chalk.white(' Total PnL       ') + chalk.gray('│') + chalk.white(' Copiers         ') + chalk.gray('│'));
    console.log(chalk.gray('  ├─────────────────┼─────────────────┼─────────────────┼─────────────────┤'));
    console.log(
      chalk.gray('  │ ') + chalk.yellow(this.formatEther(this.agent.stake).padEnd(15)) +
      chalk.gray(' │ ') + winRateColor((this.agent.winRate * 100).toFixed(1) + '%').padEnd(23) +
      chalk.gray(' │ ') + pnlColor(('$' + this.agent.totalPnl.toFixed(2)).padEnd(23)) +
      chalk.gray(' │ ') + chalk.white(this.agent.copiers.toString().padEnd(15)) + chalk.gray(' │')
    );
    console.log(chalk.gray('  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘'));
    console.log('');
  }

  private renderTrustMetrics(): void {
    const trustScore = Math.min(100, Math.floor(
      (this.agent.winRate * 40) +
      (Math.min(this.agent.totalTrades, 500) / 500 * 30) +
      (Number(this.agent.stake) / Number(ethers.parseEther('1000')) * 30)
    ));

    const trustBar = this.renderProgressBar(trustScore, 100, 30);
    const trustColor = trustScore >= 80 ? chalk.green : trustScore >= 60 ? chalk.yellow : chalk.red;

    console.log(chalk.white.bold('  Trust Metrics'));
    console.log('');
    console.log(chalk.gray('  Trust Score: ') + trustColor.bold(`${trustScore}/100`) + chalk.gray('  [') + trustBar + chalk.gray(']'));
    console.log('');
    console.log(chalk.gray('  Components:'));
    console.log(chalk.gray('    • Performance (40%): ') + chalk.white(`${(this.agent.winRate * 40).toFixed(0)}/40`) + chalk.gray(` (${(this.agent.winRate * 100).toFixed(0)}% win rate)`));
    console.log(chalk.gray('    • Experience (30%): ') + chalk.white(`${Math.min(30, Math.floor(this.agent.totalTrades / 500 * 30))}/30`) + chalk.gray(` (${this.agent.totalTrades} trades)`));
    console.log(chalk.gray('    • Stake (30%): ') + chalk.white(`${Math.floor(Number(this.agent.stake) / Number(ethers.parseEther('1000')) * 30)}/30`) + chalk.gray(` (${this.formatEther(this.agent.stake)} HYPE)`));
    console.log('');
  }

  private renderPositions(): void {
    console.log(chalk.white.bold('  Active Copy Positions') + chalk.gray(` (${this.positions.length} total, ${this.formatEther(this.agent.aum)} HYPE AUM)`));
    console.log('');
    console.log(chalk.gray('  ┌────┬────────────────┬────────────────┬────────────────┬──────────────┬────────────┐'));
    console.log(chalk.gray('  │ ID │ User           │ Deposit        │ Current Value  │ Return       │ Lock       │'));
    console.log(chalk.gray('  ├────┼────────────────┼────────────────┼────────────────┼──────────────┼────────────┤'));

    for (const pos of this.positions) {
      const returnColor = pos.returnPct >= 0 ? chalk.green : pos.returnPct > -5 ? chalk.yellow : chalk.red;
      const statusIcon = pos.status === 'profitable' ? chalk.green('●') : pos.status === 'at_risk' ? chalk.red('●') : chalk.yellow('●');

      console.log(
        chalk.gray('  │ ') + chalk.white(pos.id.toString().padEnd(2)) +
        chalk.gray(' │ ') + chalk.gray(pos.user.padEnd(14)) +
        chalk.gray(' │ ') + chalk.white(this.formatEther(pos.deposit).padEnd(14)) +
        chalk.gray(' │ ') + chalk.white(this.formatEther(pos.currentValue).padEnd(14)) +
        chalk.gray(' │ ') + returnColor((pos.returnPct >= 0 ? '+' : '') + pos.returnPct.toFixed(1) + '%').padEnd(20) +
        chalk.gray(' │ ') + chalk.gray(this.formatDays(pos.lockRemaining).padEnd(10)) + chalk.gray(' │')
      );
    }

    console.log(chalk.gray('  └────┴────────────────┴────────────────┴────────────────┴──────────────┴────────────┘'));
    console.log('');
  }

  private renderRecentTrades(): void {
    console.log(chalk.white.bold('  Recent Trades'));
    console.log('');

    for (const trade of this.trades.slice(0, 5)) {
      const sideColor = trade.side === 'LONG' ? chalk.green : trade.side === 'SHORT' ? chalk.red : chalk.yellow;
      const pnlColor = (trade.pnl || 0) >= 0 ? chalk.green : chalk.red;
      const timeAgo = this.formatTimeAgo(trade.time);

      console.log(
        chalk.gray('  ') + chalk.gray(timeAgo.padEnd(10)) +
        sideColor(trade.side.padEnd(6)) +
        chalk.white(trade.coin.padEnd(5)) +
        chalk.gray('Size: ') + chalk.white(trade.size.toString().padEnd(8)) +
        chalk.gray('@ $') + chalk.white(trade.price.toFixed(2).padEnd(12)) +
        (trade.pnl !== undefined ? chalk.gray('PnL: ') + pnlColor((trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2)) : '')
      );
    }
    console.log('');
  }

  private renderMarketData(): void {
    console.log(chalk.white.bold('  Market Data'));
    console.log('');

    let marketLine = chalk.gray('  ');
    for (const [coin, price] of this.marketPrices) {
      const change = (Math.random() - 0.5) * 2;
      const changeColor = change >= 0 ? chalk.green : chalk.red;
      marketLine += chalk.white(coin) + chalk.gray(': $') + chalk.white(price.toFixed(2)) + ' ' + changeColor((change >= 0 ? '+' : '') + change.toFixed(2) + '%') + chalk.gray('  │  ');
    }
    console.log(marketLine);
    console.log('');
  }

  private renderFooter(): void {
    const now = new Date().toISOString().split('T').join(' ').split('.')[0];
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────────────'));
    console.log(chalk.gray(`  Last updated: ${now} UTC  │  Press Ctrl+C to exit`));
  }

  private renderProgressBar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    const color = value / max >= 0.8 ? chalk.green : value / max >= 0.6 ? chalk.yellow : chalk.red;
    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  private formatEther(value: bigint): string {
    const formatted = ethers.formatEther(value);
    const num = parseFloat(formatted);
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toFixed(2);
  }

  private formatDays(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    return `${days}d`;
  }

  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  private simulateUpdates(): void {
    // Simulate position value changes
    for (const pos of this.positions) {
      const change = (Math.random() - 0.48) * 0.5; // Slightly positive bias
      pos.currentValue = pos.currentValue + BigInt(Math.floor(Number(pos.deposit) * change / 100));
      pos.returnPct = Number((pos.currentValue - pos.deposit) * 10000n / pos.deposit) / 100;
      pos.lockRemaining = Math.max(0, pos.lockRemaining - 2);
      pos.status = pos.returnPct >= 5 ? 'profitable' : pos.returnPct <= -3 ? 'at_risk' : 'active';
    }

    // Simulate price updates
    for (const [coin, price] of this.marketPrices) {
      const change = price * (Math.random() - 0.5) * 0.002;
      this.marketPrices.set(coin, price + change);
    }

    // Occasionally add a trade
    if (Math.random() > 0.7) {
      const coins = ['BTC', 'ETH', 'SOL'];
      const sides: Array<'LONG' | 'SHORT' | 'CLOSE'> = ['LONG', 'SHORT', 'CLOSE'];
      const coin = coins[Math.floor(Math.random() * coins.length)];
      const side = sides[Math.floor(Math.random() * sides.length)];

      this.trades.unshift({
        time: new Date(),
        coin,
        side,
        size: Math.random() * 10,
        price: this.marketPrices.get(coin) || 0,
        pnl: (Math.random() - 0.4) * 200,
      });

      if (this.trades.length > 10) {
        this.trades.pop();
      }

      this.agent.totalTrades++;
      if (Math.random() > 0.32) {
        this.agent.winningTrades++;
      }
      this.agent.winRate = this.agent.winningTrades / this.agent.totalTrades;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private agent: AgentData & { winningTrades: number } = {
    address: '0x1234...5678',
    name: 'KamiyoAlpha',
    stake: ethers.parseEther('500'),
    totalTrades: 247,
    winRate: 0.68,
    totalPnl: 12450.32,
    copiers: 23,
    aum: ethers.parseEther('4520'),
    winningTrades: 168,
  };
}

// Run dashboard
const dashboard = new Dashboard();

process.on('SIGINT', () => {
  dashboard.stop();
  process.exit(0);
});

dashboard.start();
