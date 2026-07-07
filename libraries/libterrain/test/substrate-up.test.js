/**
 * Unit tests for `fit-terrain substrate up` (generic Supabase bring-up).
 *
 * The Supabase spawner is injected so the bring-up + emit logic is exercised
 * without a real `supabase` binary: a fake spawner records `start` and returns
 * a scripted `status --output json`. Assertions cover the two emitted
 * `KEY=value` lines, the explicit cwd threaded to the spawner, and the
 * fail-closed paths when status omits a field.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import {
  runSubstrateUp,
  createSupabaseSpawner,
} from "../src/commands/substrate-up.js";

/**
 * A fake spawner factory: records the cwd it was built with and every `run`
 * call, and returns `statusJson` from `capture`.
 */
function fakeSpawner(statusJson, sink) {
  return ({ cwd }) => {
    sink.cwd = cwd;
    return {
      run: async (args) => {
        sink.runs.push(args);
      },
      capture: async (args) => {
        sink.captures.push(args);
        return statusJson;
      },
    };
  };
}

describe("fit-terrain substrate up", () => {
  test("emit-env writes SUPABASE_URL and SUPABASE_ANON_KEY", async () => {
    const runtime = createTestRuntime();
    const sink = { runs: [], captures: [] };
    const code = await runSubstrateUp({
      cwd: "/checkout",
      emitEnv: "/tmp/gh-env",
      runtime,
      createSpawner: fakeSpawner(
        JSON.stringify({
          API_URL: "http://127.0.0.1:54321",
          ANON_KEY: "anon-x",
        }),
        sink,
      ),
    });

    assert.equal(code, 0);
    assert.deepEqual(sink.runs[0], ["start"]);
    assert.equal(sink.cwd, "/checkout");
    const written = await runtime.fs.readFile("/tmp/gh-env", "utf8");
    assert.equal(
      written,
      "SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_ANON_KEY=anon-x\n",
    );
  });

  test("without emit-env, brings up but writes nothing", async () => {
    const runtime = createTestRuntime();
    const sink = { runs: [], captures: [] };
    const code = await runSubstrateUp({
      cwd: "/checkout",
      runtime,
      createSpawner: fakeSpawner(
        JSON.stringify({ API_URL: "http://u", ANON_KEY: "k" }),
        sink,
      ),
    });

    assert.equal(code, 0);
    assert.deepEqual(sink.runs[0], ["start"]);
    assert.equal(runtime.proc.env.SUPABASE_URL, "http://u");
    assert.equal(runtime.proc.env.SUPABASE_ANON_KEY, "k");
  });

  test("fails closed when status lacks API_URL", async () => {
    const runtime = createTestRuntime();
    const sink = { runs: [], captures: [] };
    await assert.rejects(
      () =>
        runSubstrateUp({
          cwd: "/checkout",
          emitEnv: "/tmp/gh-env",
          runtime,
          createSpawner: fakeSpawner(JSON.stringify({ ANON_KEY: "k" }), sink),
        }),
      /no API_URL/,
    );
  });

  test("spawner resolves bare supabase and threads cwd", async () => {
    const calls = [];
    const runtime = createTestRuntime({
      subprocess: {
        run: async (cmd, args, opts) => {
          calls.push({ cmd, args, opts, kind: "run" });
          return { exitCode: 0, stdout: "{}", stderr: "" };
        },
        spawn: (cmd, args, opts) => {
          calls.push({ cmd, args, opts, kind: "spawn" });
          return { exitCode: Promise.resolve(0) };
        },
      },
    });
    const spawner = createSupabaseSpawner({ runtime, cwd: "/checkout" });
    await spawner.run(["start"]);

    // First call probes bare `supabase --version` from the explicit cwd.
    assert.equal(calls[0].cmd, "supabase");
    assert.deepEqual(calls[0].args, ["--version"]);
    assert.equal(calls[0].opts.cwd, "/checkout");
    // Then `start` runs via spawn with inherited stdio from the same cwd.
    const spawnCall = calls.find((c) => c.kind === "spawn");
    assert.equal(spawnCall.cmd, "supabase");
    assert.deepEqual(spawnCall.args, ["start"]);
    assert.equal(spawnCall.opts.cwd, "/checkout");
    assert.equal(spawnCall.opts.stdio, "inherit");
  });
});
