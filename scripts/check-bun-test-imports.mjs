#!/usr/bin/env node
// Re-divergence guard. It fails CI on any `bun:test` module-specifier
// statement anywhere in the repo, except the sanctioned paths in EXEMPT_PATHS.
// The whole suite now runs on `node:test`, so the baseline is one sanctioned
// file. The rule "zero repo-wide bar one governed exemption" is simpler and
// strictly safer than a rule scoped to the gate set. It also keeps the gate
// runner able to load every file it must run.
//
// The pattern matches a static import, a re-export, a `require()`, and a
// dynamic `import()` of `bun:test`. It does NOT match a comment or a
// doc-string mention. `node --test` cannot resolve a `bun:` specifier
// (ERR_UNSUPPORTED_ESM_URL_SCHEME), so an import is the only thing that breaks
// the gate. A comment mention is harmless and must not trip the guard.
//
// CI runs this as a dedicated required-workflow step, the same way it runs
// check-dependabot.mjs. It does not route through the local-only
// `bun run check`/`context` aggregate.
//
// Exits 0 on a clean tree. Exits 1 and lists every offending `file:line`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const SELF = resolve(new URL(import.meta.url).pathname);

// No file anywhere in the repo may import `bun:test`. The whole suite runs on
// `node:test`. The exemption list is empty. It stays here (exported,
// repo-relative) so a maintainer can add a future sanctioned bun-only path in
// one place. It also lets `tests/test-gate-selector.test.js` assert that the
// guard exemption stays a subset of the node gate's (`scripts/test-gate.mjs`
// GATE_EXEMPT_PATHS).
export const EXEMPT_RELATIVE_PATHS = [];
const EXEMPT_PATHS = new Set(
  EXEMPT_RELATIVE_PATHS.map((p) => resolve(repoRoot, p)),
);

// Matches a static import, a dynamic import, a re-export, or a require of the
// bun test module, with arbitrary whitespace before the quote. A naive pattern
// that requires the quote to abut the keyword would match none of the real
// imports, because the real imports have a space before the quote. This
// pattern tolerates the whitespace.
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
      continue; // skip a broken symlink or a vanished entry
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
      // Skip whole-line comments. A commented-out import is not an import.
      // The guard's contract is to flag imports. It does not flag mentions.
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

// Run the scan only when this file is the entry script. A test can then import
// the exports above. The walk does not run, and the script does not call
// process.exit.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const offenders = findOffenders();
  if (offenders.length > 0) {
    console.error(
      `check-bun-test-imports: found ${offenders.length} bun:test import statement(s). ` +
        `node --test cannot resolve 'bun:' specifiers. Convert to node:test + ` +
        `@forwardimpact/libmock/expect:\n  ${offenders.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log("check-bun-test-imports: no bun:test imports — OK");
}
