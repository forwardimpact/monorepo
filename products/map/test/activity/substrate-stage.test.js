/**
 * Tests for `fit-map substrate stage` — uses injected dependency
 * overrides to stub out the Supabase CLI, mapClient, seed, provision,
 * and the self-smoke so the phase ordering is verifiable without a
 * live stack.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

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
        api_url: "http://supabase.local",
        anon_key: "anon-key",
      }),
    ),
  };
  return {
    createSupabaseCli: () => cliStub,
    createMapClient: () => ({ stub: true }),
    findDataDir: async () => "/tmp/data/pathway",
    loadSeed: async () => recorded("seed"),
    loadProvision: async () => recorded("provision"),
    loadSmoke: async () => recorded("smoke"),
  };
}

describe("substrate-stage phase ordering", () => {
  let invocations;
  let stdoutWrite;

  beforeEach(() => {
    invocations = [];
    delete process.env.SUBSTRATE_FORCE_EMPTY_CORPUS;
    stdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
  });

  afterEach(() => {
    delete process.env.SUBSTRATE_FORCE_EMPTY_CORPUS;
    process.stdout.write = stdoutWrite;
  });

  test("invokes phases in stack → url-discovery → migrate → seed → provision → smoke order", async () => {
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await runStageCommand({ config }, deps);
    assert.deepEqual(invocations, [
      "stack",
      "url-discovery",
      "migrate",
      "seed",
      "provision",
      "smoke",
    ]);
  });

  test("SUBSTRATE_FORCE_EMPTY_CORPUS=true short-circuits smoke phase with named error", async () => {
    process.env.SUBSTRATE_FORCE_EMPTY_CORPUS = "true";
    const deps = buildDeps({ invocations });
    const config = { supabaseJwtSecret: () => "secret" };
    await assert.rejects(
      () => runStageCommand({ config }, deps),
      /\[substrate stage: smoke\] empty corpus/,
    );
    assert.deepEqual(invocations, [
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
      () => runStageCommand({ config }, deps),
      /\[substrate stage: seed\] stubbed seed failure/,
    );
  });
});
