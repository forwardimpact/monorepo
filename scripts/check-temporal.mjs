#!/usr/bin/env node
// Flag temporal references embedded in code, docs, and tests. A "temporal"
// reference points to a transient artefact — a spec number, design number,
// plan number, GitHub issue, GitHub PR. Once the artefact is closed or
// superseded, the reference rots. Every comment, log message, or test label
// should stand on its own and explain WHY the code exists, not WHEN it landed.
//
// Out of scope: specs/, wiki/, benchmarks/, generated/, node_modules/, .git/.
//
// Usage: node scripts/check-temporal.mjs
// Wired into: bun run invariants (root package.json).

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rules = [
  { pattern: "\\bspec[- ][0-9]{2,5}\\b" },
  { pattern: "\\bdesign[- ][0-9]{2,5}\\b" },
  { pattern: "\\bplan[- ][0-9]{2,5}\\b" },
  { pattern: "\\bissue[- ]?#?[0-9]{2,5}\\b" },
  // Loose patterns: test fixtures naturally include synthetic IDs that look
  // like cross-references ("(#42)", "PR #99"). Exclude **/test/** so the
  // checker keeps catching real temporal references in production code
  // without flagging assertion strings.
  {
    pattern: "\\b(pr|pull)[- ]?#[0-9]{2,5}\\b",
    globs: ["!**/test/**"],
  },
  { pattern: "\\bGH-[0-9]{2,5}\\b" },
  { pattern: "\\(#[0-9]{2,5}\\)", globs: ["!**/test/**"] },
  { pattern: "[[:space:]]#[0-9]{2,5}\\b", globs: ["!**/test/**"] },
  {
    pattern:
      "\\b(introduced|added|landed|shipped|removed) in (spec|design|plan|PR|issue)\\b",
  },
  { pattern: "\\bas of (spec|design|plan|PR|issue) [0-9]+\\b" },
  { pattern: "\\bpre-migration\\b" },
  { pattern: "\\bduring spec [0-9]+ migration\\b" },
  {
    pattern: "\\b20[0-9]{2}-[0-1][0-9]-[0-3][0-9]\\b",
    globs: ["*.js", "!**/test/**", "!**/*synthetic*/**"],
    exclude: /version|e\.g\.|example/i,
  },
];

const baseGlobs = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  "!wiki/**",
  "!benchmarks/**",
  "!bun.lock",
  "!package-lock.json",
  "!*.lock",
  "!scripts/check-temporal.mjs",
];

const rgCheck = spawnSync("rg", ["--version"], { stdio: "pipe" });
if (rgCheck.status !== 0) {
  process.stderr.write(
    "error: ripgrep (rg) is required for check-temporal.mjs\n",
  );
  process.exit(2);
}

const allMatches = [];

for (const rule of rules) {
  const args = [
    "--hidden",
    "--no-messages",
    "--line-number",
    "--color",
    "never",
    "-i",
  ];
  for (const g of baseGlobs) args.push("--glob", g);
  if (rule.globs) {
    for (const g of rule.globs) args.push("--glob", g);
  }
  args.push("-e", rule.pattern, ".");

  const { stdout } = spawnSync("rg", args, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf-8",
  });

  let lines = (stdout || "").split("\n").filter(Boolean);
  if (rule.exclude) lines = lines.filter((l) => !rule.exclude.test(l));
  allMatches.push(...lines);
}

if (allMatches.length > 0) {
  const unique = [...new Set(allMatches)].sort();
  process.stderr.write(
    "error: temporal references found — replace each with a " +
      "short, non-temporal description that explains WHY the code is there.\n\n",
  );
  process.stderr.write(unique.join("\n") + "\n\n");
  process.stderr.write(
    "If a match is a false positive (CSS hex, HTML entity, runtime ID, " +
      "opaque fixture ID), narrow the rule in scripts/check-temporal.mjs " +
      "rather than leaving the temporal reference in place.\n",
  );
  process.exit(1);
}

console.log("check-temporal: no temporal references found");
