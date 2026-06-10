import nodeFsSync from "node:fs";
import nodeFs from "node:fs/promises";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  createDefaultClock,
  createDefaultSubprocess,
} from "@forwardimpact/libutil";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/**
 * Build a real-filesystem `runtime` for in-process command tests: real fs and
 * subprocess, a `proc` whose `cwd()`/`env` are test-controlled and whose
 * stdout/stderr are captured, and a real `Finder`. Returns the runtime plus
 * `stdout`/`stderr` getters over the captured output.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory `proc.cwd()` returns.
 * @param {Record<string,string>} [options.env] - The `proc.env` backing map.
 * @param {number} [options.now] - Fixed clock time in ms (defaults to real clock).
 * @param {object} [options.fs] - Async fs surface override (default real `node:fs/promises`).
 * @param {object} [options.fsSync] - Sync fs surface override (default real `node:fs`);
 *   pass a libmock `createMockFs()` to keep a command's reads/writes in memory.
 * @returns {{runtime: object, stdout: string, stderr: string}}
 */
export function makeRuntime({
  cwd = process.cwd(),
  env = {},
  now,
  fs: fsOverride = nodeFs,
  fsSync: fsSyncOverride = nodeFsSync,
  finder: finderOverride,
} = {}) {
  const out = [];
  const err = [];
  const proc = {
    cwd: () => cwd,
    env: { ...env },
    argv: Object.freeze([]),
    stdout: { write: (s) => out.push(String(s)) },
    stderr: { write: (s) => err.push(String(s)) },
    exit: () => {},
    exitCode: 0,
  };
  const clock =
    now != null
      ? {
          now: () => now,
          sleep: async () => {},
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (h) => clearTimeout(h),
        }
      : createDefaultClock();
  const runtime = Object.freeze({
    fs: fsOverride,
    fsSync: fsSyncOverride,
    proc,
    clock,
    subprocess: createDefaultSubprocess(),
    // findProjectRoot is called with an explicit start path (proc.cwd()), so
    // the shared real-fs finder traverses fixtures correctly without needing
    // the test's custom proc bound into it. Tests that drive a command against
    // an in-memory fs pass a `finder` stub returning a fixed project root.
    finder: finderOverride ?? createDefaultRuntime().finder,
  });
  return {
    runtime,
    get stdout() {
      return out.join("");
    },
    get stderr() {
      return err.join("");
    },
  };
}

/**
 * Assemble an `InvocationContext`-shaped object for invoking a command handler
 * directly in-process (without going through `cli.dispatch`).
 * @param {{runtime: object, wikiSync?: object, gitClient?: object, query?: function, options?: object, args?: object}} parts
 * @returns {object}
 */
export function ctxFor({
  runtime,
  wikiSync,
  gitClient,
  query,
  options = {},
  args = {},
}) {
  return { deps: { runtime, wikiSync, gitClient, query }, options, args };
}

const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

/** Seed a wiki root with an audit-clean MEMORY.md and current-month storyboard. */
export function seedCleanWiki(wikiRoot) {
  writeFileSync(
    join(wikiRoot, "MEMORY.md"),
    [
      "## Cross-Cutting Priorities",
      "",
      "| Item | Agents | Owner | Status | Added |",
      "| --- | --- | --- | --- | --- |",
      "| *None* | — | — | — | — |",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(wikiRoot, "storyboard-2026-M05.md"),
    [
      "# Storyboard — 2026-05",
      "",
      ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      "",
    ].join("\n"),
  );
}

/** Write a minimal technical-writer profile so composeProfilePrompt can read it. */
export function seedAgentProfile(projectRoot) {
  const agentsDir = join(projectRoot, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, "technical-writer.md"),
    "---\nname: technical-writer\n---\nYou are the technical writer.\n",
  );
}

/**
 * A mock SDK `query` that writes `versions[n]` to `summaryPath` on its n-th call
 * (clamped to the last version) and reports success. Records each call's
 * `resume` option and `prompt` so tests can assert run-vs-resume and the
 * composed task text.
 */
export function scriptedQuery(summaryPath, versions, calls) {
  return async function* ({ prompt, options }) {
    calls.push({ resume: options.resume ?? null, prompt });
    const v = versions[Math.min(calls.length - 1, versions.length - 1)];
    writeFileSync(summaryPath, v);
    yield { type: "system", subtype: "init", session_id: "sess-fix" };
    yield {
      type: "result",
      subtype: "success",
      result: `round ${calls.length}`,
    };
  };
}

/** Run a git command in the given directory and return its trimmed stdout. */
export function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

/** Create a temporary bare git repository and return its path. */
export function createBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), "wiki-bare-"));
  execFileSync("git", ["init", "--bare", dir], { stdio: "pipe" });
  return dir;
}

/** Clone a bare repo into a temp directory, commit a README, and push to master. */
export function seedBareRepo(bare) {
  const tmp = mkdtempSync(join(tmpdir(), "wiki-seed-"));
  execFileSync("git", ["clone", bare, tmp], { stdio: "pipe" });
  git(tmp, "config", "user.name", "Seed");
  git(tmp, "config", "user.email", "seed@example.com");
  // Test repos must not depend on the host's commit-signing config.
  git(tmp, "config", "commit.gpgsign", "false");
  git(tmp, "config", "tag.gpgsign", "false");
  git(tmp, "checkout", "-b", "master");
  writeFileSync(join(tmp, "README.md"), "# Wiki\n");
  git(tmp, "add", "-A");
  git(tmp, "commit", "-m", "init");
  git(tmp, "push", "origin", "master");
}

/** Clone a bare repo into a named temp directory with test user identity configured. */
export function cloneRepo(bare, name) {
  const parent = mkdtempSync(join(tmpdir(), `wiki-${name}-`));
  execFileSync("git", ["clone", bare, "wiki"], {
    cwd: parent,
    stdio: "pipe",
  });
  const wikiDir = join(parent, "wiki");
  git(wikiDir, "config", "user.name", "Test User");
  git(wikiDir, "config", "user.email", "test@example.com");
  git(wikiDir, "config", "commit.gpgsign", "false");
  git(wikiDir, "config", "tag.gpgsign", "false");
  return { parent, wikiDir };
}
