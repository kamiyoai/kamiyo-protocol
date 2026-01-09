import { Escrow, ProtocolMetrics, Agent, Oracle, DisputeResolution } from './types';
import { log } from './logger';

export class MetricsCollector {
  private escrows: Escrow[] = [];
  private resolutions: DisputeResolution[] = [];

  recordEscrow(escrow: Escrow): void {
    this.escrows.push(escrow);
  }

  recordResolution(resolution: DisputeResolution): void {
    this.resolutions.push(resolution);
  }

  compute(): ProtocolMetrics {
    const total = this.escrows.length;
    const active = this.escrows.filter(e => e.status === 'active').length;
    const released = this.escrows.filter(e => e.status === 'released').length;
    const disputed = this.escrows.filter(e => e.status === 'disputed').length;
    const resolved = this.escrows.filter(e => e.status === 'resolved').length;

    const volume = this.escrows.reduce((sum, e) => sum + e.amount, 0);
    const refunds = this.resolutions.reduce((sum, r) => sum + r.consumerRefund, 0);

    const qualityScores = this.escrows
      .filter(e => e.assessment)
      .map(e => e.assessment!.adjustedScore);
    const avgQuality = qualityScores.length
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;

    const disputeRate = total ? (disputed + resolved) / total : 0;

    const totalVotes = this.resolutions.flatMap(r => r.votes);
    const accurateVotes = totalVotes.filter(v => {
      const resolution = this.resolutions.find(r => r.votes.includes(v));
      if (!resolution) return false;
      return Math.abs(v.score - resolution.medianScore) <= 20;
    });
    const oracleAccuracy = totalVotes.length
      ? accurateVotes.length / totalVotes.length
      : 1;

    return {
      totalEscrows: total,
      activeEscrows: active,
      releasedEscrows: released,
      disputedEscrows: disputed,
      resolvedEscrows: resolved,
      totalVolume: volume,
      totalRefunds: refunds,
      averageQuality: avgQuality,
      disputeRate,
      oracleAccuracy,
    };
  }

  async printSummary(agents: Agent[], oracles: Oracle[]): Promise<void> {
    const m = this.compute();

    await log.header('PROTOCOL METRICS');

    console.log();
    log.metric('agents registered', agents.length.toString());
    log.metric('oracles active', oracles.filter(o => o.violations < 3).length.toString());
    console.log();

    log.metric('total escrows', m.totalEscrows.toString());
    log.metric('volume', `${m.totalVolume.toFixed(4)} SOL`);
    log.metric('avg quality', `${m.averageQuality.toFixed(1)}%`);
    console.log();

    log.metric('released', m.releasedEscrows.toString(), 'green');
    log.metric('disputed', (m.disputedEscrows + m.resolvedEscrows).toString(), 'yellow');
    log.metric('resolved', m.resolvedEscrows.toString(), 'cyan');
    console.log();

    log.metric('dispute rate', `${(m.disputeRate * 100).toFixed(1)}%`);
    log.metric('oracle accuracy', `${(m.oracleAccuracy * 100).toFixed(1)}%`);
    log.metric('total refunds', `${m.totalRefunds.toFixed(4)} SOL`);
    console.log();

    const blacklisted = agents.filter(a => a.isBlacklisted);
    if (blacklisted.length) {
      log.metric('blacklisted', blacklisted.map(a => a.name).join(', '), 'red');
    }

    const violators = oracles.filter(o => o.violations > 0);
    if (violators.length) {
      log.metric('oracle violations', violators.map(o => `${o.id}(${o.violations})`).join(', '), 'yellow');
    }
  }

  async printLeaderboard(agents: Agent[]): Promise<void> {
    await log.step('Agent Leaderboard');

    const sorted = [...agents]
      .filter(a => !a.isBlacklisted)
      .sort((a, b) => b.shield.successRate() - a.shield.successRate());

    const headers = ['rank', 'agent', 'success', 'disputes', 'stake'];
    const rows = sorted.map((a, i) => [
      `#${i + 1}`,
      a.name,
      `${a.shield.successRate()}%`,
      a.stats.disputesLost.toString(),
      `${a.stake} SOL`,
    ]);

    log.table(headers, rows);
  }
}
