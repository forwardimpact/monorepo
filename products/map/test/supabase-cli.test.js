/**
 * Unit tests for the Supabase CLI wrapper factory.
 *
 * Uses a manually-constructed fake spawn (matching the DI fake-client
 * pattern in test/activity/storage.test.js) so we can drive the probe logic
 * without a real `supabase` or `npx` binary on PATH.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";

import { createSupabaseCli } from "../bin/lib/supabase-cli.js";
import { getPackageRoot } from "../bin/lib/package-root.js";

/**
 * Build a fake spawn function that returns scripted responses in order.
 * @param {Array<{kind: "exit" | "error", code?: number}>} responses
 */
function createFakeSpawn(responses) {
  let i = 0;
  function spawnFn(cmd, args, options) {
    spawnFn.calls.push({ cmd, args, options });
    const ee = new EventEmitter();
    const r = responses[i++] ?? { kind: "exit", code: 0 };
    Promise.resolve().then(() => {
      if (r.kind === "error") ee.emit("error", new Error("ENOENT"));
      else ee.emit("exit", r.code ?? 0);
    });
    return ee;
  }
  spawnFn.calls = [];
  return spawnFn;
}

describe("supabase-cli", () => {
  test("bare supabase succeeds → resolves supabase descriptor", async () => {
    const spawnFn = createFakeSpawn([{ kind: "exit", code: 0 }]);
    const cli = createSupabaseCli({ spawnFn });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, { cmd: "supabase", prefix: [] });
    assert.strictEqual(spawnFn.calls.length, 1);
    assert.strictEqual(spawnFn.calls[0].cmd, "supabase");
    assert.deepStrictEqual(spawnFn.calls[0].args, ["--version"]);
    assert.strictEqual(spawnFn.calls[0].options.cwd, getPackageRoot());
    assert.strictEqual(spawnFn.calls[0].options.stdio, "ignore");
  });

  test("bare supabase errors (ENOENT), npx succeeds → npx descriptor", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "error" },
      { kind: "exit", code: 0 },
    ]);
    const cli = createSupabaseCli({ spawnFn });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, {
      cmd: "npx",
      prefix: ["--no-install", "--", "supabase"],
    });
    assert.strictEqual(spawnFn.calls.length, 2);
    assert.strictEqual(spawnFn.calls[1].cmd, "npx");
    assert.deepStrictEqual(spawnFn.calls[1].args, [
      "--no-install",
      "--",
      "supabase",
      "--version",
    ]);
    assert.strictEqual(spawnFn.calls[1].options.cwd, getPackageRoot());
  });

  test("bare supabase exits non-zero, npx succeeds → npx descriptor", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "exit", code: 1 },
      { kind: "exit", code: 0 },
    ]);
    const cli = createSupabaseCli({ spawnFn });
    const desc = await cli.resolve();
    assert.deepStrictEqual(desc, {
      cmd: "npx",
      prefix: ["--no-install", "--", "supabase"],
    });
    assert.strictEqual(spawnFn.calls.length, 2);
  });

  test("both probes fail → run rejects with install instructions", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "error" },
      { kind: "exit", code: 1 },
    ]);
    const cli = createSupabaseCli({ spawnFn });
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
    const spawnFn = createFakeSpawn([{ kind: "exit", code: 0 }]);
    const cli = createSupabaseCli({ spawnFn });
    const first = await cli.resolve();
    const second = await cli.resolve();
    assert.deepStrictEqual(first, second);
    assert.strictEqual(spawnFn.calls.length, 1);
  });

  test("separate instances do not share cached descriptors", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "exit", code: 0 },
      { kind: "exit", code: 0 },
    ]);
    const a = createSupabaseCli({ spawnFn });
    const b = createSupabaseCli({ spawnFn });
    await a.resolve();
    await b.resolve();
    assert.strictEqual(spawnFn.calls.length, 2);
  });

  test("run invokes the resolved bare-supabase descriptor", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "exit", code: 0 }, // bare supabase probe
      { kind: "exit", code: 0 }, // actual db reset
    ]);
    const cli = createSupabaseCli({ spawnFn });
    await cli.run(["db", "reset"]);
    assert.strictEqual(spawnFn.calls.length, 2);

    // Probe call
    assert.strictEqual(spawnFn.calls[0].cmd, "supabase");
    assert.deepStrictEqual(spawnFn.calls[0].args, ["--version"]);

    // Execution call
    const execCall = spawnFn.calls[1];
    assert.strictEqual(execCall.cmd, "supabase");
    assert.deepStrictEqual(execCall.args, ["db", "reset"]);
    assert.strictEqual(execCall.options.cwd, getPackageRoot());
    assert.strictEqual(execCall.options.stdio, "inherit");
  });

  test("run invokes the resolved npx descriptor", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "error" }, // bare supabase probe
      { kind: "exit", code: 0 }, // npx probe
      { kind: "exit", code: 0 }, // actual db reset
    ]);
    const cli = createSupabaseCli({ spawnFn });
    await cli.run(["db", "reset"]);
    assert.strictEqual(spawnFn.calls.length, 3);

    // Probe calls
    assert.strictEqual(spawnFn.calls[0].cmd, "supabase");
    assert.deepStrictEqual(spawnFn.calls[0].args, ["--version"]);
    assert.strictEqual(spawnFn.calls[1].cmd, "npx");
    assert.deepStrictEqual(spawnFn.calls[1].args, [
      "--no-install",
      "--",
      "supabase",
      "--version",
    ]);

    // Execution call
    const execCall = spawnFn.calls[2];
    assert.strictEqual(execCall.cmd, "npx");
    assert.deepStrictEqual(execCall.args, [
      "--no-install",
      "--",
      "supabase",
      "db",
      "reset",
    ]);
    assert.strictEqual(execCall.options.cwd, getPackageRoot());
    assert.strictEqual(execCall.options.stdio, "inherit");
  });

  test("run rejects when the spawned command exits non-zero", async () => {
    const spawnFn = createFakeSpawn([
      { kind: "exit", code: 0 }, // bare supabase probe
      { kind: "exit", code: 2 }, // actual db reset
    ]);
    const cli = createSupabaseCli({ spawnFn });
    await assert.rejects(
      () => cli.run(["db", "reset"]),
      /supabase db reset exited 2/,
    );
  });
});
