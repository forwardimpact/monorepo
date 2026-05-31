import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { OneshotProcess } from "../src/oneshot.js";

describe("OneshotProcess", () => {
  let stdout;
  let stderr;
  let outChunks;
  let errChunks;

  beforeEach(() => {
    stdout = new PassThrough();
    stderr = new PassThrough();
    outChunks = [];
    errChunks = [];
    stdout.on("data", (c) => outChunks.push(c.toString()));
    stderr.on("data", (c) => errChunks.push(c.toString()));
  });

  describe("constructor", () => {
    test("throws if name is missing", () => {
      assert.throws(() => new OneshotProcess(), /name is required/);
    });

    test("throws if runtime.subprocess is missing", () => {
      assert.throws(
        () => new OneshotProcess("init", { stdout, stderr }),
        /runtime\.subprocess is required/,
      );
    });

    test("throws if stdout is missing", () => {
      assert.throws(
        () => new OneshotProcess("init", { runtime: createTestRuntime() }),
        /options.stdout is required/,
      );
    });
  });

  describe("up / down via subprocess.spawn", () => {
    test("routes the command through subprocess.spawn and resolves exit", async () => {
      const subprocess = createMockSubprocess({
        responses: { bash: { stdout: "done\n", exitCode: 0 } },
      });
      const oneshot = new OneshotProcess("init", {
        runtime: createTestRuntime({ subprocess }),
        stdout,
        stderr,
      });

      const result = await oneshot.up("echo done");

      assert.deepStrictEqual(result, { code: 0, signal: null });
      const call = subprocess.calls.find((c) => c.cmd === "bash");
      assert.deepStrictEqual(call.args, ["-c", "echo done"]);
      assert.strictEqual(call.opts.detached, false);
    });

    test("consumes the AsyncIterable stdout into the injected sink", async () => {
      const subprocess = createMockSubprocess({
        responses: { bash: { stdout: "hello-world\n" } },
      });
      const oneshot = new OneshotProcess("init", {
        runtime: createTestRuntime({ subprocess }),
        stdout,
        stderr,
      });

      await oneshot.up("echo hello-world");

      assert.strictEqual(outChunks.join(""), "hello-world\n");
    });

    test("consumes the AsyncIterable stderr into the injected sink", async () => {
      const subprocess = createMockSubprocess({
        responses: { bash: { stderr: "oops\n", exitCode: 1 } },
      });
      const oneshot = new OneshotProcess("init", {
        runtime: createTestRuntime({ subprocess }),
        stdout,
        stderr,
      });

      const result = await oneshot.down("echo oops 1>&2; exit 1");

      assert.strictEqual(errChunks.join(""), "oops\n");
      assert.strictEqual(result.code, 1);
    });

    test("throws when spawn fails (no pid)", async () => {
      const subprocess = {
        spawn: () => ({
          stdout: { async *[Symbol.asyncIterator]() {} },
          stderr: { async *[Symbol.asyncIterator]() {} },
          stdin: null,
          exitCode: Promise.resolve(127),
          signal: Promise.resolve(null),
          kill: () => {},
          pid: undefined,
        }),
      };
      const oneshot = new OneshotProcess("init", {
        runtime: createTestRuntime({ subprocess }),
        stdout,
        stderr,
      });

      await assert.rejects(() => oneshot.up("bad"), /failed to spawn oneshot/);
    });
  });
});
