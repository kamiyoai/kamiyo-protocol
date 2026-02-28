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
});
