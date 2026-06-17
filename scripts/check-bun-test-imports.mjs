#!/usr/bin/env node
// Invariant: enforce the bun:test universal-subset allowlist.
// In *.test.js files, only the named symbols on the allowlist may be imported
// from "bun:test"; default/namespace/side-effect imports and every re-export
// shape are rejected. In every other file under the scope set (non-test
// source), all bun:test imports and re-exports are rejected. Called from
// `bun run check` via the `invariants` aggregator. Policy:
// CONTRIBUTING.md § Invariants.
//
// Detection rules live in check-bun-test-imports-rules.mjs so a regression
// test can exercise them directly.
//
// Usage:
//   node scripts/check-bun-test-imports.mjs   # non-zero on a violation

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bunTestFindings } from "./check-bun-test-imports-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The bun test invocation roots (verified against package.json scripts.test)
// plus websites/ as preemptive coverage. See CONTRIBUTING.md § Invariants.
const SCOPE = [
  "libraries",
  "services",
  "products",
  "tests",
  "websites",
  ".github/workflows/test",
  ".claude/skills/kata-interview/test",
];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
// The guard's own regression test embeds the very shapes it detects.
const SELF_TEST = "check-bun-test-imports-rules.test.js";

function collectFiles(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

let status = 0;
for (const scope of SCOPE) {
  for (const file of collectFiles(join(ROOT, scope), [])) {
    if (file.endsWith(SELF_TEST)) continue;
    const rel = relative(ROOT, file);
    const isTestFile = file.endsWith(".test.js");
    for (const f of bunTestFindings(readFileSync(file, "utf8"), isTestFile)) {
      status = 1;
      console.error(
        `error: ${rel} line=${f.line} kind=${f.kind} name=${f.name} pointer=${f.pointer}`,
      );
    }
  }
}

process.exit(status);
