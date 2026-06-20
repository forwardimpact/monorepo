#!/usr/bin/env node
// The release-blocking test gate. Runs `node --test` over the gate set — the
// SAME file selector the `test` script uses, minus the bun-only paths in
// GATE_EXEMPT_PATHS that `node --test` structurally cannot load — once per file,
// then enforces:
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const floorPath = join(repoRoot, "scripts/test-gate.floor.json");

// SINGLE SOURCE OF TRUTH for the gate set. These MUST stay byte-identical to the
// `test` script's selector in package.json — if they fork, the gate set forks.
// `tests/test-gate-selector.test.js` asserts the two are identical.
export const SELECTOR_DIRS = [
  "./tests",
  "./libraries",
  "./products",
  "./services",
  "./.github/workflows/test",
  "./.claude/skills/kata-interview/test",
];

// The `find` predicate, shared with the `test` script's selector.
export const SELECTOR_PREDICATE = [
  "-name",
  "*.test.js",
  "-not",
  "-path",
  "*/node_modules/*",
];

// Paths the node gate must NOT run even though they match the shared selector,
// because `node --test` structurally cannot load them. Each is bun-only by
// design and stays fully covered by the informational bun `test` job; the shared
// `find` selector is left byte-identical to the `test` script's (so the bun loop
// still runs them and the single-source invariant holds), and the gate prunes
// them here after expansion. The set is enumerated explicitly so it is reviewable
// and a new unrunnable file is a deliberate addition, never a silent drop.
//
//   - tests/bun-test-imports.test.js — the regression test for the sanctioned
//     `bun:test` universal-subset allowlist invariant. It deliberately imports
//     the allowlisted subset from `bun:test`, so `node --test` cannot resolve it
//     (ERR_UNSUPPORTED_ESM_URL_SCHEME). The matching exemption in
//     `scripts/check-bun-test-imports.mjs` keeps the re-divergence guard from
//     flagging the same sanctioned import.
//   - products/map/test/activity/hosted/*.test.js — these import the Supabase
//     edge-function shared runtime `_shared/runtime.ts`; `node --test` on the
//     pinned node major has no TypeScript loader (ERR_UNKNOWN_FILE_EXTENSION
//     ".ts"), while bun transpiles it. They already run on `node:test` structural
//     names — they carry no `bun:test` import — but their `.ts` dependency keeps
//     them bun-only until the edge-function runtime is node-loadable.
export const GATE_EXEMPT_PATHS = [
  "tests/bun-test-imports.test.js",
  "products/map/test/activity/hosted/getdx-sync.test.js",
  "products/map/test/activity/hosted/people-upload.test.js",
  "products/map/test/activity/hosted/runtime.test.js",
  "products/map/test/activity/hosted/transform.test.js",
];

function fail(message) {
  console.error(`test:gate: ${message}`);
  process.exit(1);
}

function parseCount(stdout, field) {
  const m = stdout.match(new RegExp(`^# ${field} (\\d+)$`, "m"));
  return m ? Number(m[1]) : null;
}

// Classify one file's `node --test` run. Returns { tests } on success or
// { error } describing the gate violation.
function classifyRun(out, status) {
  const tests = parseCount(out, "tests");
  const fails = parseCount(out, "fail");
  if (tests === null || fails === null) {
    return { error: `unparseable test summary (exit ${status})` };
  }
  if (status !== 0 || fails > 0) {
    return { error: `${fails} failing test(s) (exit ${status})` };
  }
  if (tests < 1) {
    return { error: "registered 0 tests (dropped/erroring describe?)" };
  }
  return { tests };
}

async function main() {
  // Step 1 — expand the selector to a file list (same predicate as `test`).
  const find = spawnSync("find", [...SELECTOR_DIRS, ...SELECTOR_PREDICATE], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (find.status !== 0 || find.error) {
    fail(
      `file discovery failed: ${find.error?.message ?? `exit ${find.status}`}`,
    );
  }
  const exempt = new Set(GATE_EXEMPT_PATHS.map((p) => resolve(repoRoot, p)));
  const files = (find.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    // Prune the sanctioned bun-only paths; `find` prints them relative to
    // repoRoot (e.g. ./tests/...), so resolve before comparing (see
    // GATE_EXEMPT_PATHS).
    .filter((f) => !exempt.has(resolve(repoRoot, f)));

  if (files.length === 0) {
    fail(
      "the gate selector matched zero files — discovery failed or the glob is wrong",
    );
  }

  // Step 2/3 — run one `node --test` per file (the only path that yields a
  // per-file count — a batched run counts a zero-registration file as 1 via a
  // synthetic subtest). The TAP reporter is pinned (`--test-reporter=tap`) so
  // the `# tests`/`# fail` summary the parser reads is deterministic across node
  // versions: node 22 emitted TAP by default, but node 23+ defaults to the spec
  // reporter (`ℹ tests N`) when piped, which this parser would not match.
  // Bounded concurrency keeps wall-clock reasonable.
  let totalTests = 0;
  const failures = [];

  async function runFile(file) {
    let out;
    let status = 0;
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["--test", "--test-reporter=tap", file],
        { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
      );
      out = `${stdout}${stderr}`;
    } catch (err) {
      status = typeof err.code === "number" ? err.code : 1;
      out = `${err.stdout || ""}${err.stderr || ""}`;
    }
    const result = classifyRun(out, status);
    if (result.error) {
      failures.push(`${file}: ${result.error}`);
      return;
    }
    totalTests += result.tests;
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
}

// Run only when invoked as the entry script, so the selector constants can be
// imported by tests without executing the whole gate.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
