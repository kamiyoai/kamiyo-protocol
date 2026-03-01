import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { createHash } from 'node:crypto';
import {
  getPoCHChallenge,
  upsertPoCHChallenge,
  upsertPoCHRolloutState,
  upsertPoCHStatus,
} from '../api/routes/poch-store';

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
  const prevAdminSecret = process.env.POCH_ADMIN_SECRET;
  const prevMinQuorum = process.env.POCH_ORACLE_MIN_QUORUM;
  const prevMinWeightQuorum = process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM;
  const prevCommitWindow = process.env.POCH_ORACLE_COMMIT_WINDOW_SEC;
  const prevRevealWindow = process.env.POCH_ORACLE_REVEAL_WINDOW_SEC;
  const prevRollbackDisputeThreshold = process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD;
  const prevRollbackOracleRevealMin = process.env.POCH_ROLLBACK_ORACLE_REVEAL_MIN_COMPLETION;
  const prevRollbackProofAnomaly = process.env.POCH_ROLLBACK_PROOF_FAILURE_ANOMALY_MULTIPLIER;
  const prevRolloutInterval = process.env.POCH_ROLLOUT_EVALUATOR_INTERVAL_MS;

  beforeEach(() => {
    createClientMock.mockClear();
    publishPoCHContributionMock.mockClear();
    loadPoCHObservationsMock.mockClear();
    process.env.DKG_ENDPOINT = 'http://127.0.0.1:8900';
    process.env.POCH_ENABLED = 'true';
    process.env.POCH_ENFORCEMENT_MODE = 'gate_high_impact';
    process.env.POCH_ADMIN_SECRET = 'test-admin-secret';
    process.env.POCH_ORACLE_MIN_QUORUM = '1';
    process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM = '1';
    process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = '0';
    process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = '0';
    process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD = '50';
    process.env.POCH_ROLLBACK_ORACLE_REVEAL_MIN_COMPLETION = '0';
    process.env.POCH_ROLLBACK_PROOF_FAILURE_ANOMALY_MULTIPLIER = '999999';
    process.env.POCH_ROLLOUT_EVALUATOR_INTERVAL_MS = '300000';
    upsertPoCHRolloutState({
      stage: 'gate_high_impact',
      modeOverride: 'gate_high_impact',
      rollbackCooldownUntil: null,
      baselineProofFailRate: 0.05,
      updatedBy: 'test',
    });
  });

  afterEach(() => {
    if (prevPochEnabled === undefined) delete process.env.POCH_ENABLED;
    else process.env.POCH_ENABLED = prevPochEnabled;

    if (prevDkgEndpoint === undefined) delete process.env.DKG_ENDPOINT;
    else process.env.DKG_ENDPOINT = prevDkgEndpoint;

    if (prevMode === undefined) delete process.env.POCH_ENFORCEMENT_MODE;
    else process.env.POCH_ENFORCEMENT_MODE = prevMode;

    if (prevAdminSecret === undefined) delete process.env.POCH_ADMIN_SECRET;
    else process.env.POCH_ADMIN_SECRET = prevAdminSecret;

    if (prevMinQuorum === undefined) delete process.env.POCH_ORACLE_MIN_QUORUM;
    else process.env.POCH_ORACLE_MIN_QUORUM = prevMinQuorum;

    if (prevMinWeightQuorum === undefined) delete process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM;
    else process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM = prevMinWeightQuorum;

    if (prevCommitWindow === undefined) delete process.env.POCH_ORACLE_COMMIT_WINDOW_SEC;
    else process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = prevCommitWindow;

    if (prevRevealWindow === undefined) delete process.env.POCH_ORACLE_REVEAL_WINDOW_SEC;
    else process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = prevRevealWindow;

    if (prevRollbackDisputeThreshold === undefined) delete process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD;
    else process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD = prevRollbackDisputeThreshold;

    if (prevRollbackOracleRevealMin === undefined) delete process.env.POCH_ROLLBACK_ORACLE_REVEAL_MIN_COMPLETION;
    else process.env.POCH_ROLLBACK_ORACLE_REVEAL_MIN_COMPLETION = prevRollbackOracleRevealMin;

    if (prevRollbackProofAnomaly === undefined) delete process.env.POCH_ROLLBACK_PROOF_FAILURE_ANOMALY_MULTIPLIER;
    else process.env.POCH_ROLLBACK_PROOF_FAILURE_ANOMALY_MULTIPLIER = prevRollbackProofAnomaly;

    if (prevRolloutInterval === undefined) delete process.env.POCH_ROLLOUT_EVALUATOR_INTERVAL_MS;
    else process.env.POCH_ROLLOUT_EVALUATOR_INTERVAL_MS = prevRolloutInterval;
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

  it('handles PoCH X contribution success, invalid payloads, and duplicate xPost replay', async () => {
    const identityDid = `did:pkh:eip155:8453:0xxcontrib${Date.now()}`;
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const firstRes = await fetch(`${baseUrl}/api/poch/x/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'base',
          xPostId: '1899981122334455667',
          threadText: 'Kamiyo PoCH X contribution test thread with enough content to pass checks.',
          autoRequestChallenge: true,
        }),
      });
      expect(firstRes.status).toBe(201);
      const firstBody = await firstRes.json() as { assetDid: string; challenge?: { challengeId: string } };
      expect(firstBody.assetDid).toContain('urn:kamiyo:poch');
      expect(firstBody.challenge?.challengeId).toBeDefined();

      const duplicateRes = await fetch(`${baseUrl}/api/poch/x/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'base',
          xPostId: '1899981122334455667',
          threadText: 'A different thread body should still be rejected by replay guard.',
          autoRequestChallenge: true,
        }),
      });
      expect(duplicateRes.status).toBe(409);
      const duplicateBody = await duplicateRes.json() as { error?: { code?: string } };
      expect(duplicateBody.error?.code).toBe('DUPLICATE_X_POST');

      const invalidRes = await fetch(`${baseUrl}/api/poch/x/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'base',
          xPostId: '1899981122334455999',
          threadText: 'too short',
          autoRequestChallenge: true,
        }),
      });
      expect(invalidRes.status).toBe(400);
      const invalidBody = await invalidRes.json() as { error?: { code?: string } };
      expect(invalidBody.error?.code).toBe('INVALID_INPUT');
    } finally {
      await close();
    }
  });

  it('handles PoCH X referral create success, inviter-failure, and idempotency', async () => {
    const verifiedInviter = `did:pkh:eip155:8453:0xinviter${Date.now()}`;
    const unverifiedInviter = `did:pkh:eip155:8453:0xnotverified${Date.now()}`;
    upsertPoCHStatus({
      identityDid: verifiedInviter,
      chain: 'base',
      status: 'verified',
      statusReason: 'verified',
      updatedAt: new Date().toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const createdRes = await fetch(`${baseUrl}/api/poch/x/referrals/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviterIdentityDid: verifiedInviter,
          chain: 'base',
          xPostId: '1899981200000000001',
        }),
      });
      expect(createdRes.status).toBe(201);
      const createdBody = await createdRes.json() as { inviteCode: string; status: string };
      expect(createdBody.inviteCode.length).toBeGreaterThan(6);
      expect(createdBody.status).toBe('created');

      const idempotentRes = await fetch(`${baseUrl}/api/poch/x/referrals/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviterIdentityDid: verifiedInviter,
          chain: 'base',
          xPostId: '1899981200000000001',
        }),
      });
      expect(idempotentRes.status).toBe(200);
      const idempotentBody = await idempotentRes.json() as { inviteCode: string };
      expect(idempotentBody.inviteCode).toBe(createdBody.inviteCode);

      const rejectedRes = await fetch(`${baseUrl}/api/poch/x/referrals/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviterIdentityDid: unverifiedInviter,
          chain: 'base',
          xPostId: '1899981200000000009',
        }),
      });
      expect(rejectedRes.status).toBe(409);
      const rejectedBody = await rejectedRes.json() as { error?: { code?: string } };
      expect(rejectedBody.error?.code).toBe('INVITER_NOT_VERIFIED');
    } finally {
      await close();
    }
  });

  it('enforces PoCH X referral one-claim semantics, replay checks, and idempotent claims', async () => {
    const inviterA = `did:pkh:eip155:8453:0xinvitera${Date.now()}`;
    const inviterB = `did:pkh:eip155:8453:0xinviterb${Date.now()}`;
    const invitee = `did:pkh:eip155:8453:0xinvitee${Date.now()}`;
    const otherInvitee = `did:pkh:eip155:8453:0xotherinvitee${Date.now()}`;

    upsertPoCHStatus({
      identityDid: inviterA,
      chain: 'base',
      status: 'verified',
      statusReason: 'verified',
      updatedAt: new Date().toISOString(),
    });
    upsertPoCHStatus({
      identityDid: inviterB,
      chain: 'base',
      status: 'verified',
      statusReason: 'verified',
      updatedAt: new Date().toISOString(),
    });
    upsertPoCHStatus({
      identityDid: invitee,
      chain: 'base',
      status: 'verified',
      statusReason: 'verified',
      updatedAt: new Date().toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const inviteARes = await fetch(`${baseUrl}/api/poch/x/referrals/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviterIdentityDid: inviterA,
          chain: 'base',
          xPostId: '1899981300000000001',
        }),
      });
      expect(inviteARes.status).toBe(201);
      const inviteABody = await inviteARes.json() as { inviteCode: string };

      const firstClaimRes = await fetch(`${baseUrl}/api/poch/x/referrals/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteABody.inviteCode,
          inviteeIdentityDid: invitee,
          chain: 'base',
          xPostId: '1899981300000000999',
        }),
      });
      expect(firstClaimRes.status).toBe(200);
      const firstClaimBody = await firstClaimRes.json() as { status: string; rewardUnits: number };
      expect(firstClaimBody.status).toBe('awarded');
      expect(firstClaimBody.rewardUnits).toBeGreaterThan(0);

      const secondClaimRes = await fetch(`${baseUrl}/api/poch/x/referrals/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteABody.inviteCode,
          inviteeIdentityDid: invitee,
          chain: 'base',
          xPostId: '1899981300000000999',
        }),
      });
      expect(secondClaimRes.status).toBe(200);
      const secondClaimBody = await secondClaimRes.json() as { status: string };
      expect(secondClaimBody.status).toBe('awarded');

      const claimedByOtherRes = await fetch(`${baseUrl}/api/poch/x/referrals/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteABody.inviteCode,
          inviteeIdentityDid: otherInvitee,
          chain: 'base',
          xPostId: '1899981300000001999',
        }),
      });
      expect(claimedByOtherRes.status).toBe(409);
      const claimedByOtherBody = await claimedByOtherRes.json() as { error?: { code?: string } };
      expect(claimedByOtherBody.error?.code).toBe('ALREADY_CLAIMED');

      const inviteBRes = await fetch(`${baseUrl}/api/poch/x/referrals/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviterIdentityDid: inviterB,
          chain: 'base',
          xPostId: '1899981300000000002',
        }),
      });
      expect(inviteBRes.status).toBe(201);
      const inviteBBody = await inviteBRes.json() as { inviteCode: string };

      const replayRes = await fetch(`${baseUrl}/api/poch/x/referrals/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteBBody.inviteCode,
          inviteeIdentityDid: invitee,
          chain: 'base',
          xPostId: '1899981300000000999',
        }),
      });
      expect(replayRes.status).toBe(409);
      const replayBody = await replayRes.json() as { error?: { code?: string } };
      expect(replayBody.error?.code).toBe('DUPLICATE_X_POST');
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

  it('finalizes timed-out challenges with oracle_timeout reason', async () => {
    process.env.POCH_ORACLE_COMMIT_WINDOW_SEC = '120';
    process.env.POCH_ORACLE_REVEAL_WINDOW_SEC = '120';

    const identityDid = `did:pkh:eip155:8453:0xtimeout${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:timeout:${Date.now()}`;
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
          contentHash: '0xtimeout',
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
          contentHash: '0xtimeout',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const challenge = getPoCHChallenge(challengeBody.challengeId);
      if (!challenge) {
        throw new Error('Expected challenge to exist in store');
      }

      upsertPoCHChallenge({
        ...challenge,
        phase: 'reveal',
        commitDeadline: Math.floor(Date.now() / 1000) - 120,
        revealDeadline: Math.floor(Date.now() / 1000) - 60,
      });

      const roundRes = await fetch(
        `${baseUrl}/api/poch/oracle/round/${encodeURIComponent(challengeBody.challengeId)}`
      );
      expect(roundRes.status).toBe(200);
      const roundBody = await roundRes.json() as { finalized: boolean; statusReason?: string };
      expect(roundBody.finalized).toBe(true);
      expect(roundBody.statusReason).toBe('oracle_timeout');

      const statusRes = await fetch(
        `${baseUrl}/api/poch/status/${encodeURIComponent(identityDid)}?chain=solana`
      );
      expect(statusRes.status).toBe(200);
      const statusBody = await statusRes.json() as { status: string; statusReason?: string };
      expect(statusBody.status).toBe('rejected');
      expect(statusBody.statusReason).toBe('oracle_timeout');
    } finally {
      await close();
    }
  });

  it('enforces proof idempotency and challenge-level non-overwrite', async () => {
    const identityDid = `did:pkh:eip155:8453:0xproofidem${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:proofidem:${Date.now()}`;
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
          contentHash: '0xproofidem',
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
          contentHash: '0xproofidem',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const baseProofPayload = {
        challengeId: challengeBody.challengeId,
        assetDid,
        identityDid,
        chain: 'solana',
        zkProof: 'proof_payload_abcdefghijklmnopqrstuvwxyz0123456789',
        identityNullifier: `nullifier_payload_${Date.now()}`,
      };

      const firstProofRes = await fetch(`${baseUrl}/api/poch/proofs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseProofPayload),
      });
      expect(firstProofRes.status).toBe(202);
      const firstProofBody = await firstProofRes.json() as { pending: boolean; statusReason?: string };
      expect(firstProofBody.pending).toBe(true);
      expect(firstProofBody.statusReason).toBe('oracle_quorum_pending');

      const secondProofRes = await fetch(`${baseUrl}/api/poch/proofs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseProofPayload),
      });
      expect(secondProofRes.status).toBe(200);
      const secondProofBody = await secondProofRes.json() as { pending: boolean; statusReason?: string };
      expect(secondProofBody.pending).toBe(true);
      expect(secondProofBody.statusReason).toBe('oracle_quorum_pending');

      const conflictingProofRes = await fetch(`${baseUrl}/api/poch/proofs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...baseProofPayload,
          zkProof: 'proof_payload_conflict_abcdefghijklmnopqrstuvwxyz0123456789',
          identityNullifier: `nullifier_payload_conflict_${Date.now()}`,
        }),
      });
      expect(conflictingProofRes.status).toBe(409);
      const conflictingProofBody = await conflictingProofRes.json() as { error?: { code?: string } };
      expect(conflictingProofBody.error?.code).toBe('PROOF_ALREADY_SUBMITTED');
    } finally {
      await close();
    }
  });

  it('blocks finalization for blocking disputes and finalizes after dispute resolution', async () => {
    const identityDid = `did:pkh:eip155:8453:0xdispute${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:dispute:${Date.now()}`;
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
          contentHash: '0xdispute',
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
          contentHash: '0xdispute',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const oracleId = 'oracle-dispute-1';
      const salt = `salt_dispute_${Date.now()}`;
      const confidence = 0.88;
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

      const openDisputeRes = await fetch(`${baseUrl}/api/poch/disputes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          reason: 'manual audit hold',
          blocking: true,
        }),
      });
      expect(openDisputeRes.status).toBe(201);
      const openDisputeBody = await openDisputeRes.json() as { disputeId: number };

      const proofRes = await fetch(`${baseUrl}/api/poch/proofs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          assetDid,
          identityDid,
          chain: 'solana',
          zkProof: 'proof_payload_abcdefghijklmnopqrstuvwxyz0123456789',
          identityNullifier: `nullifier_dispute_${Date.now()}`,
        }),
      });
      expect(proofRes.status).toBe(202);
      const proofBody = await proofRes.json() as { pending: boolean; finalizeReason?: string; statusReason?: string };
      expect(proofBody.pending).toBe(true);
      expect(proofBody.finalizeReason).toBe('blocking_dispute');
      expect(proofBody.statusReason).toBe('blocking_dispute');

      const resolveRes = await fetch(`${baseUrl}/api/poch/disputes/${openDisputeBody.disputeId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
        }),
      });
      expect(resolveRes.status).toBe(200);
      const resolveBody = await resolveRes.json() as { finalized: boolean; accepted?: boolean; statusReason?: string };
      expect(resolveBody.finalized).toBe(true);
      expect(resolveBody.accepted).toBe(true);
      expect(resolveBody.statusReason).toBe('verified');

      const statusRes = await fetch(
        `${baseUrl}/api/poch/status/${encodeURIComponent(identityDid)}?chain=solana`
      );
      expect(statusRes.status).toBe(200);
      const statusBody = await statusRes.json() as { status: string; statusReason?: string };
      expect(statusBody.status).toBe('verified');
      expect(statusBody.statusReason).toBe('verified');
    } finally {
      await close();
    }
  });

  it('denies high-impact action before verification and allows after finalization', async () => {
    const identityDid = `did:pkh:eip155:8453:0xgate${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:gate:${Date.now()}`;
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const deniedGateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'solana',
          action: 'high_trust_agent_action',
        }),
      });
      expect(deniedGateRes.status).toBe(200);
      const deniedGateBody = await deniedGateRes.json() as { allowed: boolean; reason?: string };
      expect(deniedGateBody.allowed).toBe(false);
      expect(deniedGateBody.reason).toBe('PoCH verification required for this action');

      await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          contentHash: '0xgate',
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
          contentHash: '0xgate',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const oracleId = 'oracle-gate-1';
      const salt = `salt_gate_${Date.now()}`;
      const confidence = 0.9;
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
          identityNullifier: `nullifier_gate_${Date.now()}`,
        }),
      });
      expect(proofRes.status).toBe(202);

      const allowedGateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid,
          chain: 'solana',
          action: 'high_trust_agent_action',
        }),
      });
      expect(allowedGateRes.status).toBe(200);
      const allowedGateBody = await allowedGateRes.json() as { allowed: boolean; reason?: string };
      expect(allowedGateBody.allowed).toBe(true);
      expect(allowedGateBody.reason).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('enforces admin auth on rollout controls and applies mode override over env fallback', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const unauthorized = await fetch(`${baseUrl}/api/poch/rollout/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: 'observe', reason: 'test override' }),
      });
      expect(unauthorized.status).toBe(401);

      const statusRes = await fetch(`${baseUrl}/api/poch/rollout/status`);
      expect(statusRes.status).toBe(200);
      const statusBody = await statusRes.json() as {
        effectiveMode: string;
        evaluatorLastRunAt?: string;
        snapshotAgeSeconds?: number;
      };
      expect(['observe', 'soft', 'gate_high_impact']).toContain(statusBody.effectiveMode);
      expect(statusBody.evaluatorLastRunAt).toBeTruthy();
      expect(typeof statusBody.snapshotAgeSeconds).toBe('number');
      expect(statusBody.snapshotAgeSeconds).toBeGreaterThanOrEqual(0);

      const staged = await fetch(`${baseUrl}/api/poch/rollout/stage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ stage: 'observe', reason: 'force observe for canary' }),
      });
      expect(staged.status).toBe(200);
      const stagedBody = await staged.json() as { effectiveMode: string };
      expect(stagedBody.effectiveMode).toBe('observe');

      const gateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid: `did:pkh:eip155:8453:0xoverride${Date.now()}`,
          chain: 'solana',
          action: 'high_trust_agent_action',
        }),
      });
      expect(gateRes.status).toBe(200);
      const gateBody = await gateRes.json() as { allowed: boolean; mode: string; reason?: string };
      expect(gateBody.allowed).toBe(true);
      expect(gateBody.mode).toBe('observe');
      expect(gateBody.reason).toBe('PoCH observe mode');
    } finally {
      await close();
    }
  });

  it('returns soft warning when mode is soft and identity is unverified', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const staged = await fetch(`${baseUrl}/api/poch/rollout/stage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ stage: 'soft', reason: 'soft stage canary check' }),
      });
      expect(staged.status).toBe(200);

      const gateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid: `did:pkh:eip155:8453:0xsoft${Date.now()}`,
          chain: 'solana',
          action: 'stake_amplification',
        }),
      });
      expect(gateRes.status).toBe(200);
      const gateBody = await gateRes.json() as { allowed: boolean; mode: string; reason?: string };
      expect(gateBody.allowed).toBe(true);
      expect(gateBody.mode).toBe('soft');
      expect(gateBody.reason).toBe('PoCH missing, soft mode applied');
    } finally {
      await close();
    }
  });

  it('supports manual rollback from gate_high_impact to soft and from soft to observe', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const setGate = await fetch(`${baseUrl}/api/poch/rollout/stage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ stage: 'gate_high_impact', reason: 'manual rollback drill seed' }),
      });
      expect(setGate.status).toBe(200);

      const rollbackToSoft = await fetch(`${baseUrl}/api/poch/rollout/rollback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ reason: 'drill rollback gate->soft', trigger: 'manual' }),
      });
      expect(rollbackToSoft.status).toBe(200);
      const rollbackToSoftBody = await rollbackToSoft.json() as {
        fromStage: string;
        toStage: string;
        trigger: string;
      };
      expect(rollbackToSoftBody.fromStage).toBe('gate_high_impact');
      expect(rollbackToSoftBody.toStage).toBe('soft');
      expect(rollbackToSoftBody.trigger).toBe('manual');

      const rollbackToObserve = await fetch(`${baseUrl}/api/poch/rollout/rollback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ reason: 'drill rollback soft->observe', trigger: 'manual' }),
      });
      expect(rollbackToObserve.status).toBe(200);
      const rollbackToObserveBody = await rollbackToObserve.json() as {
        fromStage: string;
        toStage: string;
        trigger: string;
      };
      expect(rollbackToObserveBody.fromStage).toBe('soft');
      expect(rollbackToObserveBody.toStage).toBe('observe');
      expect(rollbackToObserveBody.trigger).toBe('manual');
    } finally {
      await close();
    }
  });

  it('rolls back from gate_high_impact to soft when dispute backlog trigger fires', async () => {
    process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD = '9999';

    const identityDid = `did:pkh:eip155:8453:0xrollout${Date.now()}`;
    const assetDid = `urn:kamiyo:poch:rollout:${Date.now()}`;
    const app = express();
    app.use(express.json());
    app.use('/api/poch', pochRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const setGate = await fetch(`${baseUrl}/api/poch/rollout/stage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.POCH_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ stage: 'gate_high_impact', reason: 'test gate stage' }),
      });
      expect(setGate.status).toBe(200);

      await fetch(`${baseUrl}/api/poch/contributions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetDid,
          identityDid,
          contentHash: '0xrollout',
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
          contentHash: '0xrollout',
        }),
      });
      expect(challengeRes.status).toBe(201);
      const challengeBody = await challengeRes.json() as { challengeId: string };

      const disputeRes = await fetch(`${baseUrl}/api/poch/disputes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeBody.challengeId,
          reason: 'rollback trigger',
          blocking: true,
        }),
      });
      expect(disputeRes.status).toBe(201);

      process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD = '0';

      const rolloutStatus = await fetch(`${baseUrl}/api/poch/rollout/status`);
      expect(rolloutStatus.status).toBe(200);
      const rolloutBody = await rolloutStatus.json() as {
        effectiveMode: string;
        rollbackState?: { trigger?: string };
      };
      expect(rolloutBody.effectiveMode).toBe('soft');
      expect(rolloutBody.rollbackState?.trigger).toBe('dispute_backlog');

      const gateRes = await fetch(`${baseUrl}/api/poch/verify-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityDid: `did:pkh:eip155:8453:0xrollbackgate${Date.now()}`,
          chain: 'solana',
          action: 'premium_attestation',
        }),
      });
      expect(gateRes.status).toBe(200);
      const gateBody = await gateRes.json() as { allowed: boolean; mode: string };
      expect(gateBody.allowed).toBe(true);
      expect(gateBody.mode).toBe('soft');
    } finally {
      await close();
    }
  });
});
