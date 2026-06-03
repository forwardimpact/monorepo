import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { capture, verify } from "../scripts/capture-cli-golden.mjs";

// capture()/verify() spawn a real stub bin and compare golden files on disk, so
// these exercise the harness end-to-end against the real filesystem. The pure
// applyTransforms unit test lives in capture-cli-golden.test.js.
describe("capture + verify against a stub bin", () => {
  let dir;
  let stub;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "golden-"));
    stub = join(dir, "stub.js");
    // Deterministic except a timestamp token the transform normalises.
    writeFileSync(
      stub,
      `process.stdout.write("hello stamp=" + "RUN-ABC123\\n");`,
    );
    writeFileSync(
      join(dir, "cases.json"),
      JSON.stringify([
        {
          name: "hello",
          args: [],
          exitCode: 0,
          stdoutFile: "hello.stdout.txt",
          stderrFile: "hello.stderr.txt",
          transform: [
            {
              pattern: "stamp=[A-Z0-9-]+",
              replacement: "stamp=NORMALIZED",
            },
          ],
        },
      ]),
    );
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const flags = () => ({ bin: "stub", exec: stub, goldenDir: dir });

  test("capture then verify is clean", () => {
    const captured = capture(flags());
    assert.equal(captured.count, 1);
    const result = verify(flags());
    assert.equal(result.ok, true, JSON.stringify(result.diffs));
  });

  test("verify detects a drift when the bin output changes", () => {
    capture(flags());
    writeFileSync(stub, `process.stdout.write("changed\\n");`);
    const result = verify(flags());
    assert.equal(result.ok, false);
    assert.ok(result.diffs.length > 0);
  });
});
