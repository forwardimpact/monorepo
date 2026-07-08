/**
 * `substrate pick` — memory on/off, window generalization, and the
 * declared-degradation payload (`selection_metadata.applied_invariants`).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runSubstratePick } from "../src/commands/substrate-pick.js";
import {
  makeSubstrateStub,
  invariantSatisfyingSeed,
} from "./substrate-stubs.js";

function stdoutJson(runtime) {
  return JSON.parse(runtime.proc.stdout.chunks.join(""));
}

/** Seed where both mgr@x and mgr2@x qualify, for memory diversification. */
function twoQualifyingSeed() {
  const seed = invariantSatisfyingSeed();
  seed.people.push(
    {
      email: "mgr2@x",
      name: "Mgr Two",
      kind: "human",
      manager_email: "top@x",
      team_id: "team-b",
      team_name: "Team B",
      discipline: "software",
      level: "senior",
      track: "management",
    },
    {
      email: "dev3@x",
      name: "Dev Three",
      kind: "human",
      manager_email: "mgr2@x",
      team_id: "team-b",
      team_name: "Team B",
      discipline: "software",
      level: "junior",
      track: "individual_contributor",
    },
  );
  seed.evidence.push({ email: "mgr2@x" }, { email: "dev3@x" });
  return seed;
}

describe("substrate pick", () => {
  test("stateless without --memory: no file read or written", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const runtime = createTestRuntime();
    const code = await runSubstratePick({ supabase, options: {}, runtime });
    assert.equal(code, 0);

    const payload = stdoutJson(runtime);
    assert.equal(payload.personas.length, 1);
    assert.equal(payload.personas[0].email, "mgr@x");
    assert.deepEqual(payload.selection_metadata.applied_invariants, [
      "structural",
      "evidence",
    ]);
    assert.equal(payload.selection_metadata.memory_window, null);
    assert.equal(
      payload.selection_metadata.signals.includes("memory_diversification"),
      false,
    );
    assert.equal(runtime.fs.data.size, 0);
  });

  test("--memory diversifies against recent picks and appends the pick", async () => {
    const supabase = makeSubstrateStub(twoQualifyingSeed());
    const runtime = createTestRuntime({
      fs: undefined,
    });
    const memory = "/work/picks.csv";
    await runtime.fs.writeFile(
      memory,
      "picked_at,persona_email,run_id\n2026-07-01T00:00:00.000Z,mgr@x,1\n",
    );

    const code = await runSubstratePick({
      supabase,
      options: { memory: "picks.csv" },
      runtime,
      cwd: "/work",
      env: { GITHUB_RUN_ID: "42" },
    });
    assert.equal(code, 0);

    const payload = stdoutJson(runtime);
    assert.equal(payload.personas[0].email, "mgr2@x");
    assert.equal(payload.selection_metadata.memory_window, 5);
    assert.ok(
      payload.selection_metadata.signals.includes("memory_diversification"),
    );

    const log = runtime.fs.data.get(memory);
    assert.match(log, /mgr2@x,42\n$/);
  });

  test("exits 1 when every qualifier is inside the memory window", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const runtime = createTestRuntime();
    const memory = "/work/picks.csv";
    await runtime.fs.writeFile(
      memory,
      "picked_at,persona_email,run_id\n2026-07-01T00:00:00.000Z,mgr@x,1\n",
    );
    const code = await runSubstratePick({
      supabase,
      options: { memory: memory },
      runtime,
      cwd: "/work",
    });
    assert.equal(code, 1);
    assert.match(
      runtime.proc.stderr.chunks.join(""),
      /no candidate diversifies against last 5 picks/,
    );
  });

  test("--memory-window generalizes the window", async () => {
    const supabase = makeSubstrateStub(invariantSatisfyingSeed());
    const runtime = createTestRuntime();
    const memory = "/work/picks.csv";
    await runtime.fs.writeFile(
      memory,
      "picked_at,persona_email,run_id\n2026-07-01T00:00:00.000Z,mgr@x,1\n",
    );
    // Window 0 disables diversification: the recent pick is eligible again.
    const code = await runSubstratePick({
      supabase,
      options: { memory: memory, memoryWindow: "0" },
      runtime,
      cwd: "/work",
    });
    assert.equal(code, 0);
    assert.equal(stdoutJson(runtime).personas[0].email, "mgr@x");
  });

  test("reports structural-only degradation without substrate.evidence", async () => {
    const seed = invariantSatisfyingSeed();
    seed.evidence = null;
    const supabase = makeSubstrateStub(seed);
    const runtime = createTestRuntime();
    const code = await runSubstratePick({ supabase, options: {}, runtime });
    assert.equal(code, 0);
    assert.deepEqual(
      stdoutJson(runtime).selection_metadata.applied_invariants,
      ["structural"],
    );
  });

  test("exits 1 with the diagnostic when nobody qualifies", async () => {
    const supabase = makeSubstrateStub({ people: [] });
    const runtime = createTestRuntime();
    const code = await runSubstratePick({ supabase, options: {}, runtime });
    assert.equal(code, 1);
    assert.match(
      runtime.proc.stderr.chunks.join(""),
      /substrate pick: no kind=human rows/,
    );
  });
});
