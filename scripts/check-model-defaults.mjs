#!/usr/bin/env node
// Keep every Claude model identifier anchored to the role-named constants
// in libraries/libutil/src/models.js — the single home for model defaults.
//
// Rule 1 (code): no model-ID literal in src/ or bin/ JavaScript. Runtime
// defaults and help text must import from @forwardimpact/libutil/models so
// a model upgrade is a values-only edit in one file.
//
// Rule 2 (docs): markdown cannot import constants, so any model ID written
// in docs or skills must equal a value currently exported by models.js.
// When an upgrade changes a value, the stale doc lines fail here instead of
// silently drifting.
//
// Out of scope: specs/, wiki/, benchmarks/ (historical records), test files
// and libmock (fixture data — arbitrary sample values, not defaults).
//
// Usage: node scripts/check-model-defaults.mjs
// Wired into: bun run invariants (root package.json).

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_PATH = "libraries/libutil/src/models.js";

// Matches model IDs (claude-fable-5, claude-haiku-4-5-20251001) and the
// optional 1M-context suffix; the family list keeps `claude-agent-sdk`,
// `claude-settings.yaml`, and similar names out.
const MODEL_ID =
  "claude-(fable|opus|sonnet|haiku)-[0-9][a-zA-Z0-9.-]*(\\[1m\\])?";

const baseGlobs = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  "!wiki/**",
  "!benchmarks/**",
  "!scripts/check-model-defaults.mjs",
];

function rg(extraArgs) {
  // ripgrep gives the *last* matching glob precedence, so the shared
  // exclusions must come after each rule's include globs to win.
  const args = ["--hidden", "--no-messages", "--color", "never", ...extraArgs];
  for (const g of baseGlobs) args.push("--glob", g);
  const { stdout, status } = spawnSync("rg", args, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (status === 2) {
    process.stderr.write(
      "error: ripgrep (rg) failed in check-model-defaults.mjs\n",
    );
    process.exit(2);
  }
  return (stdout || "").split("\n").filter(Boolean);
}

const allowed = new Set(
  Object.values(await import(pathToFileURL(resolve(ROOT, MODELS_PATH)))),
);

let status = 0;

// Rule 1 — code must import, not inline.
const codeHits = rg([
  "--line-number",
  "--glob",
  "*.{js,mjs,ts}",
  "--glob",
  "!**/test/**",
  "--glob",
  "!**/*.test.js",
  "--glob",
  "!libraries/libmock/**",
  "--glob",
  `!${MODELS_PATH}`,
  "-e",
  MODEL_ID,
  "libraries",
  "products",
  "services",
  "scripts",
]);
if (codeHits.length > 0) {
  status = 1;
  process.stderr.write(
    "error: model-ID literals in code — import the role constant from " +
      "@forwardimpact/libutil/models instead:\n\n" +
      codeHits.join("\n") +
      "\n\n",
  );
}

// Rule 2 — docs may repeat a value, but it must be a current one.
const docHits = rg([
  "--line-number",
  "--only-matching",
  "--glob",
  "*.md",
  "-e",
  MODEL_ID,
  ".",
]);
const stale = docHits.filter((line) => {
  const id = line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1);
  return !allowed.has(id);
});
if (stale.length > 0) {
  status = 1;
  process.stderr.write(
    "error: model IDs in docs that do not match any value exported by " +
      `${MODELS_PATH} — update the doc to the current value:\n\n` +
      stale.join("\n") +
      "\n\n",
  );
}

if (status === 0) {
  console.log("check-model-defaults: all model IDs anchored to libutil/models");
}
process.exit(status);
