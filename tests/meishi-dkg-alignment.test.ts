import { expect } from "chai";
import {
  buildAgentDigitalLink,
  buildMeishiDigitalLink,
  parseDigitalLink,
} from "../packages/kamiyo-meishi/dist/dkg/gs1.js";
import {
  buildComplianceAuditPayload,
  buildTransactionDecisionPayload,
} from "../packages/kamiyo-meishi/dist/dkg/schemas.js";
import {
  queryLatestAudit,
  queryAgentTransactions,
} from "../packages/kamiyo-meishi/dist/dkg/queries.js";

describe("Meishi DKG OriginTrail alignment", () => {
  it("uses GS1 resolver-compatible digital links by default", () => {
    const agentLink = buildAgentDigitalLink("4ndfL9E4uU5xFk2ZkQXo1xMUp5n3");
    expect(agentLink.startsWith("https://id.gs1.org/8004/")).to.equal(true);
  });

  it("emits parseable GS1 digital links for Meishi assets", () => {
    const assetLink = buildMeishiDigitalLink({
      agentGIAI: "0999999ABC12345",
      assetType: "audit",
      timestamp: 1738900000,
      qualifier: "periodic-1738900000",
    });
    const parsed = parseDigitalLink(assetLink);
    expect(parsed).to.not.equal(null);
    expect(parsed?.primaryAI).to.equal("8004");
    expect(parsed?.qualifiers.some((q) => q.ai === "8020")).to.equal(true);
  });

  it("builds compliance audit payloads with explicit public/private assertions", () => {
    const payload = buildComplianceAuditPayload({
      agentId: "agent-123",
      meishiPda: "meishi-abc",
      auditorId: "auditor-xyz",
      auditType: "periodic",
      dimensions: [{ name: "safety", score: 92, findings: ["none"] }],
      overallScore: 92,
      classification: "limited",
      jurisdiction: "eu",
      recommendations: ["Keep monitoring monthly"],
      privateFindingsUal: "ual:dkg:private:findings:1",
    });

    expect(payload.public["@context"]).to.deep.equal([
      "https://schema.org/",
      "https://www.gs1.org/voc/",
      "https://kamiyo.io/context/meishi/v1",
    ]);
    expect(payload.private).to.not.equal(undefined);
  });

  it("binds transaction decision payloads to schema.org + GS1 semantics", () => {
    const payload = buildTransactionDecisionPayload({
      agentId: "agent-123",
      meishiPda: "meishi-abc",
      mandateVersion: 2,
      action: "approve",
      merchantId: "merchant-1",
      productCategory: "software",
      amountUsd: 42.5,
      reasoningHash: "hash-123",
      humanApproved: false,
      mandateCheckPassed: true,
      spendingCheckPassed: true,
      categoryCheckPassed: true,
      transactionId: "tx-123",
      privateReasoning: "risk low",
    });

    const ctx = payload.public["@context"] as string[];
    expect(ctx.includes("https://schema.org/")).to.equal(true);
    expect(ctx.includes("https://www.gs1.org/voc/")).to.equal(true);
    expect(payload.private).to.not.equal(undefined);
  });

  it("builds SPARQL queries that target Meishi compliance assets", () => {
    const latestAudit = queryLatestAudit("agent-123");
    const txQuery = queryAgentTransactions("agent-123", { sinceDays: 7, limit: 5 });

    expect(latestAudit.includes('schema:name "ComplianceAudit"')).to.equal(true);
    expect(latestAudit.includes('agent-123')).to.equal(true);
    expect(txQuery.includes('schema:name "TransactionDecision"')).to.equal(true);
    expect(txQuery.includes("LIMIT 5")).to.equal(true);
  });
});
