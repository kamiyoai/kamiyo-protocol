import type { IAgentRuntime } from '../types';
import type { EscrowRiskScore, EscrowSnapshot } from './riskScorer';
import { RiskScorer } from './riskScorer';
import { createLogger } from '../lib/logger';

const log = createLogger('alert-service');

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'high_risk_escrow'
  | 'suspicious_pattern'
  | 'rapid_disputes'
  | 'large_amount'
  | 'new_account_activity'
  | 'coordinated_activity';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  escrowPda?: string;
  relatedPubkeys: string[];
  metadata: Record<string, unknown>;
  timestamp: number;
  acknowledged: boolean;
}

export interface AlertHandler {
  (alert: Alert): void | Promise<void>;
}

export interface AlertServiceConfig {
  criticalThreshold: number;
  rapidDisputeWindow: number;
  rapidDisputeCount: number;
  largeAmountThreshold: number;
  newAccountDays: number;
}

const DEFAULT_CONFIG: AlertServiceConfig = {
  criticalThreshold: 80,
  rapidDisputeWindow: 3600, // 1 hour
  rapidDisputeCount: 3,
  largeAmountThreshold: 10, // SOL
  newAccountDays: 7,
};

export class AlertService {
  private runtime: IAgentRuntime;
  private riskScorer: RiskScorer;
  private config: AlertServiceConfig;
  private alerts: Map<string, Alert> = new Map();
  private handlers: AlertHandler[] = [];
  private recentDisputes: Map<string, number[]> = new Map(); // pubkey -> timestamps
  private alertCounter = 0;

  constructor(runtime: IAgentRuntime, config: Partial<AlertServiceConfig> = {}) {
    this.runtime = runtime;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.riskScorer = new RiskScorer(runtime);
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Analyze an escrow for alert conditions
   */
  async analyzeEscrow(escrow: EscrowSnapshot): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const riskScore = await this.riskScorer.scoreEscrow(escrow);

    // Check for high-risk escrow
    if (riskScore.riskScore >= this.config.criticalThreshold) {
      alerts.push(this.createAlert({
        type: 'high_risk_escrow',
        severity: 'critical',
        title: `Critical risk escrow detected`,
        description: `Escrow ${escrow.pda.slice(0, 8)} has risk score ${riskScore.riskScore}/100`,
        escrowPda: escrow.pda,
        relatedPubkeys: [escrow.agent, escrow.provider],
        metadata: {
          riskScore: riskScore.riskScore,
          factors: riskScore.factors,
        },
      }));
    }

    // Check for large amount
    const amountSol = escrow.amount / 1e9;
    if (amountSol >= this.config.largeAmountThreshold) {
      alerts.push(this.createAlert({
        type: 'large_amount',
        severity: amountSol >= this.config.largeAmountThreshold * 5 ? 'critical' : 'warning',
        title: `Large escrow detected`,
        description: `${amountSol.toFixed(2)} SOL escrow between ${escrow.agent.slice(0, 8)} and ${escrow.provider.slice(0, 8)}`,
        escrowPda: escrow.pda,
        relatedPubkeys: [escrow.agent, escrow.provider],
        metadata: { amount: amountSol },
      }));
    }

    // Emit alerts
    for (const alert of alerts) {
      await this.emitAlert(alert);
    }

    return alerts;
  }

  /**
   * Record a dispute and check for rapid dispute patterns
   */
  async recordDispute(
    escrowPda: string,
    agentPubkey: string,
    providerPubkey: string
  ): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = Date.now() / 1000;
    const windowStart = now - this.config.rapidDisputeWindow;

    // Track disputes by agent
    const agentDisputes = this.recentDisputes.get(agentPubkey) || [];
    agentDisputes.push(now);
    const recentAgentDisputes = agentDisputes.filter((t) => t > windowStart);
    this.recentDisputes.set(agentPubkey, recentAgentDisputes);

    if (recentAgentDisputes.length >= this.config.rapidDisputeCount) {
      alerts.push(this.createAlert({
        type: 'rapid_disputes',
        severity: 'warning',
        title: `Rapid disputes from agent`,
        description: `Agent ${agentPubkey.slice(0, 8)} has filed ${recentAgentDisputes.length} disputes in the last hour`,
        escrowPda,
        relatedPubkeys: [agentPubkey],
        metadata: {
          disputeCount: recentAgentDisputes.length,
          windowHours: this.config.rapidDisputeWindow / 3600,
        },
      }));
    }

    // Track disputes against provider
    const providerDisputes = this.recentDisputes.get(providerPubkey) || [];
    providerDisputes.push(now);
    const recentProviderDisputes = providerDisputes.filter((t) => t > windowStart);
    this.recentDisputes.set(providerPubkey, recentProviderDisputes);

