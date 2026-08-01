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
 * Build a real-filesystem `runtime` for in-process command tests. It carries a
 * real fs and subprocess, a `proc` whose `cwd()`/`env` the test controls, and a
 * real `Finder`. The harness captures the `proc` stdout and stderr. Returns the
 * runtime plus `stdout`/`stderr` getters over the captured output.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - The working directory `proc.cwd()` returns.
 * @param {Record<string,string>} [options.env] - The map that backs `proc.env`.
 * @param {number} [options.now] - Fixed clock time in ms (defaults to real clock).
 * @param {object} [options.fs] - Override for the async fs surface
 *   (default real `node:fs/promises`).
 * @param {object} [options.fsSync] - Override for the sync fs surface
 *   (default real `node:fs`). Pass a libmock `createMockFs()` to keep a
 *   command's reads/writes in memory.
 * @returns {{runtime: object, stdout: string, stderr: string}}
 */
export function makeRuntime({
  cwd = process.cwd(),
  env = {},
  now,
  fs: fsOverride = nodeFs,
  fsSync: fsSyncOverride = nodeFsSync,
  finder: finderOverride,
  subprocess: subprocessOverride,
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
    subprocess: subprocessOverride ?? createDefaultSubprocess(),
    // Callers pass findProjectRoot an explicit start path (proc.cwd()), so the
    // shared real-fs finder traverses fixtures correctly. It does not need the
    // test's custom proc bound into it. Tests that drive a command against
    // an in-memory fs pass a `finder` stub that returns a fixed project root.
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
 * Assemble an `InvocationContext`-shaped object to invoke a command handler
 * directly in-process, with no call to `cli.dispatch`.
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

export const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

/**
 * The live storyboard shape. Each agent gets a `### {agent}` h3 with an h4
 * metric, a fenced XmR block, and at least one live-format agent-section
 * bullet. A team-wide `## ` h2 comes immediately after the last agent section
 * (the h2-after-last-agent regression shape). The materialized
 * `agent-experiments` block carries a stamp and one attributed item. No
 * dead-format agent-section bullets appear.
 * @param {string} [yyyymm] - e.g. "2026-05".
 * @returns {string}
 */
export function liveStoryboard(yyyymm = "2026-05") {
  const agentSections = STORYBOARD_AGENTS.flatMap((a) => [
    `### ${a}`,
    "#### metric",
    "```",
    "n=1 mean=1",
    "```",
    "**Signals:** —",
    `- ${a} live-format note`,
    "",
  ]);
  return [
    `# Storyboard — ${yyyymm}`,
    "",
    ...agentSections,
    "## Experiments",
    "",
    "### Active",
    "<!-- agent-experiments -->",
    "<!-- last-successful-sync: 2026-05-18 -->",
    "- #1 [staff-engineer] seed experiment (by tester)",
    "<!-- /agent-experiments -->",
    "",
  ].join("\n");
}

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
  writeFileSync(join(wikiRoot, "storyboard-2026-M05.md"), liveStoryboard());
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

/**
 * Run a git command in the given directory and return its trimmed stdout. The
 * function merges a trailing `{ env }` object onto the process env, and it
 * recognizes that object by its `env` key. Use this to back-date commits with
 * `GIT_AUTHOR_DATE` / `GIT_COMMITTER_DATE`. The function passes everything
 * else verbatim as git args.
 */
export function git(dir, ...args) {
  let env;
  if (
    args.length > 0 &&
    typeof args.at(-1) === "object" &&
    args.at(-1) !== null &&
    "env" in args.at(-1)
  ) {
    env = args.pop().env;
  }
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf-8",
    stdio: "pipe",
    ...(env ? { env: { ...process.env, ...env } } : {}),
  }).trim();
}

/** Create a temporary bare git repository and return its path. */
export function createBareRepo() {
  const dir = mkdtempSync(join(tmpdir(), "wiki-bare-"));
  execFileSync("git", ["init", "--bare", dir], { stdio: "pipe" });
  return dir;
}

/**
 * Clone a bare repo into a temp directory, commit a README, and push to master.
 *
 * By default the seed carries the union merge declaration for metrics CSVs in
 * `.gitattributes`. That matches a provisioned wiki's steady state. Pass
 * `gitattributes: false` to seed an un-provisioned wiki (e.g. to test that the
 * first sync introduces the declaration). Pass `files` to seed extra files
 * (relative path → contents). The function creates parent directories as it
 * needs them.
 *
 * @param {string} bare - The bare repo path.
 * @param {object} [options]
 * @param {boolean} [options.gitattributes=true] - Seed the `.gitattributes` line.
 * @param {Record<string,string>} [options.files] - Extra files to seed.
 */
export function seedBareRepo(bare, { gitattributes = true, files = {} } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "wiki-seed-"));
  execFileSync("git", ["clone", bare, tmp], { stdio: "pipe" });
  git(tmp, "config", "user.name", "Seed");
  git(tmp, "config", "user.email", "seed@example.com");
  // Test repos must not depend on the host's commit-signing config.
  git(tmp, "config", "commit.gpgsign", "false");
  git(tmp, "config", "tag.gpgsign", "false");
  git(tmp, "checkout", "-b", "master");
  writeFileSync(join(tmp, "README.md"), "# Wiki\n");
  if (gitattributes) {
    writeFileSync(
      join(tmp, ".gitattributes"),
      "metrics/**/*.csv merge=union\n",
    );
  }
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(tmp, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  git(tmp, "add", "-A");
  git(tmp, "commit", "-m", "init");
  git(tmp, "push", "origin", "master");
}

/**
 * Clone a bare repo into a named temp directory. Configure the test user
 * identity in the clone.
 */
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
