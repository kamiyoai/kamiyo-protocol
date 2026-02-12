import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { agentService } from '../services/agents.js';

vi.mock('../services/meishi.js', () => {
  return {
    meishiService: {
      getPassportAndMandateByAgent: vi.fn(async () => ({
        passport: {
          agentIdentity: 'agent_identity',
          issuer: 'issuer',
          principal: 'principal',
          kamonHash: '00',
          complianceClass: 'unclassified',
          complianceScore: 0,
          jurisdiction: 'global',
          mandateHash: '00',
          mandateExpires: new Date().toISOString(),
          mandateVersion: 0,
          totalTransactions: 0,
          totalVolumeUsd: 0,
          disputesFiled: 0,
          disputesLost: 0,
          lastAudit: new Date().toISOString(),
          auditNonce: 0,
          suspended: false,
          suspensionReason: 'none',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        mandate: {
          version: 1,
          spendingLimitUsd: 1_000_000,
          dailyLimitUsd: 5_000_000,
          monthlyLimitUsd: 50_000_000,
          requiresHumanApprovalAbove: 10_000_000,
          geoRestrictions: ['us'],
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 86_400_000).toISOString(),
          revoked: false,
        },
        passportAddress: 'passport_pda',
      })),
    },
  };
});

async function makeApp() {
  const { meishiRouter } = await import('./meishi.js');
  const app = new Hono();
  app.route('/meishi', meishiRouter);
  return app;
}

describe('meishi routes', () => {
  const testWallet = '4xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';
  let agent: ReturnType<typeof agentService.create>;

  beforeEach(() => {
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);

    agent = agentService.create({
      walletAddress: testWallet,
      name: 'Meishi Agent',
      personality: 'professional',
      skills: ['research'],
    });
  });

  it('returns passport', async () => {
    const app = await makeApp();
    const res = await app.request(`/meishi/passport/${agent.id}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { passport: { agentIdentity: string } };
    expect(data.passport.agentIdentity).toBe('agent_identity');
  });

  it('returns mandate', async () => {
    const app = await makeApp();
    const res = await app.request(`/meishi/mandate/${agent.id}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mandate: { version: number } };
    expect(data.mandate.version).toBe(1);
  });

  it('returns 404 for unknown agent', async () => {
    const app = await makeApp();
    const res = await app.request('/meishi/passport/nonexistent_agent_123');
    expect(res.status).toBe(404);
  });
});