    if (recentProviderDisputes.length >= this.config.rapidDisputeCount) {
      alerts.push(this.createAlert({
        type: 'rapid_disputes',
        severity: 'warning',
        title: `Rapid disputes against provider`,
        description: `Provider ${providerPubkey.slice(0, 8)} has received ${recentProviderDisputes.length} disputes in the last hour`,
        escrowPda,
        relatedPubkeys: [providerPubkey],
        metadata: {
          disputeCount: recentProviderDisputes.length,
          windowHours: this.config.rapidDisputeWindow / 3600,
        },
      }));
    }

    // Emit alerts
    for (const alert of alerts) {
      await this.emitAlert(alert);
    }

    return alerts;
  }

  /**
   * Check for suspicious patterns across multiple escrows
   */
  async analyzeBatch(escrows: EscrowSnapshot[]): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Group by provider
    const byProvider = new Map<string, EscrowSnapshot[]>();
    for (const escrow of escrows) {
      const list = byProvider.get(escrow.provider) || [];
      list.push(escrow);
      byProvider.set(escrow.provider, list);
    }

    // Check for providers with many active escrows
    for (const [provider, providerEscrows] of byProvider.entries()) {
      if (providerEscrows.length >= 10) {
        const totalAmount = providerEscrows.reduce((sum, e) => sum + e.amount / 1e9, 0);
        alerts.push(this.createAlert({
          type: 'suspicious_pattern',
          severity: 'warning',
          title: `High escrow volume for provider`,
          description: `Provider ${provider.slice(0, 8)} has ${providerEscrows.length} active escrows totaling ${totalAmount.toFixed(2)} SOL`,
          relatedPubkeys: [provider],
          metadata: {
            escrowCount: providerEscrows.length,
            totalAmount,
          },
        }));
      }
    }

    // Check for coordinated activity (same agent-provider pairs)
    const pairs = new Map<string, number>();
    for (const escrow of escrows) {
      const pair = `${escrow.agent}:${escrow.provider}`;
      pairs.set(pair, (pairs.get(pair) || 0) + 1);
    }

    for (const [pair, count] of pairs.entries()) {
      if (count >= 3) {
        const [agent, provider] = pair.split(':');
        alerts.push(this.createAlert({
          type: 'coordinated_activity',
          severity: 'warning',
          title: `Repeated agent-provider pair`,
          description: `${count} active escrows between agent ${agent.slice(0, 8)} and provider ${provider.slice(0, 8)}`,
          relatedPubkeys: [agent, provider],
          metadata: { escrowCount: count },
        }));
      }
    }

    // Emit alerts
    for (const alert of alerts) {
      await this.emitAlert(alert);
    }

    return alerts;
  }

  /**
   * Get all unacknowledged alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter((a) => !a.acknowledged)
      .sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity] || b.timestamp - a.timestamp;
      });
  }

  /**
   * Get alerts for a specific escrow
   */
  getAlertsForEscrow(escrowPda: string): Alert[] {
    return Array.from(this.alerts.values()).filter((a) => a.escrowPda === escrowPda);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Clear old alerts
   */
  cleanup(maxAgeMs: number = 24 * 3600 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (alert.timestamp < cutoff && alert.acknowledged) {
        this.alerts.delete(id);
        removed++;
      }
    }

    // Cleanup old dispute tracking
    const windowCutoff = Date.now() / 1000 - this.config.rapidDisputeWindow * 2;
    for (const [pubkey, timestamps] of this.recentDisputes.entries()) {
      const recent = timestamps.filter((t) => t > windowCutoff);
      if (recent.length === 0) {
        this.recentDisputes.delete(pubkey);
      } else {
        this.recentDisputes.set(pubkey, recent);
      }
    }

    return removed;
  }

  private createAlert(params: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>): Alert {
    return {
      ...params,
      id: `alert-${++this.alertCounter}-${Date.now()}`,
      timestamp: Date.now(),
      acknowledged: false,
    };
  }

  private async emitAlert(alert: Alert): Promise<void> {
    // Store alert
    this.alerts.set(alert.id, alert);

    // Log it
    const context = {
      alertId: alert.id,
      type: alert.type,
      escrow: alert.escrowPda?.slice(0, 8),
    };

    if (alert.severity === 'critical') {
      log.error(alert.title, new Error(alert.description), context);
    } else if (alert.severity === 'warning') {
      log.warn(alert.title, context);
    } else {
      log.info(alert.title, context);
    }

    // Notify handlers
    for (const handler of this.handlers) {
      try {
        await handler(alert);
      } catch (err) {
        log.error('Alert handler error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

/**
 * Create alert service with webhook support
 */
export function createAlertService(
  runtime: IAgentRuntime,
  webhookUrl?: string
): AlertService {
  const service = new AlertService(runtime);

  // Add webhook handler if URL provided
  if (webhookUrl) {
    service.onAlert(async (alert) => {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
      } catch {
        // Webhook failure shouldn't crash the service
      }
    });
  }

  return service;
}
