/**
 * Unit test for `fit-map substrate stage --emit-env`.
 *
 * Every phase collaborator is stubbed (init, copy-activity, seed, provision,
 * smoke, config reload) and a fake Supabase CLI returns a scripted
 * `status --output json`, so the test isolates the `url-discovery` phase and
 * asserts that `--emit-env` appends the two `KEY=value` lines — the same emit
 * shape as `fit-terrain substrate up`. All other phases stay untouched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runStageCommand } from "../src/commands/substrate-stage.js";

function stubDeps(statusJson) {
  const noop = async () => {};
  return {
    loadInit: () => async () => {},
    loadCopyActivity: () => async () => {},
    createSupabaseCli: () => ({
      run: async () => {},
      capture: async () => statusJson,
    }),
    findDataDir: async () => "/data/synthetic",
    createMapClient: () => ({}),
    loadSeed: () => noop,
    loadProvision: () => noop,
    loadSmoke: () => noop,
    reloadConfig: () => ({}),
  };
}

describe("fit-map substrate stage --emit-env", () => {
  test("appends SUPABASE_URL and SUPABASE_ANON_KEY after url-discovery", async () => {
    const runtime = createTestRuntime();
    const code = await runStageCommand(
      {
        config: {},
        target: "/agent-cwd",
        emitEnv: "/tmp/gh-env",
        runtime,
      },
      stubDeps(
        JSON.stringify({
          API_URL: "http://127.0.0.1:54321",
          ANON_KEY: "anon-x",
        }),
      ),
    );

    assert.equal(code, 0);
    const written = await runtime.fs.readFile("/tmp/gh-env", "utf8");
    assert.equal(
      written,
      "SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_ANON_KEY=anon-x\n",
    );
  });

  test("without emit-env, writes nothing but still discovers", async () => {
    const runtime = createTestRuntime();
    const code = await runStageCommand(
      { config: {}, target: "/agent-cwd", runtime },
      stubDeps(JSON.stringify({ API_URL: "http://u", ANON_KEY: "k" })),
    );

    assert.equal(code, 0);
    assert.equal(runtime.proc.env.SUPABASE_URL, "http://u");
    assert.equal(runtime.proc.env.SUPABASE_ANON_KEY, "k");
  });
});
