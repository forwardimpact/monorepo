/**
 * Tests for `fit-map substrate stage` — uses injected dependency
 * overrides to stub out the init phase, Supabase CLI, mapClient, seed,
 * provision, and the self-smoke so the phase ordering is verifiable
 * without a live stack. The real-fs cases (copy-activity ENOENT, bootstrap
 * parity) live in substrate-stage.integration.test.js.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockProcess } from "@forwardimpact/libmock";

import { runStageCommand } from "../../src/commands/substrate-stage.js";

function buildDeps({ failPhase = null, invocations }) {
  function recorded(name, fn = async () => undefined) {
    return async (...args) => {
      invocations.push(name);
      if (failPhase === name) throw new Error(`stubbed ${name} failure`);
      return fn(...args);
    };
  }
  const cliStub = {
    run: async (args) => {
      if (args[0] === "start") return recorded("stack")();
      if (args[0] === "db" && args[1] === "reset") return recorded("migrate")();
      throw new Error(`unexpected supabase run: ${args.join(" ")}`);
    },
    capture: recorded("url-discovery", async () =>
      JSON.stringify({
        API_URL: "http://supabase.local",
        ANON_KEY: "anon-key",
      }),
    ),
  };
  return {
    loadInit: async () => recorded("init"),
    loadCopyActivity: async () => recorded("copy-activity"),
    createSupabaseCli: () => cliStub,
    createMapClient: () => ({ stub: true }),
    findDataDir: async () => "/tmp/data/pathway",
    loadSeed: async () => recorded("seed"),
    loadProvision: async () => recorded("provision"),
    loadSmoke: async () => recorded("smoke"),
    reloadConfig: async () => ({ supabaseJwtSecret: () => "secret" }),
  };
}

describe("substrate-stage phase ordering", () => {
  let invocations;
  let runtime;

  beforeEach(() => {
    invocations = [];
    // The url-discovery phase writes SUPABASE_URL/ANON_KEY to the injected
    // proc.env (a Proxy over a per-test backing object), so it never touches
    // the global process — no snapshot/restore needed. cwd defaults to a
    // fixed mock value; tests that need an explicit target pass it.
    runtime = createTestRuntime({
      proc: createMockProcess({ cwd: "/work" }),
    });
  });

  test("invokes phases in init → copy-activity → stack → url-discovery → migrate → seed → provision → smoke order", async () => {
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await runStageCommand({ config, runtime }, deps);
    assert.deepEqual(invocations, [
      "init",
      "copy-activity",
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
      "smoke",
    ]);
  });

  test("SUBSTRATE_FORCE_EMPTY_CORPUS=true short-circuits smoke phase with named error", async () => {
    runtime.proc.env.SUBSTRATE_FORCE_EMPTY_CORPUS = "true";
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config, runtime }, deps),
      /\[substrate stage: smoke\] empty corpus/,
    );
    assert.deepEqual(invocations, [
      "init",
      "copy-activity",
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
    ]);
  });

  test("each phase failure is wrapped in [substrate stage: <phase>] prefix", async () => {
    const deps = buildDeps({ invocations, failPhase: "seed" });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config, runtime }, deps),
      /\[substrate stage: seed\] stubbed seed failure/,
    );
  });

  test("explicit target is plumbed to the init phase", async () => {
    let initTarget;
    const deps = buildDeps({ invocations });
    deps.loadInit = async () => async (t) => {
      invocations.push("init");
      initTarget = t;
    };
    const config = { supabaseJwtSecret: () => "secret" };
    // The target is only threaded through to the init phase and asserted —
    // never read or written — so a fixed in-memory path suffices.
    const target = "/substrate-target";
    await runStageCommand({ config, target, runtime }, deps);
    assert.equal(initTarget, target);
  });
});
