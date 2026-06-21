import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseAnchor, renderAnchorBody } from "../src/ledger/anchor.js";

describe("ledger anchor", () => {
  test("render then parse round-trips", () => {
    const anchor = {
      kind: "occ",
      ids: ["#97", "#98"],
      event: "7d0f8bca",
      note: "run-353 dual-execution",
    };
    const parsed = parseAnchor(renderAnchorBody(anchor));
    assert.deepEqual(parsed, anchor);
  });

  test("round-trips with no note", () => {
    const anchor = { kind: "fold", ids: ["n=99"], event: "abc123", note: "" };
    assert.deepEqual(parseAnchor(renderAnchorBody(anchor)), anchor);
  });

  test("the block survives surrounding human prose in a comment", () => {
    const body = `Minting two ordinals for the run-353 episode.\n\n${renderAnchorBody(
      { kind: "nm", ids: ["NM38"], event: "deadbeef" },
    )}\n\nResolve by event SHA per D4.`;
    assert.deepEqual(parseAnchor(body), {
      kind: "nm",
      ids: ["NM38"],
      event: "deadbeef",
      note: "",
    });
  });

  test("a comment with no fenced block parses to null", () => {
    assert.equal(parseAnchor("just a normal comment"), null);
  });

  test("an unknown kind parses to null", () => {
    const body = '```yaml alloc\nkind: bogus\nids: ["x"]\nevent: y\n```';
    assert.equal(parseAnchor(body), null);
  });

  test("a missing event parses to null (no durable key)", () => {
    const body = '```yaml alloc\nkind: occ\nids: ["#1"]\n```';
    assert.equal(parseAnchor(body), null);
  });

  test("renderAnchorBody rejects an unknown kind", () => {
    assert.throws(
      () => renderAnchorBody({ kind: "bogus", ids: [], event: "x" }),
      /unknown kind/,
    );
  });
});
