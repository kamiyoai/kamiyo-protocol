import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { createHash } from 'node:crypto';
import { getPoCHChallenge, upsertPoCHChallenge } from '../api/routes/poch-store';

const { publishPoCHContributionMock, createClientMock, loadPoCHObservationsMock, nextChallengeId } = vi.hoisted(() => {
  const publishPoCHContributionMock = vi.fn(async () => ({ success: true, ual: 'urn:dkg:1' }));
  const createClientMock = vi.fn(async () => ({
    publishPoCHContribution: publishPoCHContributionMock,
    rawDKG: { graph: { query: vi.fn(async () => ({ data: [] })) } },
  }));
  const loadPoCHObservationsMock = vi.fn(async () => ({
    scoreBundle: {
      policyId: 'v1',
      uniquenessScore: 90,
      graphDivergence: 80,
      clusterOverlapRisk: 20,
      nonMembershipSignal: true,
      evaluatedAt: new Date().toISOString(),
    },
    duplicateCount: 0,
    minHashDistance: 0.8,
  }));

  let challengeCounter = 0;
  const nextChallengeId = () => {
    challengeCounter += 1;
    return `poch_challenge_${Date.now()}_${challengeCounter}`;
  };

  return {
    publishPoCHContributionMock,
    createClientMock,
    loadPoCHObservationsMock,
    nextChallengeId,
  };
});

vi.mock('@kamiyo/agent-paranet', async () => {
  const actual = await vi.importActual<any>('@kamiyo/agent-paranet');
  return {
    ...actual,
    AgentParanetClient: {
      create: createClientMock,
    },
    loadPoCHObservations: loadPoCHObservationsMock,
    hashPoCHScoreBundle: vi.fn(() => '0xscorebundle'),
    buildPoCHChallengeId: vi.fn(() => nextChallengeId()),
    buildPoCHURN: vi.fn((identityDid: string, contentHash: string) => `urn:kamiyo:poch:${identityDid}:${contentHash}`),
  };
});

import pochRoutes from '../api/routes/poch';

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

