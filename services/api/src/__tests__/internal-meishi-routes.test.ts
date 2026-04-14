import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { Keypair, PublicKey } from '@solana/web3.js';

const passportAddress = new PublicKey('5D1fNXz4jcy9V8nB3PKzWGLfvkYhpCYwH14r2raekk5m');

const {
  graphQueryMock,
  publishAuditMock,
  state,
} = vi.hoisted(() => ({
  graphQueryMock: vi.fn<(...args: any[]) => Promise<{ data: unknown[] }>>(async () => ({ data: [] })),
  publishAuditMock: vi.fn<(...args: any[]) => Promise<string>>(async () => 'did:dkg:otp:2043/test/audit-1'),
  state: {
    passport: null as any,
    mandate: null as any,
    createPassportError: null as Error | null,
  },
}));

vi.mock('@kamiyo/agent-paranet', async () => ({
  AgentParanetClient: {
    create: vi.fn(async () => ({
      rawDKG: {
        graph: {
          query: graphQueryMock,
        },
        asset: {
          create: vi.fn(async () => ({ UAL: 'did:dkg:otp:2043/test/audit-1' })),
          get: vi.fn(async () => ({})),
        },
      },
    })),
  },
}));

vi.mock('@kamiyo/meishi', async () => {
  class MeishiClient {
    getPassportPDA(): [PublicKey, number] {
      return [passportAddress, 255];
    }

    async fetchPassport(): Promise<any | null> {
      return state.passport;
    }

    async getLatestMandate(): Promise<any | null> {
      return state.mandate;
    }

    async verifyPassport(): Promise<any> {
      return {
        compliant: true,
        suspended: false,
        mandateValid: Boolean(state.mandate),
      };
    }
  }

  class MeishiWriter {
    async createPassport(): Promise<{ passportAddress: string; signature: string }> {
      if (state.createPassportError) {
        throw state.createPassportError;
      }
      state.passport = {
        complianceScore: 0,
        mandateVersion: 0,
        auditNonce: 0,
        jurisdiction: 0,
      };
      return {
        passportAddress: passportAddress.toBase58(),
        signature: 'sig-create-passport',
      };
    }

    async updateMandate(): Promise<{ mandateAddress: string; signature: string }> {
      state.mandate = {
        revoked: false,
        validFrom: { toString: () => String(Math.floor(Date.now() / 1000) - 60) },
        validUntil: { toString: () => String(Math.floor(Date.now() / 1000) + 86_400) },
      };
      if (state.passport) {
        state.passport.mandateVersion = 1;
      }
      return {
        mandateAddress: 'mandate-1',
        signature: 'sig-update-mandate',
      };
    }

    async recordAudit(): Promise<{ auditAddress: string; signature: string }> {
      if (state.passport) {
        state.passport.auditNonce = 1;
        state.passport.complianceScore = 650;
      }
      return {
        auditAddress: 'audit-1',
        signature: 'sig-record-audit',
      };
    }
  }

  return {
    AuditType: { Initial: 0 },
    Jurisdiction: { Global: 0, EU: 1, US: 2, UK: 3, APAC: 4 },
    MeishiClient,
    MeishiWriter,
    generateComplianceReport: vi.fn(() => ({
      passportAddress: passportAddress.toBase58(),
      overallScore: 82,
      classification: 1,
      jurisdiction: 0,
      recommendations: ['identity registered'],
      dimensions: [
        { name: 'identity_verification', score: 100, findings: [] },
        { name: 'authorization_validity', score: 100, findings: [] },
      ],
      timestamp: Math.floor(Date.now() / 1000),
    })),
  };
});

vi.mock('@kamiyo/meishi/dkg', async () => {
  class MeishiDKGPublisher {
    async publishComplianceAudit(...args: any[]): Promise<string> {
      return publishAuditMock(...args);
    }
  }

  return {
    MeishiDKGPublisher,
    queryLatestAudit: vi.fn(() => 'SELECT * WHERE {}'),
  };
});

