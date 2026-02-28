import { Connection, Keypair } from "@solana/web3.js";
import { KamiyoClient } from "./client";

function mockWallet(kp: Keypair): any {
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T>(tx: T) => tx,
    signAllTransactions: async <T>(txs: T[]) => txs,
  };
}

describe("KamiyoClient PoCH API", () => {
  const conn = {} as Connection;
  const wallet = mockWallet(Keypair.generate());
  let client: KamiyoClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    client = new KamiyoClient({
      connection: conn,
      wallet,
      apiBaseUrl: "http://localhost:3001",
    });
    fetchMock = jest.fn();
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (globalThis as Partial<typeof globalThis> & { fetch?: typeof fetch }).fetch;
  });

  test("getPoCHOracleRound encodes challenge id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        challengeId: "poch/challenge 1",
        phase: "reveal",
        commitDeadline: 1,
        revealDeadline: 2,
        oracle: {
          ready: false,
          accepted: false,
          voteCount: 0,
          totalWeight: 0,
          weightedConfidence: 0,
          authenticityYesWeight: 0,
          uniquenessYesWeight: 0,
        },
        proofSubmitted: false,
        disputes: [],
      }),
    });

    const result = await client.getPoCHOracleRound("poch/challenge 1");
    expect(result.challengeId).toBe("poch/challenge 1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/poch/oracle/round/poch%2Fchallenge%201"
    );
  });

  test("opens and resolves disputes with statusReason", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          disputeId: 7,
          challengeId: "poch_1",
          status: "open",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          disputeId: 7,
          resolved: true,
          finalized: true,
          accepted: true,
          finalizeReason: "verified",
          statusReason: "verified",
        }),
      });

    const opened = await client.openPoCHDispute({
      challengeId: "poch_1",
      reason: "manual review",
      blocking: true,
    });
    expect(opened.status).toBe("open");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3001/api/poch/disputes");

    const resolved = await client.resolvePoCHDispute(7, { challengeId: "poch_1" });
    expect(resolved.statusReason).toBe("verified");
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3001/api/poch/disputes/7/resolve");
  });

  test("submits x contribution and referral lifecycle requests", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          source: "x",
          assetDid: "urn:kamiyo:poch:x:asset",
          chain: "solana",
          contentHash: "0xabc",
          challenge: {
            challengeId: "poch_x_challenge_1",
            assetDid: "urn:kamiyo:poch:x:asset",
            identityDid: "did:pkh:solana:mainnet:abc",
            chain: "solana",
            policyId: "v1",
            scoreBundle: {
              policyId: "v1",
              uniquenessScore: 87,
              graphDivergence: 74,
              clusterOverlapRisk: 22,
              nonMembershipSignal: true,
              evaluatedAt: "2026-03-01T00:00:00.000Z",
            },
            scoreBundleCommitment: "0xscorebundle",
            createdAt: "2026-03-01T00:00:00.000Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inviteCode: "kx123abc999",
          status: "created",
          inviterIdentityDid: "did:pkh:solana:mainnet:abc",
          chain: "solana",
          shareUrl: "https://x.com/intent/post?text=test",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inviteCode: "kx123abc999",
          status: "awarded",
          inviterIdentityDid: "did:pkh:solana:mainnet:abc",
          inviteeIdentityDid: "did:pkh:solana:mainnet:def",
          inviterChain: "solana",
          inviteeChain: "base",
          rewardUnits: 125,
          rewardMultiplier: 1.25,
        }),
      });

    const contribution = await client.submitPoCHXContribution({
      identityDid: "did:pkh:solana:mainnet:abc",
      chain: "solana",
      xPostId: "1899981122334455667",
      threadText: "This is a substantial X thread contribution for PoCH validation.",
      xHandle: "kamiyoai",
    });
    expect(contribution.source).toBe("x");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3001/api/poch/x/contributions");

    const createdInvite = await client.createPoCHXReferralInvite({
      inviterIdentityDid: "did:pkh:solana:mainnet:abc",
      chain: "solana",
      xPostId: "1899981122334455667",
    });
    expect(createdInvite.status).toBe("created");
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3001/api/poch/x/referrals/create");

    const claimedInvite = await client.claimPoCHXReferralInvite({
      inviteCode: "kx123abc999",
      inviteeIdentityDid: "did:pkh:solana:mainnet:def",
      chain: "base",
      xPostId: "1899989988776655443",
    });
    expect(claimedInvite.status).toBe("awarded");
    expect(claimedInvite.rewardMultiplier).toBe(1.25);
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:3001/api/poch/x/referrals/claim");
  });

  test("handles rollout status and admin rollout controls", async () => {
    client = new KamiyoClient({
      connection: conn,
      wallet,
      apiBaseUrl: "http://localhost:3001",
      apiAdminSecret: "admin-secret",
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stage: "observe",
          effectiveMode: "observe",
          stageStartedAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          updatedBy: "system",
          evaluatorLastRunAt: "2026-03-01T00:05:00.000Z",
          snapshotAgeSeconds: 0,
          baselineProofFailRate: 0.05,
          gateMetrics: {
            oracleRevealCompletion24h: 0.95,
            proofPassRate24h: 0.97,
            unresolvedBlockingDisputesOver24h: 0,
            falsePositiveDenyRate24h: 0,
          },
          rollbackMetrics: {
            oracleRevealCompletion2h: 0.98,
            proofFailureRate1h: 0.03,
            openBlockingDisputes: 0,
          },
          gates: {
            oracleRevealCompletion: true,
            proofPassRate: true,
            unresolvedBlockingDisputes: true,
            falsePositiveDenyRate: true,
          },
          rollbackState: { inCooldown: false },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stage: "soft",
          effectiveMode: "soft",
          stageStartedAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:00:00.000Z",
          updatedBy: "admin",
          evaluatorLastRunAt: "2026-03-10T00:05:00.000Z",
          snapshotAgeSeconds: 0,
          baselineProofFailRate: 0.05,
          gateMetrics: {
            oracleRevealCompletion24h: 0.95,
            proofPassRate24h: 0.97,
            unresolvedBlockingDisputesOver24h: 0,
            falsePositiveDenyRate24h: 0,
          },
          rollbackMetrics: {
            oracleRevealCompletion2h: 0.98,
            proofFailureRate1h: 0.03,
            openBlockingDisputes: 0,
          },
          gates: {
            oracleRevealCompletion: true,
            proofPassRate: true,
            unresolvedBlockingDisputes: true,
            falsePositiveDenyRate: true,
          },
          rollbackState: { inCooldown: false },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rolledBack: true,
          fromStage: "soft",
          toStage: "observe",
          trigger: "manual",
          reason: "manual safety rollback",
        }),
      });

    const rolloutStatus = await client.getPoCHRolloutStatus();
    expect(rolloutStatus.stage).toBe("observe");
    expect(rolloutStatus.evaluatorLastRunAt).toBe("2026-03-01T00:05:00.000Z");
    expect(rolloutStatus.snapshotAgeSeconds).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3001/api/poch/rollout/status");

    const staged = await client.setPoCHRolloutStage({ stage: "soft", reason: "advance canary" });
    expect(staged.effectiveMode).toBe("soft");
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:3001/api/poch/rollout/stage");
    expect(fetchMock.mock.calls[1][1]?.headers?.authorization).toBe("Bearer admin-secret");

    const rollback = await client.triggerPoCHRollback({
      reason: "manual safety rollback",
      trigger: "manual",
    });
    expect(rollback.rolledBack).toBe(true);
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:3001/api/poch/rollout/rollback");
    expect(fetchMock.mock.calls[2][1]?.headers?.authorization).toBe("Bearer admin-secret");
  });
});
