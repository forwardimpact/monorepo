import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { LongrunProcess } from "../src/longrun.js";

// Real-process supervision: spawns an actual bash child and drives it through
// the real runtime.subprocess.spawn streaming contract (real pid, real exit,
// real process-group kill). Lives in *.integration.test.js because it spawns.

describe("LongrunProcess integration", () => {
  let mockStdout;
  let mockStderr;
  let runtime;

  beforeEach(() => {
    mockStdout = new PassThrough();
    mockStderr = new PassThrough();
    runtime = createDefaultRuntime();
  });

  test("start and stop short-lived process", async () => {
    const longrun = new LongrunProcess("quick", "echo hello && exit 0", {
      runtime,
      stdout: mockStdout,
      stderr: mockStderr,
      config: {
        minRestartDelay: 10,
        maxRestartDelay: 50,
      },
    });

    const events = [];
    longrun.on("up", (e) => events.push({ type: "up", ...e }));
    longrun.on("backoff", (e) => events.push({ type: "backoff", ...e }));
    longrun.on("down", (e) => events.push({ type: "down", ...e }));

    await longrun.start();

    // Wait for process to spawn and emit up event
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Stop the process
    await longrun.stop(1000);

    assert.strictEqual(longrun.getState().state, "down");
    assert.ok(events.some((e) => e.type === "up"));
  });
});