describe('PoCH routes', () => {
  const prevPochEnabled = process.env.POCH_ENABLED;
  const prevDkgEndpoint = process.env.DKG_ENDPOINT;
  const prevMode = process.env.POCH_ENFORCEMENT_MODE;
  const prevMinQuorum = process.env.POCH_ORACLE_MIN_QUORUM;
  const prevMinWeightQuorum = process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM;
  const prevCommitWindow = process.env.POCH_ORACLE_COMMIT_WINDOW_SEC;
  const prevRevealWindow = process.env.POCH_ORACLE_REVEAL_WINDOW_SEC;

  beforeEach(() => {
    createClientMock.mockClear();
    publishPoCHContributionMock.mockClear();
    loadPoCHObservationsMock.mockClear();
    process.env.DKG_ENDPOINT = 'http://127.0.0.1:8900';
    process.env.POCH_ENABLED = 'true';
    process.env.POCH_ENFORCEMENT_MODE = 'gate_high_impact';
    process.env.POCH_ORACLE_MIN_QUORUM = '1';
    process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM = '1';
    process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = '0';
    process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = '0';
  });

  afterEach(() => {
    if (prevPochEnabled === undefined) delete process.env.POCH_ENABLED;
    else process.env.POCH_ENABLED = prevPochEnabled;

    if (prevDkgEndpoint === undefined) delete process.env.DKG_ENDPOINT;
    else process.env.DKG_ENDPOINT = prevDkgEndpoint;

    if (prevMode === undefined) delete process.env.POCH_ENFORCEMENT_MODE;
    else process.env.POCH_ENFORCEMENT_MODE = prevMode;

    if (prevMinQuorum === undefined) delete process.env.POCH_ORACLE_MIN_QUORUM;
    else process.env.POCH_ORACLE_MIN_QUORUM = prevMinQuorum;

    if (prevMinWeightQuorum === undefined) delete process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM;
    else process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM = prevMinWeightQuorum;

    if (prevCommitWindow === undefined) delete process.env.POCH_ORACLE_COMMIT_WINDOW_SEC;
    else process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = prevCommitWindow;

    if (prevRevealWindow === undefined) delete process.env.POCH_ORACLE_REVEAL_WINDOW_SEC;
    else process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = prevRevealWindow;
  });

  it('returns disabled error when POCH_ENABLED=false', async () => {
    process.env.POCH_ENABLED = 'false';
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const res = await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(503);
    } finally {
      await close();
    }
  });

  it('supports contribution -> challenge -> oracle commit/reveal -> proof -> status flow', async () => {
    const identityDid = 'did:pkh:eip155:8453:0x1111111111111111111111111111111111111111';
    const assetDid = 'urn:kamiyo:poch:test:1';
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const contributionRes = await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          contentHash: '0xabc123',
          contributionType: 'knowledge_artifact',
          createdAt: new Date().toISOString(),
        }),
      });
      expect(contributionRes.status).toBe(201);

      const challengeRes = await fetch(`${baseUrl}/api/poch/challenges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          chain: 'solana',
          policyId: 'v1',
          contentHash: '0xabc123',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const oracleId = 'oracle-test-1';
      const salt = `salt_${Date.now()}`;
      const confidence = 0.91;
      const commitmentHash = createHash('sha256')
        .update(
          [
            challengeBody.challengeId,
            oracleId,
            '1',
            '1',
            confidence.toFixed(6),
            salt,
          ].join('|')
        )
        .digest('hex');

      const commitRes = await fetch(`${baseUrl}/api/poch/oracle/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          commitmentHash,
        }),
      });
      expect(commitRes.status).toBe(202);

      const revealRes = await fetch(`${baseUrl}/api/poch/oracle/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          authenticityVerdict: true,
          uniquenessVerdict: true,
          confidence,
          salt,
        }),
      });
      expect(revealRes.status).toBe(200);

      const proofRes = await fetch(`${baseUrl}/api/poch/proofs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          assetDid,
          identityDid,
          chain: 'solana',
          zkProof: 'proof_payload_abcdefghijklmnopqrstuvwxyz0123456789',
          identityNullifier: `nullifier_payload_${Date.now()}`,
        }),
      });
      expect(proofRes.status).toBe(202);
      const proofBody = await proofRes.json() as { accepted: boolean; pending: boolean };
      expect(proofBody.accepted).toBe(true);
      expect(proofBody.pending).toBe(false);

      const statusRes = await fetch(
        `${baseUrl}/api/poch/status/${encodeURIComponent(identityDid)}?chain=solana`
      );
      expect(statusRes.status).toBe(200);
      const statusBody = await statusRes.json() as { status: string };
      expect(statusBody.status).toBe('verified');

      const gateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'solana',
          action: 'premium_attestation',
        }),
      });
      expect(gateRes.status).toBe(200);
      const gateBody = await gateRes.json() as { allowed: boolean };
      expect(gateBody.allowed).toBe(true);
    } finally {
      await close();
    }
  });

  it('rejects duplicate oracle reveal submissions for the same challenge/oracle', async () => {
    const identityDid = `did:pkh:eip155:8453:0xduplicate${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:duplicate:${Date.now()}`;
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          contentHash: '0xdup',
          contributionType: 'knowledge_artifact',
          createdAt: new Date().toISOString(),
        }),
      });

      const challengeRes = await fetch(`${baseUrl}/api/poch/challenges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          chain: 'solana',
          policyId: 'v1',
          contentHash: '0xdup',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const oracleId = 'oracle-dup-1';
      const salt = `salt_dup_${Date.now()}`;
      const confidence = 0.87;
      const commitmentHash = createHash('sha256')
        .update(
          [
            challengeBody.challengeId,
            oracleId,
            '1',
            '1',
            confidence.toFixed(6),
            salt,
          ].join('|')
        )
        .digest('hex');

      const commitRes = await fetch(`${baseUrl}/api/poch/oracle/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          commitmentHash,
        }),
      });
      expect(commitRes.status).toBe(202);

      const firstReveal = await fetch(`${baseUrl}/api/poch/oracle/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          authenticityVerdict: true,
          uniquenessVerdict: true,
          confidence,
          salt,
        }),
      });
      expect(firstReveal.status).toBe(200);

      const secondReveal = await fetch(`${baseUrl}/api/poch/oracle/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          authenticityVerdict: true,
          uniquenessVerdict: true,
          confidence,
          salt,
        }),
      });
      expect(secondReveal.status).toBe(409);
      const secondRevealBody = await secondReveal.json() as { error?: { code?: string } };
      expect(secondRevealBody.error?.code).toBe('ALREADY_REVEALED');
    } finally {
      await close();
    }
  });

  it('rejects oracle reveal once reveal window expires', async () => {
    process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = '120';
    process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = '120';

    const identityDid = `did:pkh:eip155:8453:0xdeadline${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:deadline:${Date.now()}`;
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          contentHash: '0xdead',
          contributionType: 'knowledge_artifact',
          createdAt: new Date().toISOString(),
        }),
      });

      const challengeRes = await fetch(`${baseUrl}/api/poch/challenges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          chain: 'solana',
          policyId: 'v1',
          contentHash: '0xdead',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const oracleId = 'oracle-deadline-1';
      const salt = `salt_deadline_${Date.now()}`;
      const confidence = 0.82;
      const commitmentHash = createHash('sha256')
        .update(
          [
            challengeBody.challengeId,
            oracleId,
            '1',
            '1',
            confidence.toFixed(6),
            salt,
          ].join('|')
        )
        .digest('hex');

      const commitRes = await fetch(`${baseUrl}/api/poch/oracle/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          commitmentHash,
        }),
      });
      expect(commitRes.status).toBe(202);

      const challenge = getPoCHChallenge(challengeBody.challengeId);
      if (!challenge) {
        throw new Error('Expected challenge to exist in store');
      }

      upsertPoCHChallenge({
        ...challenge,
        phase: 'reveal',
        commitDeadline: Math.floor(Date.now() / 1000) - 10,
        revealDeadline: Math.floor(Date.now() / 1000) - 1,
      });

      const revealRes = await fetch(`${baseUrl}/api/poch/oracle/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          oracleId,
          authenticityVerdict: true,
          uniquenessVerdict: true,
          confidence,
          salt,
        }),
      });
      expect(revealRes.status).toBe(400);
      const revealBody = await revealRes.json() as { error?: { code?: string } };
      expect(revealBody.error?.code).toBe('REVEAL_PHASE_ENDED');
    } finally {
      await close();
    }
  });
});
