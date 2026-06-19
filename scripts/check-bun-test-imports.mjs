#!/usr/bin/env node
// Re-divergence guard: fail CI on any `bun:test` module-specifier statement
// anywhere in the repo, except the sanctioned paths in EXEMPT_PATHS. The whole
// suite is converged onto `node:test`, so the baseline is one sanctioned file —
// "zero repo-wide bar one governed exemption" is simpler and strictly safer than
// scoping to the gate set, and keeps the gate runner able to load every file it
// is asked to run.
//
// Matches static import, re-export, `require()`, and dynamic `import()` of
// `bun:test` — NOT comment or doc-string mentions. `node --test` cannot resolve
// a `bun:` specifier (ERR_UNSUPPORTED_ESM_URL_SCHEME), so an import is the only
// thing that breaks the gate; a comment mention is harmless and must not trip.
//
// Wired as a dedicated required-workflow step (mirroring check-dependabot.mjs),
// not routed through the local-only `bun run check`/`context` aggregate.
//
// Exits 0 on a clean tree; exits 1 listing every offending `file:line`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const SELF = resolve(new URL(import.meta.url).pathname);

// The repo sanctions a bounded universal-subset `bun:test` allowlist
// (`describe`, `test`, `expect`, lifecycle hooks) in `**/*.test.js`, enforced by
// the AST-based invariant `.coaligned/invariants/bun-test-imports.rules.mjs`.
// That invariant's own regression test (`tests/bun-test-imports.test.js`)
// deliberately imports the allowlisted subset from `bun:test` and carries
// `bun:test` import strings as fixtures, so it is a bun-only test by design and
// cannot run under `node --test`. This guard exempts that one governed path
// rather than forbid it: the allowlist invariant owns which symbols this file may
// import; this guard keeps every other file off `bun:test` so the node gate can
// load it. The matching exemption in `scripts/test-gate.mjs` (GATE_EXEMPT_PATHS)
// keeps this file out of the node gate set. Exported (repo-relative) so
// `tests/test-gate-selector.test.js` can assert the guard exemption and the gate
// exemption stay in sync.
export const EXEMPT_RELATIVE_PATHS = ["tests/bun-test-imports.test.js"];
const EXEMPT_PATHS = new Set(
  EXEMPT_RELATIVE_PATHS.map((p) => resolve(repoRoot, p)),
);

// Matches a static/dynamic import, re-export, or require of the bun test
// module, with arbitrary whitespace before the quote. A naive pattern that
// requires the quote to abut the keyword would match none of the real imports
// (which have a space before the quote); this one is whitespace-tolerant.
const SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']bun:test["']/;

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "public",
  "coverage",
]);
const EXTS = new Set([".js", ".mjs", ".cjs", ".jsx"]);

/**
 * Recursively collect candidate source files under `dir`.
 * @param {string} dir - Directory to walk.
 * @param {string[]} out - Accumulator.
 * @returns {string[]} Collected absolute file paths.
 */
function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // broken symlink or vanished entry — skip
    }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) {
        walk(full, out);
      }
    } else if (EXTS.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan the repo and return every offending `file:line` (empty when clean).
 * @returns {string[]} Repo-relative `path:line` for each `bun:test` import.
 */
export function findOffenders() {
  const offenders = [];
  for (const file of walk(repoRoot, [])) {
    if (resolve(file) === SELF) {
      continue; // the guard's own source defines the pattern it searches for
    }
    if (EXEMPT_PATHS.has(resolve(file))) {
      continue; // the allowlist invariant sanctions the import here (see EXEMPT_PATHS)
    }
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Skip whole-line comments — a commented-out import is not an import and the
      // guard's contract is to flag imports, not mentions.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) {
        return;
      }
      if (SPECIFIER.test(line)) {
        offenders.push(`${relative(repoRoot, file)}:${i + 1}`);
      }
    });
  }
  return offenders;
}

// Run the scan only when invoked as the entry script, so the exports above can be
// imported by a test without executing the walk or calling process.exit.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const offenders = findOffenders();
  if (offenders.length > 0) {
    console.error(
      `check-bun-test-imports: found ${offenders.length} bun:test import statement(s) — ` +
        `node --test cannot resolve 'bun:' specifiers. Convert to node:test + ` +
        `@forwardimpact/libmock/expect:\n  ${offenders.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log("check-bun-test-imports: no bun:test imports — OK");
}
