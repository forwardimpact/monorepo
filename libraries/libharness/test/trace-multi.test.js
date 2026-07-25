import { describe, test } from "node:test";
import assert from "node:assert";

import { runOver, aggregate, compareTwo } from "../src/trace-multi.js";

/**
 * Build a stub loader: maps a filename to a fixed TraceQuery-like object whose
 * methods the tests drive. The orchestrator only calls the injected `query`.
 */
function stubLoad(map) {
  return (file) => map[file];
}

describe("trace-multi", () => {
  describe("runOver", () => {
    test("tags source per record when N>1", () => {
      const load = stubLoad({
        "/dir/a.ndjson": { records: [{ x: 1 }] },
        "/dir/b.ndjson": { records: [{ x: 2 }] },
      });
      const out = runOver(
        ["/dir/a.ndjson", "/dir/b.ndjson"],
        (tq) => tq.records,
        load,
      );
      assert.strictEqual(out.length, 2);
      assert.strictEqual(out[0].source, "a.ndjson");
      assert.strictEqual(out[1].source, "b.ndjson");
    });

    test("does not tag source for a single file", () => {
      const load = stubLoad({ "/dir/a.ndjson": { records: [{ x: 1 }] } });
      const out = runOver(["/dir/a.ndjson"], (tq) => tq.records, load);
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].source, undefined);
    });
  });

  describe("aggregate", () => {
    test("merges counts and emits sources only when N>1", () => {
      const load = stubLoad({
        "/dir/a.ndjson": { rows: [{ path: "/p", count: 2 }] },
        "/dir/b.ndjson": { rows: [{ path: "/p", count: 3 }] },
      });
      const out = aggregate(
        ["/dir/a.ndjson", "/dir/b.ndjson"],
        (tq) => tq.rows,
        (r) => r.path,
        load,
      );
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].count, 5);
      assert.deepStrictEqual(out[0].sources, ["a.ndjson", "b.ndjson"]);
    });

    test("single file does not emit sources", () => {
      const load = stubLoad({
        "/dir/a.ndjson": { rows: [{ path: "/p", count: 2 }] },
      });
      const out = aggregate(
        ["/dir/a.ndjson"],
        (tq) => tq.rows,
        (r) => r.path,
        load,
      );
      assert.strictEqual(out[0].count, 2);
      assert.strictEqual(out[0].sources, undefined);
    });

    test("frequency-sorts merged records by count desc", () => {
      const load = stubLoad({
        "/dir/a.ndjson": {
          rows: [
            { path: "/low", count: 1 },
            { path: "/high", count: 4 },
          ],
        },
        "/dir/b.ndjson": { rows: [{ path: "/high", count: 1 }] },
      });
      const out = aggregate(
        ["/dir/a.ndjson", "/dir/b.ndjson"],
        (tq) => tq.rows,
        (r) => r.path,
        load,
      );
      assert.strictEqual(out[0].path, "/high");
      assert.strictEqual(out[0].count, 5);
    });
  });

  describe("compareTwo", () => {
    // parseIdentity itself is covered in trace-identity.test.js; this keeps
    // the identity-threading contract against the imported function.
    test("threads basename-derived identity into compare()", () => {
      const calls = [];
      const fakeQuery = (name) => ({
        compare(other, identities) {
          calls.push({ name, identities });
          return { ok: true };
        },
      });
      const load = stubLoad({
        "/d/trace--case1--alice.agent.ndjson": fakeQuery("a"),
        "/d/plain.ndjson": fakeQuery("b"),
      });
      const result = compareTwo(
        "/d/trace--case1--alice.agent.ndjson",
        "/d/plain.ndjson",
        load,
      );
      assert.deepStrictEqual(result, { ok: true });
      assert.deepStrictEqual(calls[0].identities.aIdentity, {
        caseName: "case1",
        participant: "alice",
      });
      assert.deepStrictEqual(calls[0].identities.bIdentity, {
        caseName: "plain",
        participant: null,
      });
    });
  });
});
