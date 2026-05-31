/**
 * Unit tests for the Supabase CLI wrapper factory.
 *
 * Injects a mock `runtime.subprocess` (libmock `createMockSubprocess` via
 * `createTestRuntime`) so the probe/run/capture logic is exercised without a
 * real `supabase` or `npx` binary. `runtime.subprocess.run` resolves (never
 * rejects); probe failure surfaces as a non-zero `exitCode`.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  createTestRuntime,
  createMockSubprocess,
  assertRejectsMessage,
} from "@forwardimpact/libmock";

import { createSupabaseCli } from "../src/lib/supabase-cli.js";
import { getPackageRoot } from "../src/lib/package-root.js";

/**
 * Build a runtime whose subprocess `run` returns scripted exit codes in
 * order (probe + execution calls share the `run` sequence; `spawn` shares
 * the same response map keyed by cmd). Recorded invocations land on
 * `subprocess.calls` and the per-key `spawn` exitCode is read from the same
 * `responses` table.
 */
function runtimeWithSequence(runResponses, spawnResponses = {}) {
  let i = 0;
  const base = createMockSubprocess({ responses: spawnResponses });
  const calls = [];
  const subprocess = {
    calls,
    run: async (cmd, args = [], opts = {}) => {
      calls.push({ cmd, args, opts, kind: "run" });
      const r = runResponses[i++] ?? { exitCode: 0 };
      return {
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        exitCode: r.exitCode ?? 0,
        signal: null,
      };
    },
    runSync: base.runSync,
    spawn: (cmd, args = [], opts = {}) => {
      calls.push({ cmd, args, opts, kind: "spawn" });
      return base.spawn(cmd, args, opts);
    },
  };
  return createTestRuntime({ subprocess });
}

describe("supabase-cli", () => {
  test("bare supabase succeeds → resolves supabase descriptor", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, { cmd: "supabase", prefix: [] });
    assert.strictEqual(runtime.subprocess.calls.length, 1);
    assert.strictEqual(runtime.subprocess.calls[0].cmd, "supabase");
    assert.deepStrictEqual(runtime.subprocess.calls[0].args, ["--version"]);
    assert.strictEqual(runtime.subprocess.calls[0].opts.cwd, getPackageRoot());
  });

  test("bare supabase errors (exit 127), npx succeeds → npx descriptor", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 127 }, { exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, {
      cmd: "npx",
      prefix: ["--no-install", "--", "supabase"],
    });
    assert.strictEqual(runtime.subprocess.calls.length, 2);
    assert.strictEqual(runtime.subprocess.calls[1].cmd, "npx");
    assert.deepStrictEqual(runtime.subprocess.calls[1].args, [
      "--no-install",
      "--",
      "supabase",
      "--version",
    ]);
    assert.strictEqual(runtime.subprocess.calls[1].opts.cwd, getPackageRoot());
  });

  test("bare supabase exits non-zero, npx succeeds → npx descriptor", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 1 }, { exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, {
      cmd: "npx",
      prefix: ["--no-install", "--", "supabase"],
    });
    assert.strictEqual(runtime.subprocess.calls.length, 2);
  });

  test("both probes fail → run rejects with install instructions", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 127 }, { exitCode: 1 }]);
    const cli = createSupabaseCli({ runtime });
    await assert.rejects(
      () => cli.run(["start"]),
      (err) => {
        assert.ok(/brew install/.test(err.message), "mentions brew");
        assert.ok(/npm install/.test(err.message), "mentions npm install");
        assert.ok(/supabase\.com\/docs/.test(err.message), "includes docs URL");
        return true;
      },
    );
  });

  test("resolve memoizes across calls on the same instance", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    const first = await cli.resolve();
    const second = await cli.resolve();
    assert.deepStrictEqual(first, second);
    assert.strictEqual(runtime.subprocess.calls.length, 1);
  });

  test("separate instances do not share cached descriptors", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 0 }, { exitCode: 0 }]);
    const a = createSupabaseCli({ runtime });
    const b = createSupabaseCli({ runtime });
    await a.resolve();
    await b.resolve();
    assert.strictEqual(runtime.subprocess.calls.length, 2);
  });

  test("run invokes the resolved bare-supabase descriptor via spawn (inherit)", async () => {
    // Probe resolves bare supabase; the interactive run path uses spawn.
    const runtime = runtimeWithSequence([{ exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    await cli.run(["db", "reset"]);
    assert.strictEqual(runtime.subprocess.calls.length, 2);

    // Probe call (run)
    assert.strictEqual(runtime.subprocess.calls[0].cmd, "supabase");
    assert.deepStrictEqual(runtime.subprocess.calls[0].args, ["--version"]);

    // Execution call (spawn, inherited stdio)
    const execCall = runtime.subprocess.calls[1];
    assert.strictEqual(execCall.kind, "spawn");
    assert.strictEqual(execCall.cmd, "supabase");
    assert.deepStrictEqual(execCall.args, ["db", "reset"]);
    assert.strictEqual(execCall.opts.cwd, getPackageRoot());
    assert.strictEqual(execCall.opts.stdio, "inherit");
  });

  test("run invokes the resolved npx descriptor via spawn", async () => {
    const runtime = runtimeWithSequence([{ exitCode: 127 }, { exitCode: 0 }]);
    const cli = createSupabaseCli({ runtime });
    await cli.run(["db", "reset"]);
    assert.strictEqual(runtime.subprocess.calls.length, 3);

    // Probe calls
    assert.strictEqual(runtime.subprocess.calls[0].cmd, "supabase");
    assert.strictEqual(runtime.subprocess.calls[1].cmd, "npx");

    // Execution call (spawn)
    const execCall = runtime.subprocess.calls[2];
    assert.strictEqual(execCall.kind, "spawn");
    assert.strictEqual(execCall.cmd, "npx");
    assert.deepStrictEqual(execCall.args, [
      "--no-install",
      "--",
      "supabase",
      "db",
      "reset",
    ]);
    assert.strictEqual(execCall.opts.cwd, getPackageRoot());
    assert.strictEqual(execCall.opts.stdio, "inherit");
  });

  test("run rejects when the spawned command exits non-zero", async () => {
    // Probe ok (run), then spawn for `db reset` resolves exitCode 2.
    const runtime = runtimeWithSequence([{ exitCode: 0 }], {
      supabase: { exitCode: 2 },
    });
    const cli = createSupabaseCli({ runtime });
    await assertRejectsMessage(
      () => cli.run(["db", "reset"]),
      /supabase db reset exited 2/,
    );
  });
});
