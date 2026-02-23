import { createLogger, withRetry } from '../lib';
import type { AutonomyTask, MeishiDecision } from './types';

const log = createLogger('kyoshin:autonomy:meishi-gate');

interface MeishiVerifyResponse {
  exists?: boolean;
  active?: boolean;
  compliant?: boolean;
  score?: number;
  suspended?: boolean;
  errors?: string[];
}

export interface MeishiGateConfig {
  enabled: boolean;
  verifyUrlTemplate: string;
  agentIdentity: string;
  minScore: number;
  requireCompliant: boolean;
  timeoutMs: number;
}

export class MeishiGate {
  private config: MeishiGateConfig;

  constructor(config: MeishiGateConfig) {
    this.config = config;
  }

  async evaluate(_task: AutonomyTask): Promise<MeishiDecision> {
    if (!this.config.enabled) {
      return { allowed: true, reason: 'meishi_gate_disabled' };
    }

    if (!this.config.verifyUrlTemplate || !this.config.agentIdentity) {
      return { allowed: false, reason: 'meishi_gate_misconfigured' };
    }

    const verifyUrl = this.resolveVerifyUrl();
    let payload: MeishiVerifyResponse;

    try {
      payload = await withRetry(
        async () => this.fetchVerify(verifyUrl),
        { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 3000 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn('Meishi verification failed', { error: message });
      return { allowed: false, reason: 'meishi_verification_failed', errors: [message] };
    }

    const exists = payload.exists === true;
    const active = payload.active !== false;
    const suspended = payload.suspended === true;
    const score = typeof payload.score === 'number' ? payload.score : 0;
    const compliant = payload.compliant === true;
    const errors = Array.isArray(payload.errors) ? payload.errors : [];

    if (!exists) {
      return { allowed: false, reason: 'passport_not_found', score, compliant, suspended, errors };
    }

    if (!active || suspended) {
      return { allowed: false, reason: 'passport_suspended_or_inactive', score, compliant, suspended, errors };
    }

    if (this.config.requireCompliant && !compliant) {
      return { allowed: false, reason: 'passport_not_compliant', score, compliant, suspended, errors };
    }

    if (score < this.config.minScore) {
      return { allowed: false, reason: 'compliance_score_below_threshold', score, compliant, suspended, errors };
    }

    return { allowed: true, reason: 'meishi_passed', score, compliant, suspended, errors };
  }

  private resolveVerifyUrl(): string {
    return this.config.verifyUrlTemplate.includes('{agentIdentity}')
      ? this.config.verifyUrlTemplate.replace('{agentIdentity}', encodeURIComponent(this.config.agentIdentity))
      : `${this.config.verifyUrlTemplate.replace(/\/+$/, '')}/${encodeURIComponent(this.config.agentIdentity)}/verify`;
  }

  private async fetchVerify(url: string): Promise<MeishiVerifyResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`verification_http_${response.status}`);
      }

      const body = (await response.json()) as MeishiVerifyResponse;
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}

