import { describe, test } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { LongrunProcess } from "../src/longrun.js";

// Validates the streaming subprocess.spawn surface end-to-end against a real
// child (plan-a-05-b: "spawn(...).kill(signal) must reach a sleep-bound
// child"). Lives in *.integration.test.js because it spawns a real process.

describe("subprocess.spawn kill propagation (real child)", () => {
  test("kill(signal) terminates a sleep-bound child", async () => {
    const runtime = createDefaultRuntime();
    const child = runtime.subprocess.spawn("bash", ["-c", "sleep 30"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.notStrictEqual(child.pid, undefined, "child spawned with a pid");

    // Drain stdout so the AsyncIterable doesn't hold the event loop.
    void (async () => {
      for await (const _chunk of child.stdout) {
        // discard
      }
    })();

    child.kill("SIGTERM");

    const [code, signal] = await Promise.all([child.exitCode, child.signal]);
    // The child was terminated by the signal, never running to completion.
    assert.ok(
      signal === "SIGTERM" || code === 128 || code !== 0,
      `expected a signal-terminated child, got code=${code} signal=${signal}`,
    );
  });

  test("LongrunProcess.signal reaches the process group of a real child", async () => {
    const runtime = createDefaultRuntime();
    const longrun = new LongrunProcess("sleeper", "sleep 30", {
      runtime,
      stdout: { write: () => true },
      stderr: { write: () => true },
      config: { minRestartDelay: 10, maxRestartDelay: 50 },
    });

    const downs = [];
    longrun.on("down", (e) => downs.push(e));

    await longrun.start();
    // Give the child a moment to be fully up.
    await new Promise((r) => setTimeout(r, 50));

    // stop() sends SIGTERM to the negative pid (the whole process group) and
    // resolves once the child exits.
    await longrun.stop(2000);

    assert.strictEqual(longrun.getState().state, "down");
  });
});
