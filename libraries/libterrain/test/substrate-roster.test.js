/**
 * `substrate roster` — operator surface over the same persona query as
 * `pick`: table output by default, enriched JSON with the
 * declared-degradation metadata on `--format json`, and the binding
 * diagnostic on an empty result.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runSubstrateRoster } from "../src/commands/substrate-roster.js";
import {
  makeSubstrateStub,
  invariantSatisfyingSeed,
} from "./substrate-stubs.js";

function stdoutText(runtime) {
  return runtime.proc.stdout.chunks.join("");
}

describe("substrate roster", () => {
  test("default output is a table over the operator columns", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const runtime = createTestRuntime();
    const code = await runSubstrateRoster({ supabase, options: {}, runtime });
    assert.equal(code, 0);
    const out = stdoutText(runtime);
    for (const header of ["email", "discipline", "manages_count"]) {
      assert.ok(out.includes(header), `missing table header ${header}`);
    }
    assert.ok(out.includes("mgr@x"));
  });

  test("--format json returns every qualifier with applied_invariants", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const runtime = createTestRuntime();
    const code = await runSubstrateRoster({
      supabase,
      options: { format: "json" },
      runtime,
    });
    assert.equal(code, 0);
    const payload = JSON.parse(stdoutText(runtime));
    assert.equal(payload.personas.length, 1);
    assert.equal(payload.personas[0].email, "mgr@x");
    assert.deepEqual(payload.selection_metadata.applied_invariants, [
      "structural",
      "evidence",
    ]);
  });

  test("exits 1 with the binding diagnostic on an empty result", async () => {
    const seed = invariantSatisfyingSeed();
    seed.evidence = [];
    const supabase = makeSubstrateStub(seed);
    const runtime = createTestRuntime();
    const code = await runSubstrateRoster({ supabase, options: {}, runtime });
    assert.equal(code, 1);
    assert.match(
      runtime.proc.stderr.chunks.join(""),
      /substrate roster: no invariant-satisfying persona — binding constraint: authors_evidence/,
    );
  });
});
