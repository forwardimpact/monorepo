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
// or a `.ts` import (node 22 has no TS loader — ERR_UNKNOWN_FILE_EXTENSION). Every
// gate exemption must carry one, or it is exempting a file node could have run.
const NODE_UNLOADABLE =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](?:bun:test|[^"']*\.ts)["']/;

// The gate set has ONE source of truth: if `test:gate`'s selector and the
// `test` script's selector fork, the gate set forks. This test
// reconstructs the `test` script's `find … | xargs bun test` command from the
// gate wrapper's exported selector and asserts package.json's `test` script
// begins with it byte-for-byte, so a drift in either reddens the gate. The
// `test` script may append bun runner flags (e.g. `--timeout=30000`) after the
// shared selector — those tune the informational bun loop and do not change the
// gate set; only the selector prefix is the single source of truth.
describe("test:gate selector is the single source of truth", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );

  test("package.json `test` selector equals the gate wrapper's selector", () => {
    // Shell-quote the predicate as it appears in package.json: glob/path values
    // are single-quoted, the flags are bare.
    const predicate = SELECTOR_PREDICATE.map((part) =>
      part.startsWith("-") ? part : `'${part}'`,
    );
    const findCmd = `find ${SELECTOR_DIRS.join(" ")} ${predicate.join(" ")}`;
    const prefix = `${findCmd} | xargs bun test`;
    assert.ok(
      pkg.scripts.test === prefix || pkg.scripts.test.startsWith(`${prefix} `),
      `package.json \`test\` selector drifted from scripts/test-gate.mjs SELECTOR_DIRS/SELECTOR_PREDICATE — they must stay identical. Expected \`test\` to be (or start with) "${prefix}", got "${pkg.scripts.test}"`,
    );
  });
});

// The node gate exempts a small, enumerated set of bun-only files that
// `node --test` structurally cannot load (the `.ts`-importing Supabase
// edge-function tests). These assertions keep the exemption honest: it must stay
// non-vacuous (each exempt file is genuinely node-unloadable, so it is never
// exempting a file node could have run), and the guard's exemption must stay a
// subset of the gate's (a file kept out of the node gate but still flagged by the
// guard would never go green).
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
        `gate-exempt path has no node-unloadable import — node --test could run it, so it must not be exempted: ${rel}`,
      );
    }
  });

  test("the bun:test guard exemption is a subset of the gate exemption", () => {
    const gate = new Set(GATE_EXEMPT_PATHS);
    for (const rel of EXEMPT_RELATIVE_PATHS) {
      assert.ok(
        gate.has(rel),
        `${rel} is exempt from the bun:test guard but not from the node gate — the node gate would still try to load it and fail`,
      );
    }
  });
});
