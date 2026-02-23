/**
 * Alerting - webhooks for Slack, Discord, PagerDuty.
 */

import { createLogger, getMetrics, withRetry } from './index';

const log = createLogger('kyoshin:alerting');
const metrics = getMetrics();

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  component?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertingConfig {
  webhookUrl?: string;
  webhookType?: 'slack' | 'discord' | 'generic';
  serviceName?: string;
  environment?: string;
  enabled?: boolean;
}

const DEFAULT_CONFIG: AlertingConfig = {
  serviceName: 'kyoshin',
  environment: process.env.NODE_ENV || 'development',
  enabled: true,
};

export class AlertManager {
  private config: AlertingConfig;
  private recentAlerts: Map<string, number> = new Map();
  private dedupeWindowMs = 5 * 60 * 1000; // 5 minutes

  constructor(config: AlertingConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async send(alert: Alert): Promise<boolean> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      log.debug('Alert not sent (disabled or no webhook)', { title: alert.title });
      return false;
    }

    // Dedupe: don't send same alert within window
    const alertKey = `${alert.severity}:${alert.title}`;
    const lastSent = this.recentAlerts.get(alertKey);
    if (lastSent && Date.now() - lastSent < this.dedupeWindowMs) {
      log.debug('Alert deduplicated', { title: alert.title });
      metrics.incrementCounter('alerts_deduplicated');
      return false;
    }

    const fullAlert: Alert = {
      ...alert,
      timestamp: alert.timestamp || new Date().toISOString(),
    };

    try {
      const payload = this.formatPayload(fullAlert);

      await withRetry(
        async () => {
          const response = await fetch(this.config.webhookUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`Webhook returned ${response.status}`);
          }
        },
        { maxAttempts: 3, initialDelayMs: 1000 }
      );

      this.recentAlerts.set(alertKey, Date.now());
      metrics.incrementCounter('alerts_sent');
      metrics.incrementCounter(`alerts_sent_${alert.severity}`);

      log.info('Alert sent', { title: alert.title, severity: alert.severity });
      return true;
    } catch (error) {
      metrics.incrementCounter('alerts_failed');
      log.error('Failed to send alert', {
        title: alert.title,
        error: String(error),
      });
      return false;
    }
  }

  private formatPayload(alert: Alert): Record<string, unknown> {
    const severityEmoji: Record<AlertSeverity, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🔴',
      critical: '🚨',
    };

    const severityColor: Record<AlertSeverity, string> = {
      info: '#36a64f',
      warning: '#ffa500',
      error: '#ff0000',
      critical: '#8b0000',
    };

    switch (this.config.webhookType) {
      case 'slack':
        return {
          attachments: [
            {
              color: severityColor[alert.severity],
              title: `${severityEmoji[alert.severity]} ${alert.title}`,
              text: alert.message,
              fields: [
                { title: 'Service', value: this.config.serviceName, short: true },
                { title: 'Environment', value: this.config.environment, short: true },
                ...(alert.component
                  ? [{ title: 'Component', value: alert.component, short: true }]
                  : []),
              ],
              footer: 'Kyoshin Alert System',
              ts: Math.floor(new Date(alert.timestamp!).getTime() / 1000),
            },
          ],
        };

      case 'discord':
        return {
          embeds: [
            {
              title: `${severityEmoji[alert.severity]} ${alert.title}`,
              description: alert.message,
              color: parseInt(severityColor[alert.severity].slice(1), 16),
              fields: [
                { name: 'Service', value: this.config.serviceName, inline: true },
                { name: 'Environment', value: this.config.environment, inline: true },
                ...(alert.component
                  ? [{ name: 'Component', value: alert.component, inline: true }]
                  : []),
              ],
              timestamp: alert.timestamp,
              footer: { text: 'Kyoshin Alert System' },
            },
          ],
        };

      default:
        // Generic webhook format
        return {
          service: this.config.serviceName,
          environment: this.config.environment,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          component: alert.component,
          timestamp: alert.timestamp,
          metadata: alert.metadata,
        };
    }
  }

  /**
   * Clear dedupe cache (for testing).
   */
  clearDedupeCache(): void {
    this.recentAlerts.clear();
  }

  /**
   * Update webhook config at runtime.
   */
  setWebhook(url: string, type: AlertingConfig['webhookType'] = 'generic'): void {
    this.config.webhookUrl = url;
    this.config.webhookType = type;
    log.info('Alert webhook updated', { type });
  }

  /**
   * Enable/disable alerting.
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    log.info('Alerting enabled state changed', { enabled });
  }
}

// Singleton instance
let alertManager: AlertManager | null = null;

export function getAlertManager(): AlertManager {
  if (!alertManager) {
    alertManager = new AlertManager();
  }
  return alertManager;
}

export function initializeAlerting(config: AlertingConfig): AlertManager {
  alertManager = new AlertManager(config);
  return alertManager;
}

// Convenience functions
export async function sendAlert(alert: Alert): Promise<boolean> {
  return getAlertManager().send(alert);
}

export async function alertInfo(title: string, message: string, component?: string): Promise<boolean> {
  return sendAlert({ severity: 'info', title, message, component });
}

export async function alertWarning(title: string, message: string, component?: string): Promise<boolean> {
  return sendAlert({ severity: 'warning', title, message, component });
}

export async function alertError(title: string, message: string, component?: string): Promise<boolean> {
  return sendAlert({ severity: 'error', title, message, component });
}

export async function alertCritical(title: string, message: string, component?: string): Promise<boolean> {
  return sendAlert({ severity: 'critical', title, message, component });
}
