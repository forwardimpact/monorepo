import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { readPickMemory, appendPickMemory } from "../../src/lib/pick-memory.js";

// Integration test: the pick-memory log is read/appended on real disk, so it
// threads a real createDefaultRuntime().
const runtime = createDefaultRuntime();

describe("pick-memory round trip", () => {
  test("read-then-append preserves emails and respects window cap", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pickmem-"));
    try {
      const memoryPath = path.join(tmp, "wiki/kata-interview/picks.csv");
      assert.equal((await readPickMemory(memoryPath, 5, runtime)).size, 0);

      await appendPickMemory(
        memoryPath,
        { persona_email: "a@x", run_id: "1" },
        runtime,
      );
      await appendPickMemory(
        memoryPath,
        { persona_email: "b@x", run_id: "2" },
        runtime,
      );
      await appendPickMemory(
        memoryPath,
        { persona_email: "c@x", run_id: "3" },
        runtime,
      );

      const all = await readPickMemory(memoryPath, 5, runtime);
      assert.deepEqual([...all].sort(), ["a@x", "b@x", "c@x"]);

      const last2 = await readPickMemory(memoryPath, 2, runtime);
      assert.deepEqual([...last2].sort(), ["b@x", "c@x"]);

      const text = await readFile(memoryPath, "utf8");
      assert.match(text, /^picked_at,persona_email,run_id\n/);
      assert.match(text, /,a@x,1\n/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("readPickMemory returns an empty set when the file is absent", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "pickmem-"));
    try {
      const memoryPath = path.join(tmp, "wiki/kata-interview/picks.csv");
      const out = await readPickMemory(memoryPath, 5, runtime);
      assert.equal(out.size, 0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("windowN === 0 returns an empty set without reading", async () => {
    const memoryPath = "/definitely/does/not/exist/picks.csv";
    const out = await readPickMemory(memoryPath, 0, runtime);
    assert.equal(out.size, 0);
  });
});
