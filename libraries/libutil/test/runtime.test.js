import { test, describe } from "node:test";
import assert from "node:assert";

import { createTestRuntime } from "@forwardimpact/libmock";

import {
  createDefaultRuntime,
  createDefaultProc,
  createDefaultClock,
  createDefaultSubprocess,
} from "../src/runtime.js";

describe("createDefaultRuntime", () => {
  test("returns a frozen bag with every typedef field present", () => {
    const rt = createDefaultRuntime();
    assert.ok(Object.isFrozen(rt));
    for (const field of [
      "fs",
      "fsSync",
      "proc",
      "clock",
      "subprocess",
      "finder",
    ]) {
      assert.ok(rt[field] != null, `missing ${field}`);
    }
    assert.strictEqual(typeof rt.clock.now, "function");
    assert.strictEqual(typeof rt.subprocess.run, "function");
    assert.strictEqual(typeof rt.fs.readFile, "function");
    assert.strictEqual(typeof rt.fsSync.existsSync, "function");
  });
});

describe("createDefaultProc env Proxy", () => {
  test("reads pass through to the source env on every access", () => {
    const source = { env: { A: "1" }, argv: ["node", "x"] };
    const proc = createDefaultProc({ source, env: source.env });
    assert.strictEqual(proc.env.A, "1");
    source.env.A = "2";
    assert.strictEqual(proc.env.A, "2", "Proxy must read through live");
    source.env.B = "new";
    assert.strictEqual(proc.env.B, "new");
  });

  test("spread produces a non-empty plain object inheriting source env", () => {
    const source = { env: { A: "1", B: "2" }, argv: ["node", "x"] };
    const proc = createDefaultProc({ source, env: source.env });
    const spread = { ...proc.env, NEW_KEY: "x" };
    assert.strictEqual(spread.A, "1");
    assert.strictEqual(spread.B, "2");
    assert.strictEqual(spread.NEW_KEY, "x");
  });

  test("for-in iteration enumerates source keys", () => {
    const source = { env: { A: "1", B: "2" }, argv: ["node", "x"] };
    const proc = createDefaultProc({ source, env: source.env });
    const keys = [];
    for (const k in proc.env) keys.push(k);
    assert.deepStrictEqual(keys.sort(), ["A", "B"]);
  });

  test("set / delete write through to the source env", () => {
    const source = { env: { A: "1" }, argv: ["node", "x"] };
    const proc = createDefaultProc({ source, env: source.env });
    proc.env.C = "3";
    assert.strictEqual(source.env.C, "3");
    delete proc.env.A;
    assert.strictEqual("A" in source.env, false);
  });
});

describe("createDefaultProc exitCode", () => {
  test("assigning exitCode propagates to the source", () => {
    const source = { env: {}, argv: ["node", "x"], exitCode: 0 };
    const proc = createDefaultProc({ source, env: source.env });
    proc.exitCode = 1;
    assert.strictEqual(source.exitCode, 1);
    assert.strictEqual(proc.exitCode, 1);
  });
});

describe("createDefaultClock / createDefaultSubprocess", () => {
  test("clock.now is a number and sleep resolves", async () => {
    const clock = createDefaultClock();
    assert.strictEqual(typeof clock.now(), "number");
    await clock.sleep(1);
  });

  test("subprocess.run echoes via a real binary", async () => {
    const sub = createDefaultSubprocess();
    const result = await sub.run("node", ["-e", "process.stdout.write('hi')"]);
    assert.strictEqual(result.stdout, "hi");
    assert.strictEqual(result.exitCode, 0);
  });

  test("subprocess.run reports a numeric non-zero exit on a normal failure", async () => {
    const sub = createDefaultSubprocess();
    const result = await sub.run("node", ["-e", "process.exit(3)"]);
    assert.strictEqual(result.exitCode, 3);
    assert.strictEqual(typeof result.exitCode, "number");
  });

  test("subprocess.run returns a numeric exit code on spawn failure (ENOENT)", async () => {
    const sub = createDefaultSubprocess();
    const result = await sub.run("definitely-not-a-real-binary-xyz", []);
    assert.strictEqual(typeof result.exitCode, "number");
    assert.notStrictEqual(result.exitCode, 0);
  });
});

describe("createTestRuntime parity", () => {
  test("exposes the same field shape as the default runtime", () => {
    const rt = createTestRuntime();
    for (const field of [
      "fs",
      "fsSync",
      "proc",
      "clock",
      "subprocess",
      "finder",
    ]) {
      assert.ok(rt[field] != null, `missing ${field}`);
    }
  });
});
