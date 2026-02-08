import { expect } from "chai";
import {
  buildMeishiHeaders,
  parseMeishiHeaders,
  validateBase58,
} from "../packages/kamiyo-x402-client/src/meishi-headers";

describe("Meishi header validation", () => {
  describe("validateBase58", () => {
    it("accepts valid base58 values", () => {
      expect(validateBase58("3mJr7AoUXx2Wqd")).to.be.true;
      expect(validateBase58("11111111111111111111111111111111")).to.be.true;
    });

    it("rejects invalid base58 values", () => {
      expect(validateBase58("O0lI")).to.be.false;
      expect(validateBase58("abc+def")).to.be.false;
    });
  });

  describe("parseMeishiHeaders", () => {
    it("parses valid headers", () => {
      const headers = buildMeishiHeaders({
        passport: "11111111111111111111111111111111",
        mandateVersion: 7,
        signature: Buffer.alloc(64).toString("base64"),
      });

      const parsed = parseMeishiHeaders(headers);
      expect(parsed).to.not.equal(null);
      expect(parsed?.passport).to.equal("11111111111111111111111111111111");
      expect(parsed?.mandateVersion).to.equal(7);
    });

    it("rejects non-numeric mandate versions", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-mandate-version": "abc",
      });
      expect(parsed).to.equal(null);
    });

    it("rejects invalid base64 signatures", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": "not-base64***",
      });
      expect(parsed).to.equal(null);
    });

    it("parses replay-safe signature fields when complete", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-signature-ts": "1738900000",
        "x-meishi-signature-nonce": "nonce_12345678",
        "x-meishi-signature-method": "POST",
        "x-meishi-signature-path": "/checkout",
        "x-meishi-signature-body-sha256": "a".repeat(64),
      });
      expect(parsed).to.not.equal(null);
      expect(parsed?.signatureMethod).to.equal("POST");
      expect(parsed?.signaturePath).to.equal("/checkout");
    });

    it("does not emit deprecated proof header unless explicitly enabled", () => {
      const proof = Buffer.from("legacy-proof").toString("base64");
      const defaultHeaders = buildMeishiHeaders({
        passport: "11111111111111111111111111111111",
        complianceProof: proof,
        signature: Buffer.alloc(64).toString("base64"),
      });
      expect(defaultHeaders["x-meishi-compliance-proof"]).to.equal(undefined);

      const legacyHeaders = buildMeishiHeaders(
        {
          passport: "11111111111111111111111111111111",
          complianceProof: proof,
          signature: Buffer.alloc(64).toString("base64"),
        },
        { includeLegacyComplianceProof: true }
      );
      expect(legacyHeaders["x-meishi-compliance-proof"]).to.equal(proof);
    });

    it("parses OriginTrail assertion reference headers", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-assertion-ual": "did:dkg:otp:2043/0xabc/0xdef",
        "x-meishi-assertion-hash": "b".repeat(64),
        "x-meishi-private-assertion-ual": "did:dkg:otp:2043/0xabc/0xprivate",
      });
      expect(parsed).to.not.equal(null);
      expect(parsed?.assertionUal).to.equal("did:dkg:otp:2043/0xabc/0xdef");
      expect(parsed?.assertionHash).to.equal("b".repeat(64));
      expect(parsed?.privateAssertionUal).to.equal("did:dkg:otp:2043/0xabc/0xprivate");
    });

    it("rejects assertion hash without assertion ual", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-assertion-hash": "c".repeat(64),
      });
      expect(parsed).to.equal(null);
    });

    it("rejects malformed assertion ual and hash", () => {
      const badUal = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-assertion-ual": "not a valid ual",
      });
      expect(badUal).to.equal(null);

      const badHash = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-assertion-ual": "did:dkg:otp:2043/0xabc/0xdef",
        "x-meishi-assertion-hash": "xyz",
      });
      expect(badHash).to.equal(null);
    });

    it("rejects partial replay-safe signature fields", () => {
      const parsed = parseMeishiHeaders({
        "x-meishi-passport": "11111111111111111111111111111111",
        "x-meishi-signature": Buffer.alloc(64).toString("base64"),
        "x-meishi-signature-nonce": "nonce_12345678",
      });
      expect(parsed).to.equal(null);
    });
  });
});
