import { expect } from "chai";
import { sha256HexCanonicalJson } from "../packages/kamiyo-meishi/dist/dkg/integrity.js";

describe("Meishi DKG integrity commitments", () => {
  it("hashes are stable across object key ordering", () => {
    const a = { b: 1, a: 2, nested: { z: "ok", y: "ok" }, list: [3, 2, 1] };
    const b = { a: 2, b: 1, nested: { y: "ok", z: "ok" }, list: [3, 2, 1] };
    expect(sha256HexCanonicalJson(a)).to.equal(sha256HexCanonicalJson(b));
  });

  it("rejects non-finite numbers", () => {
    expect(() => sha256HexCanonicalJson({ value: Number.NaN })).to.throw();
    expect(() => sha256HexCanonicalJson({ value: Number.POSITIVE_INFINITY })).to.throw();
  });
});

