import { describe, test } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// Validates the streaming subprocess.spawn surface end-to-end against a real
// child (plan-a-05-b, outpost: "spawn(...).kill(signal) must propagate to the
// child"). This is the same cancellation contract the long-running supervision
// path relies on; here we assert it against a real sleep-bound child. Lives in
// *.integration.test.js because it spawns a real process.

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
});
