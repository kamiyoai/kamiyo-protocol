import { expect } from "chai";
import { MeishiDKGPublisher } from "../packages/kamiyo-meishi/dist/dkg/index.js";

describe("Meishi DKG epoch policy", () => {
  const complianceAudit = {
    agentId: "EUJKJbFXHYkHVvZabFQTWzSAzEfSk98zB1qWd41PQ6oU",
    meishiPda: "test-passport",
    auditorId: "4PZ6vn1F1esjuNvp7xvMWqzGsK5p14yVbjYQ9i7bGvGk",
    auditType: "initial",
    dimensions: [
      {
        name: "identity",
        score: 640,
        findings: [],
      },
    ],
    overallScore: 640,
    classification: "limited",
    jurisdiction: "EU",
    recommendations: ["Reduce audit storage cost during retries"],
  } as const;

  it("uses the configured default epochs for compliance audits", async () => {
    const calls: Array<{ epochs?: number }> = [];
    const publisher = new MeishiDKGPublisher({
      dkg: {
        publish: async (_content, options) => {
          calls.push(options ?? {});
          return "did:dkg:base:8453/test/1";
        },
        get: async () => ({ content: {} }),
        query: async () => [],
      },
      defaultEpochs: 1,
    });

    await publisher.publishComplianceAudit(complianceAudit);

    expect(calls).to.have.length(1);
    expect(calls[0]?.epochs).to.equal(1);
  });

  it("caps compliance audits at the max epoch limit", async () => {
    const calls: Array<{ epochs?: number }> = [];
    const publisher = new MeishiDKGPublisher({
      dkg: {
        publish: async (_content, options) => {
          calls.push(options ?? {});
          return "did:dkg:base:8453/test/2";
        },
        get: async () => ({ content: {} }),
        query: async () => [],
      },
      defaultEpochs: 250,
    });

    await publisher.publishComplianceAudit(complianceAudit);

    expect(calls).to.have.length(1);
    expect(calls[0]?.epochs).to.equal(100);
  });
});
