import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'http';

let stakingReferralRoutes: express.Router;
let generateWalletToken: (wallet: string) => string;

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('staking referral routes', () => {
  const prevJwtSecret = process.env.JWT_SECRET;
  const prevAdminSecret = process.env.STAKING_REFERRAL_ADMIN_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'staking-referral-test-jwt-secret';
    process.env.STAKING_REFERRAL_ADMIN_SECRET = 'staking-referral-admin-secret';

    const routeModule = await import('../api/routes/staking-referrals');
    stakingReferralRoutes = routeModule.default;

    const authModule = await import('../api/auth');
    generateWalletToken = authModule.generateWalletToken;
  });

  afterAll(() => {
    if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwtSecret;

    if (prevAdminSecret === undefined) delete process.env.STAKING_REFERRAL_ADMIN_SECRET;
    else process.env.STAKING_REFERRAL_ADMIN_SECRET = prevAdminSecret;
  });

  it('creates invite idempotently per inviter wallet', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/staking/referrals', stakingReferralRoutes);

    const { baseUrl, close } = await startServer(app);
    const wallet = `5inviter${Date.now()}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const token = generateWalletToken(wallet);

    try {
      const first = await fetch(`${baseUrl}/api/staking/referrals/invites`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      });
      expect(first.status).toBe(201);
      const firstBody = (await first.json()) as { inviteCode: string };

      const second = await fetch(`${baseUrl}/api/staking/referrals/invites`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      });
      expect(second.status).toBe(201);
      const secondBody = (await second.json()) as { inviteCode: string };

      expect(secondBody.inviteCode).toBe(firstBody.inviteCode);
    } finally {
      await close();
    }
  });

  it('enforces first-touch immutable attribution and rejects self-referrals', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/staking/referrals', stakingReferralRoutes);

    const { baseUrl, close } = await startServer(app);

    const inviterA = `6inviter${Date.now()}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const inviterB = `7inviter${Date.now()}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const referee = `8referee${Date.now()}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    const inviterAToken = generateWalletToken(inviterA);
    const inviterBToken = generateWalletToken(inviterB);
    const refereeToken = generateWalletToken(referee);

    try {
      const createA = await fetch(`${baseUrl}/api/staking/referrals/invites`, {
        method: 'POST',
        headers: { authorization: `Bearer ${inviterAToken}`, 'content-type': 'application/json' },
      });
      const createABody = (await createA.json()) as { inviteCode: string };

      const createB = await fetch(`${baseUrl}/api/staking/referrals/invites`, {
        method: 'POST',
        headers: { authorization: `Bearer ${inviterBToken}`, 'content-type': 'application/json' },
      });
      const createBBody = (await createB.json()) as { inviteCode: string };

      const bindFirst = await fetch(`${baseUrl}/api/staking/referrals/attributions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${refereeToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode: createABody.inviteCode }),
      });
      expect(bindFirst.status).toBe(200);
      const bindFirstBody = (await bindFirst.json()) as { status: string };
      expect(bindFirstBody.status).toBe('bound');

      const bindSecond = await fetch(`${baseUrl}/api/staking/referrals/attributions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${refereeToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode: createBBody.inviteCode }),
      });
      expect(bindSecond.status).toBe(409);
      const bindSecondBody = (await bindSecond.json()) as { reason?: string; status?: string };
      expect(bindSecondBody.status).toBe('rejected');
      expect(bindSecondBody.reason).toBe('first_touch_immutable');

      const selfBind = await fetch(`${baseUrl}/api/staking/referrals/attributions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${inviterAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode: createABody.inviteCode }),
      });
      expect(selfBind.status).toBe(409);
      const selfBindBody = (await selfBind.json()) as { reason?: string; status?: string };
      expect(selfBindBody.status).toBe('rejected');
      expect(selfBindBody.reason).toBe('self_referral');
    } finally {
      await close();
    }
  });

  it('runs payout endpoint idempotently by week', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/staking/referrals', stakingReferralRoutes);

    const { baseUrl, close } = await startServer(app);

    try {
      const first = await fetch(`${baseUrl}/api/staking/referrals/admin/payouts/run`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer staking-referral-admin-secret',
          'content-type': 'application/json',
        },
      });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { weekStartUtc: string; runId: string };
      expect(firstBody.weekStartUtc).toBeTruthy();

      const second = await fetch(`${baseUrl}/api/staking/referrals/admin/payouts/run`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer staking-referral-admin-secret',
          'content-type': 'application/json',
        },
      });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { weekStartUtc: string };
      expect(secondBody.weekStartUtc).toBe(firstBody.weekStartUtc);
    } finally {
      await close();
    }
  });
});
