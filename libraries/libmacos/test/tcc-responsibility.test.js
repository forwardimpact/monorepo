import { test, describe } from "node:test";
import assert from "node:assert";
import { spy } from "@forwardimpact/libmock";
import { createTccSpawn } from "../src/tcc-responsibility.js";

describe("createTccSpawn", () => {
  function makeDeps({ exitCode = 0, stdout = "hello", stderr = "warn" } = {}) {
    return {
      spawn: spy(() => ({
        pid: 42,
        stdoutFile: "/tmp/fake-stdout",
        stderrFile: "/tmp/fake-stderr",
      })),
      waitForExit: spy(async () => exitCode),
      readOutput: spy((path) => (path.includes("stdout") ? stdout : stderr)),
    };
  }

  test("calls spawn, waitForExit, readOutput and returns result", async () => {
    const deps = makeDeps();
    const run = createTccSpawn(deps);

    const result = await run("/usr/bin/env", ["echo", "hi"]);

    assert.strictEqual(deps.spawn.mock.callCount(), 1);
    assert.strictEqual(deps.spawn.mock.calls[0].arguments[0], "/usr/bin/env");
    assert.deepStrictEqual(deps.spawn.mock.calls[0].arguments[1], [
      "echo",
      "hi",
    ]);

    assert.strictEqual(deps.waitForExit.mock.callCount(), 1);
    assert.strictEqual(deps.waitForExit.mock.calls[0].arguments[0], 42);

    assert.strictEqual(deps.readOutput.mock.callCount(), 2);

    assert.deepStrictEqual(result, {
      exitCode: 0,
      stdout: "hello",
      stderr: "warn",
    });
  });

  test("passes env and cwd through to spawn", async () => {
    const deps = makeDeps();
    const run = createTccSpawn(deps);
    const env = { HOME: "/test" };

    await run("/bin/sh", ["-c", "true"], env, "/tmp");

    assert.strictEqual(deps.spawn.mock.calls[0].arguments[2], env);
    assert.strictEqual(deps.spawn.mock.calls[0].arguments[3], "/tmp");
  });

  test("returns non-zero exit code from waitForExit", async () => {
    const deps = makeDeps({ exitCode: 1 });
    const run = createTccSpawn(deps);

    const result = await run("/bin/false", []);
    assert.strictEqual(result.exitCode, 1);
  });
});
