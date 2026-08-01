import { describe, test } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

// This test validates the streaming subprocess.spawn surface end-to-end
// against a real child (plan-a-05-b, outpost: "spawn(...).kill(signal) must
// propagate to the child"). The long-running supervision path relies on the
// same cancellation contract. Here we assert that contract against a real
// sleep-bound child. The test lives in *.integration.test.js because it
// spawns a real process.

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
    // The signal terminated the child. The child never ran to completion.
    assert.ok(
      signal === "SIGTERM" || code === 128 || code !== 0,
      `expected a signal-terminated child, got code=${code} signal=${signal}`,
    );
  });
});
