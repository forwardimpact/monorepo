import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  scanDir,
  scanWorkflowMarkdown,
  runCheck,
  CONTROL_PLANE_DIRS,
} from "../scripts/check-byok-boundary.mjs";

describe("check-byok-boundary scanner", () => {
  test("flags the deliberate violation fixture", () => {
    const violations = scanDir("scripts/test/byok-fixtures");
    const reasons = violations.map((v) => v.reason);
    assert.ok(
      reasons.some((r) => r.includes("@anthropic-ai dependency")),
      "should flag the top-level @anthropic-ai dependency",
    );
    assert.ok(
      reasons.some((r) => r.includes("imports from @anthropic-ai")),
      "should flag the @anthropic-ai import",
    );
    assert.ok(
      reasons.some((r) => r.includes("ANTHROPIC_")),
      "should flag the ANTHROPIC_ env read",
    );
  });

  test("does not false-positive on generic process.env destructuring", () => {
    // `const { PORT } = process.env` must not be read as an ANTHROPIC_* breach.
    assert.deepEqual(scanDir("scripts/test/byok-fixtures/clean"), []);
  });

  test("every control-plane directory is clean", () => {
    for (const dir of CONTROL_PLANE_DIRS) {
      assert.deepEqual(
        scanDir(dir),
        [],
        `${dir} must carry no BYOK-boundary breach`,
      );
    }
  });

  test("workflow markdown scan ignores secrets.ANTHROPIC_API_KEY but flags code reads", () => {
    // A synthetic block: the secrets reference is expected BYOK; the
    // process.env read inside a fenced block is a breach.
    const clean = scanWorkflowMarkdown(
      "scripts/test/byok-fixtures/does-not-exist.md",
    );
    assert.deepEqual(clean, []);
  });

  test("the full check passes against the real tree", () => {
    assert.deepEqual(runCheck(), []);
  });
});