import internalMeishiRoutes from '../api/routes/internal-meishi';
import { __resetMeishiIdentityAssuranceForTests } from '../meishi/identity-assurance';

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Failed to bind test server');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('internal meishi routes', () => {
  let tempDataDir = '';
  const envBackup = {
    API_SECRET: process.env.API_SECRET,
    DATA_DIR: process.env.DATA_DIR,
    DKG_ENDPOINT: process.env.DKG_ENDPOINT,
    DKG_PRIVATE_KEY: process.env.DKG_PRIVATE_KEY,
    DKG_BLOCKCHAIN: process.env.DKG_BLOCKCHAIN,
    DKG_PORT: process.env.DKG_PORT,
    MEISHI_INTERNAL_API_SECRET: process.env.MEISHI_INTERNAL_API_SECRET,
    MEISHI_WRITER_KEYPAIR: process.env.MEISHI_WRITER_KEYPAIR,
    MEISHI_INTERNAL_ROUTE_ENABLED: process.env.MEISHI_INTERNAL_ROUTE_ENABLED,
  };

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meishi-dkg-'));
    state.passport = null;
    state.mandate = null;
    state.createPassportError = null;
    graphQueryMock.mockReset();
    publishAuditMock.mockReset();
    publishAuditMock.mockResolvedValue('did:dkg:otp:2043/test/audit-1');
    __resetMeishiIdentityAssuranceForTests();

    process.env.API_SECRET = 'test-secret';
    process.env.DKG_ENDPOINT = 'ot-node.example:8900';
    process.env.DKG_PRIVATE_KEY = 'test-dkg-private-key';
    process.env.DKG_BLOCKCHAIN = 'base:8453';
    process.env.DKG_PORT = '8900';
    process.env.MEISHI_INTERNAL_API_SECRET = 'test-meishi-secret-value';
    process.env.MEISHI_INTERNAL_ROUTE_ENABLED = 'true';
    process.env.MEISHI_WRITER_KEYPAIR = JSON.stringify(Array.from(Keypair.generate().secretKey));
    process.env.DATA_DIR = tempDataDir;
  });

  afterEach(() => {
    __resetMeishiIdentityAssuranceForTests();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('creates, audits, and publishes a first-time identity', async () => {
    graphQueryMock.mockResolvedValue({ data: [] });

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'human',
          walletAddress,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.assuranceMode).toBe('on_chain');
      expect(body.subjectId).toBe(`urn:kamiyo:solana:${walletAddress}`);
      expect(body.passportCreated).toBe(true);
      expect(body.mandateUpdated).toBe(true);
      expect(body.auditRecorded).toBe(true);
      expect(body.dkgAuditPublished).toBe(true);
      expect(body.dkgAuditQueued).toBe(false);
      expect(body.latestAuditUal).toBe('did:dkg:otp:2043/test/audit-1');
      expect(publishAuditMock).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it('stays idempotent when the passport and DKG audit already exist', async () => {
    state.passport = {
      complianceScore: 650,
      mandateVersion: 1,
      auditNonce: 2,
      jurisdiction: 0,
    };
    state.mandate = {
      revoked: false,
      validFrom: { toString: () => String(Math.floor(Date.now() / 1000) - 60) },
      validUntil: { toString: () => String(Math.floor(Date.now() / 1000) + 86_400) },
    };
    graphQueryMock.mockResolvedValue({
      data: [{ audit: 'did:dkg:otp:2043/test/existing-audit' }],
    });

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'agent',
          walletAddress,
          displayName: 'Signal Agent',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.assuranceMode).toBe('on_chain');
      expect(body.passportCreated).toBe(false);
      expect(body.mandateUpdated).toBe(false);
      expect(body.auditRecorded).toBe(false);
      expect(body.dkgAuditPublished).toBe(false);
      expect(body.dkgAuditQueued).toBe(false);
      expect(body.existingAuditUal).toBe('did:dkg:otp:2043/test/existing-audit');
      expect(publishAuditMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('publishes a dkg-only identity when the on-chain agent identity is unavailable', async () => {
    graphQueryMock.mockResolvedValue({ data: [] });
    state.createPassportError = new Error(
      'AnchorError thrown in programs/meishi/src/lib.rs:102. Error Code: AgentIdentityInvalid. Error Number: 6019. Error Message: Agent identity not found or inactive.'
    );

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'human',
          walletAddress,
          displayName: 'Singularity User',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.assuranceMode).toBe('dkg_only');
      expect(body.passportCreated).toBe(false);
      expect(body.mandateUpdated).toBe(false);
      expect(body.auditRecorded).toBe(false);
      expect(body.dkgAuditPublished).toBe(true);
      expect(body.dkgAuditQueued).toBe(false);
      expect(body.onChainComplianceScore).toBe(0);
      expect(body.dkgComplianceScore).toBeGreaterThan(0);
      expect(body.complianceClass).toBe('limited');
      expect(body.passportAddress).toBe(passportAddress.toBase58());
      expect(body.latestAuditUal).toBe('did:dkg:otp:2043/test/audit-1');
      expect(publishAuditMock).toHaveBeenCalledTimes(1);
      expect(publishAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: `urn:kamiyo:solana:${walletAddress}`,
          meishiPda: passportAddress.toBase58(),
          auditType: 'initial',
        })
      );
    } finally {
      await close();
    }
  });

  it('does not republish the same dkg-only identity audit when one already exists', async () => {
    graphQueryMock.mockResolvedValue({
      data: [{ audit: 'did:dkg:otp:2043/test/existing-dkg-only-audit' }],
    });
    state.createPassportError = new Error(
      'AnchorError thrown in programs/meishi/src/lib.rs:102. Error Code: AgentIdentityInvalid. Error Number: 6019. Error Message: Agent identity not found or inactive.'
    );

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'agent',
          walletAddress,
          displayName: 'Signal Agent',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.assuranceMode).toBe('dkg_only');
      expect(body.dkgAuditPublished).toBe(false);
      expect(body.dkgAuditQueued).toBe(false);
      expect(body.existingAuditUal).toBe('did:dkg:otp:2043/test/existing-dkg-only-audit');
      expect(body.latestAuditUal).toBe('did:dkg:otp:2043/test/existing-dkg-only-audit');
      expect(publishAuditMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('queues the audit when DKG publish hits a retryable rate limit', async () => {
    graphQueryMock.mockResolvedValue({ data: [] });
    publishAuditMock.mockRejectedValue(new Error('Returned error: over rate limit'));

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'human',
          walletAddress,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.dkgAuditPublished).toBe(false);
      expect(body.dkgAuditQueued).toBe(true);
      expect(body.latestAuditUal).toBeNull();

      const outboxPath = path.join(tempDataDir, 'meishi-dkg-outbox.json');
      expect(fs.existsSync(outboxPath)).toBe(true);
      const queued = JSON.parse(fs.readFileSync(outboxPath, 'utf8')) as Array<{ payload: { agentId: string } }>;
      expect(queued).toHaveLength(1);
      expect(queued[0]?.payload.agentId).toBe(`urn:kamiyo:solana:${walletAddress}`);
    } finally {
      await close();
    }
  });

  it('recovers the latest audit when the DKG publish response omits the UAL', async () => {
    publishAuditMock.mockRejectedValueOnce(new Error('DKG publish response missing UAL'));
    let queryCount = 0;
    graphQueryMock.mockImplementation(async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return { data: [] };
      }
      return { data: [{ audit: 'did:dkg:otp:2043/test/recovered-audit' }] };
    });

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'human',
          walletAddress,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.dkgAuditPublished).toBe(true);
      expect(body.dkgAuditQueued).toBe(false);
      expect(body.latestAuditUal).toBe('did:dkg:otp:2043/test/recovered-audit');
    } finally {
      await close();
    }
  });

  it('queues the audit when DKG publish hits a nonce contention error', async () => {
    graphQueryMock.mockResolvedValue({ data: [] });
    publishAuditMock.mockRejectedValue(new Error('Returned error: replacement transaction underpriced'));

    const app = express();
    app.use(express.json());
    app.use('/internal/meishi', internalMeishiRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const walletAddress = Keypair.generate().publicKey.toBase58();
      const res = await fetch(`${baseUrl}/internal/meishi/ensure-identity`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-meishi-secret-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entityType: 'agent',
          walletAddress,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.dkgAuditPublished).toBe(false);
      expect(body.dkgAuditQueued).toBe(true);
      expect(body.latestAuditUal).toBeNull();
    } finally {
      await close();
    }
  });
});
