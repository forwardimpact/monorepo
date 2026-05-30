import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as libmock from "../src/index.js";

// Drift detection: every field on the production `Runtime` typedef
// must have a canonical libmock fake. Adding a field to `Runtime` without a
// fake (or an alias entry pointing at a real export) fails this test.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SRC = path.resolve(__dirname, "../../libutil/src/runtime.js");

// Field name on `Runtime` → the libmock factory that fakes it.
const FIELD_TO_FACTORY = {
  fs: "createMockFs",
  fsSync: "createMockFs",
  proc: "createMockProcess",
  clock: "createMockClock",
  subprocess: "createMockSubprocess",
  finder: "createMockFinder",
};

function runtimeFields() {
  const src = readFileSync(RUNTIME_SRC, "utf8");
  // Scope to the `Runtime` typedef block: from `@typedef ... Runtime` to the
  // closing `*/` of that comment.
  const block = src.match(/@typedef\s+\{Object\}\s+Runtime[\s\S]*?\*\//);
  assert.ok(block, "Runtime typedef block not found in libutil/src/runtime.js");
  const fields = [];
  const re = /@property\s+\{[^}]+\}\s+(\w+)/g;
  let m;
  while ((m = re.exec(block[0])) !== null) fields.push(m[1]);
  return fields;
}

describe("Runtime completeness", () => {
  test("every Runtime field maps to a libmock fake that is exported", () => {
    const fields = runtimeFields();
    assert.ok(fields.length >= 6, `expected >=6 fields, got ${fields.length}`);
    for (const field of fields) {
      const factory = FIELD_TO_FACTORY[field];
      assert.ok(
        factory,
        `Runtime field "${field}" has no libmock fake mapping — add it to FIELD_TO_FACTORY and libmock`,
      );
      assert.strictEqual(
        typeof libmock[factory],
        "function",
        `libmock does not export "${factory}" for Runtime field "${field}"`,
      );
    }
  });

  test("createTestRuntime returns every Runtime field non-null", () => {
    const rt = libmock.createTestRuntime();
    for (const field of runtimeFields()) {
      assert.ok(rt[field] != null, `createTestRuntime missing "${field}"`);
    }
    assert.ok(Object.isFrozen(rt), "test runtime should be frozen");
  });

  test("each Runtime field is independently overridable", () => {
    const sentinel = { sentinel: true };
    const rt = libmock.createTestRuntime({ clock: sentinel });
    assert.strictEqual(rt.clock, sentinel);
  });

  // SC7 covers every declared collaborator surface, not only the runtime-bag
  // fields — the typed clients (GitClient/GhClient) documented in the README
  // Collaborators section must also have exported fakes.
  test("declared non-bag collaborator surfaces have exported fakes", () => {
    for (const factory of ["createMockGitClient", "createMockGhClient"]) {
      assert.strictEqual(
        typeof libmock[factory],
        "function",
        `libmock must export ${factory}`,
      );
    }
  });
});
