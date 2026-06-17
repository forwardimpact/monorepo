#!/usr/bin/env node
// Re-divergence guard: fail CI on any `bun:test` module-specifier statement
// anywhere in the repo. After the spec-2020 convergence the baseline is zero,
// so "zero repo-wide" is simpler and strictly safer than scoping to the gate
// set. This is the mitigation spec 0650 named but never built.
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

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const SELF = resolve(new URL(import.meta.url).pathname);

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

const offenders = [];
for (const file of walk(repoRoot, [])) {
  if (resolve(file) === SELF) {
    continue; // the guard's own source defines the pattern it searches for
  }
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (SPECIFIER.test(line)) {
      offenders.push(`${relative(repoRoot, file)}:${i + 1}`);
    }
  });
}

if (offenders.length > 0) {
  console.error(
    `check-bun-test-imports: found ${offenders.length} bun:test import statement(s) — ` +
      `node --test cannot resolve 'bun:' (see spec 2020). Convert to node:test + ` +
      `@forwardimpact/libmock/expect:\n  ${offenders.join("\n  ")}`,
  );
  process.exit(1);
}

console.log("check-bun-test-imports: no bun:test imports — OK");
