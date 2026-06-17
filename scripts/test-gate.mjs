#!/usr/bin/env node
// The release-blocking test gate. Runs `node --test` over the gate set — the
// SAME file selector the `test` script uses — once per file, then enforces:
//
//   1. the file list is non-empty               (a zero-file selector fails;
//      `node --test` would otherwise exit 0)
//   2. every file's run exits 0 with `# fail 0`  (a real failure or import-time
//      throw reddens the gate)
//   3. every file reports `# tests >= 1`         (catches an erroring `describe`
//      that silently drops its tests — `node --test` reports `# tests 0`,
//      exit 0, for that case)
//   4. the summed `# tests` >= the committed floor in scripts/test-gate.floor.json
//
// `node --test` exits 0 on a zero-test or zero-file run, so THIS wrapper — not
// node — is what fails an empty, shrunk, or dropped run. The summed count
// includes node's per-file synthetic subtest, so the floor is a relative
// shrink-detector, not an exact real-test count; update it (commit the printed
// value) in the same PR that changes the test population.

import { execFile, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const floorPath = join(repoRoot, "scripts/test-gate.floor.json");

// SINGLE SOURCE OF TRUTH for the gate set. This selector MUST stay byte-identical
// to the `test` script's selector in package.json — if it forks, the gate set
// forks. (A test asserts the two are identical.)
const SELECTOR_DIRS = [
  "./tests",
  "./libraries",
  "./products",
  "./services",
  "./.github/workflows/test",
  "./.claude/skills/kata-interview/test",
];

function fail(message) {
  console.error(`test:gate: ${message}`);
  process.exit(1);
}

// Step 1 — expand the selector to a file list (same predicate as `test`).
const find = spawnSync(
  "find",
  [...SELECTOR_DIRS, "-name", "*.test.js", "-not", "-path", "*/node_modules/*"],
  { cwd: repoRoot, encoding: "utf8" },
);
const files = (find.stdout || "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (files.length === 0) {
  fail(
    "the gate selector matched zero files — discovery failed or the glob is wrong",
  );
}

// Step 2/3 — run node --test per file, parse each run's summary.
function parseCount(stdout, field) {
  const m = stdout.match(new RegExp(`^# ${field} (\\d+)$`, "m"));
  return m ? Number(m[1]) : null;
}

let totalTests = 0;
const failures = [];

// Run one `node --test` per file (the only path that yields a per-file count —
// a batched run counts a zero-registration file as 1 via a synthetic subtest).
// Bounded concurrency keeps wall-clock reasonable; correctness is unaffected.
async function runFile(file) {
  let out;
  let status = 0;
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--test", file],
      { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
    );
    out = `${stdout}${stderr}`;
  } catch (err) {
    status = typeof err.code === "number" ? err.code : 1;
    out = `${err.stdout || ""}${err.stderr || ""}`;
  }
  const tests = parseCount(out, "tests");
  const fails = parseCount(out, "fail");
  if (tests === null || fails === null) {
    failures.push(`${file}: unparseable test summary (exit ${status})`);
    return;
  }
  if (status !== 0 || fails > 0) {
    failures.push(`${file}: ${fails} failing test(s) (exit ${status})`);
    return;
  }
  if (tests < 1) {
    failures.push(`${file}: registered 0 tests (dropped/erroring describe?)`);
    return;
  }
  totalTests += tests;
}

const concurrency = Math.max(2, availableParallelism());
const queue = [...files];
async function worker() {
  while (queue.length > 0) {
    const file = queue.shift();
    if (file !== undefined) {
      await runFile(file);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

if (failures.length > 0) {
  fail(
    `${failures.length} file(s) failed the gate:\n  ${failures.join("\n  ")}`,
  );
}

// Step 4 — enforce the committed floor.
let floor;
try {
  floor = JSON.parse(readFileSync(floorPath, "utf8")).floor;
} catch (err) {
  fail(`could not read floor from ${floorPath}: ${err.message}`);
}
if (typeof floor !== "number") {
  fail(`floor in ${floorPath} is not a number`);
}
if (totalTests < floor) {
  fail(
    `observed ${totalTests} tests across ${files.length} files, below the pinned floor ${floor}. ` +
      `If the population legitimately shrank, commit { "floor": ${totalTests} } to ${floorPath}.`,
  );
}

console.log(
  `test:gate: ${totalTests} tests across ${files.length} files, floor ${floor} — OK`,
);
