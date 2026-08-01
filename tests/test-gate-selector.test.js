import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXEMPT_RELATIVE_PATHS } from "../scripts/check-bun-test-imports.mjs";
import {
  GATE_EXEMPT_PATHS,
  SELECTOR_DIRS,
  SELECTOR_PREDICATE,
} from "../scripts/test-gate.mjs";

const repoRoot = join(import.meta.dirname, "..");
// A node-unloadable import: a `bun:test` specifier (ERR_UNSUPPORTED_ESM_URL_SCHEME)
// or a `.ts` import (ERR_UNKNOWN_FILE_EXTENSION, because node 22 has no TS
// loader). Every gate exemption must carry one. An exemption without one
// exempts a file that node could run.
const NODE_UNLOADABLE =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](?:bun:test|[^"']*\.ts)["']/;

// The gate set has ONE source of truth: if `test:gate`'s selector and the
// `test` script's selector fork, the gate set forks. This test reconstructs
// the `test` script's `find … | xargs bun test` command from the gate
// wrapper's exported selector. It then asserts that package.json's `test`
// script begins with that command byte-for-byte. A drift in either one
// reddens the gate. The `test` script may append bun runner flags
// (e.g. `--timeout=30000`) after the shared selector. Those flags tune the
// informational bun loop. They do not change the gate set. Only the selector
// prefix is the single source of truth.
describe("test:gate selector is the single source of truth", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );

  test("package.json `test` selector equals the gate wrapper's selector", () => {
    // Shell-quote the predicate as it appears in package.json. The glob and
    // path values take single quotes. The flags stay bare.
    const predicate = SELECTOR_PREDICATE.map((part) =>
      part.startsWith("-") ? part : `'${part}'`,
    );
    const findCmd = `find ${SELECTOR_DIRS.join(" ")} ${predicate.join(" ")}`;
    const prefix = `${findCmd} | xargs bun test`;
    assert.ok(
      pkg.scripts.test === prefix || pkg.scripts.test.startsWith(`${prefix} `),
      `package.json \`test\` selector drifted from scripts/test-gate.mjs SELECTOR_DIRS/SELECTOR_PREDICATE. They must stay identical. Expected \`test\` to be (or start with) "${prefix}", got "${pkg.scripts.test}"`,
    );
  });
});

// The node gate exempts a small, enumerated set of bun-only files that
// `node --test` structurally cannot load. Those files are the Supabase
// edge-function tests that import `.ts` files. These assertions keep the
// exemption honest. The exemption must stay non-vacuous. Each exempt file is
// genuinely node-unloadable, so the gate never exempts a file that node could
// run. The guard's exemption must also stay a subset of the gate's exemption.
// A file that the node gate keeps out but the guard still flags would never
// go green.
describe("node-gate exemptions are bounded and justified", () => {
  test("every gate-exempt path exists, matches the selector, and is node-unloadable", () => {
    for (const rel of GATE_EXEMPT_PATHS) {
      const full = join(repoRoot, rel);
      assert.ok(existsSync(full), `gate-exempt path missing: ${rel}`);
      assert.ok(
        rel.endsWith(".test.js"),
        `gate-exempt path is not a *.test.js selector match: ${rel}`,
      );
      assert.match(
        readFileSync(full, "utf8"),
        NODE_UNLOADABLE,
        `gate-exempt path has no node-unloadable import. node --test could run it, so do not exempt it: ${rel}`,
      );
    }
  });

  test("the bun:test guard exemption is a subset of the gate exemption", () => {
    const gate = new Set(GATE_EXEMPT_PATHS);
    for (const rel of EXEMPT_RELATIVE_PATHS) {
      assert.ok(
        gate.has(rel),
        `${rel} is exempt from the bun:test guard but not from the node gate. The node gate would still try to load it and fail`,
      );
    }
  });
});
