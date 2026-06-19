import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFixCommand } from "../src/commands/fix.js";
import { weeklyLogPath } from "../src/weekly-log.js";
import {
  makeRuntime,
  ctxFor,
  seedCleanWiki,
  seedAgentProfile,
  scriptedQuery,
} from "./helpers.js";

const summary = (lines) => lines.join("\n") + "\n";

// A summary missing the **Last run** line fails exactly summary.last-run-marker.
const MISSING_LAST_RUN = summary([
  "# Staff Engineer — Summary",
  "",
  "## Message Inbox",
  "",
  "<!-- memo:inbox -->",
  "",
  "## Open Blockers",
  "",
  "- none",
]);

// Adds the Last run line but appends a section after Open Blockers — trades the
// first violation for summary.open-blockers-last.
const SECTION_AFTER_BLOCKERS = summary([
  "# Staff Engineer — Summary",
  "",
  "**Last run**: 2026-05-24 — settled.",
  "",
  "## Message Inbox",
  "",
  "<!-- memo:inbox -->",
  "",
  "## Open Blockers",
  "",
  "- none",
  "",
  "## History",
  "",
  "- old",
]);

// Satisfies every summary invariant.
const VALID_SUMMARY = summary([
  "# Staff Engineer — Summary",
  "",
  "**Last run**: 2026-05-24 — settled state only.",
  "",
  "## Message Inbox",
  "",
  "<!-- memo:inbox -->",
  "",
  "## Open Blockers",
  "",
  "- none",
]);

// Agent/summary orchestration: run-vs-resume, MAX_ROUNDS, launch failure, and
// the decision-block handoff. The deterministic rotation/re-bisection family
// lives in cli-fix-rotation.integration.test.js.
describe("fit-wiki fix CLI (in-process)", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fix-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("clean wiki: prints 'nothing to fix' and exits 0", async () => {
    seedCleanWiki(wikiRoot);
    const harness = makeRuntime({ cwd: dir });
    const result = await runFixCommand(
      ctxFor({ runtime: harness.runtime, options: { today: "2026-05-24" } }),
    );
    assert.deepEqual(result, { ok: true });
    assert.match(harness.stdout, /nothing to fix/);
  });

  test("re-audits and resumes the agent until the audit is clean", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    const summaryPath = join(wikiRoot, "staff-engineer.md");
    writeFileSync(summaryPath, MISSING_LAST_RUN);

    // First edit only trades one violation for another; the resume fixes it.
    const calls = [];
    const query = scriptedQuery(
      summaryPath,
      [SECTION_AFTER_BLOCKERS, VALID_SUMMARY],
      calls,
    );
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(result.ok, true);
    assert.match(harness.stdout, /fixed: wiki audit is clean/);
    assert.equal(calls.length, 2, "should run once then resume once");
    assert.equal(calls[0].resume, null, "first call is a fresh run");
    assert.equal(
      calls[1].resume,
      "sess-fix",
      "second call resumes the session",
    );
    assert.equal(readFileSync(summaryPath, "utf8"), VALID_SUMMARY);
  });

  test("the composed task forbids new files and prefers pointers over copies", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    const summaryPath = join(wikiRoot, "staff-engineer.md");
    writeFileSync(summaryPath, MISSING_LAST_RUN);

    const calls = [];
    const query = scriptedQuery(summaryPath, [VALID_SUMMARY], calls);
    const harness = makeRuntime({ cwd: dir });

    await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    // A summary trim that parks narrative in a non-convention file (e.g.
    // -history.md) fragments the log series invisibly to the audit, so the
    // task must confine trimmed history to existing weekly-log files, forbid
    // minting filenames, and prefer a pointer over a copy.
    const task = calls[0].prompt;
    assert.match(task, /existing\nweekly-log file/);
    assert.match(task, /never a new file/);
    assert.match(task, /do not mint filenames yourself/);
    assert.match(task, /pointer to that file instead of copying/);
  });

  test("fails with the remaining findings when the agent cannot converge", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    const summaryPath = join(wikiRoot, "staff-engineer.md");
    writeFileSync(summaryPath, MISSING_LAST_RUN);

    // The agent never fixes the file, so the audit keeps failing.
    const calls = [];
    const query = scriptedQuery(summaryPath, [MISSING_LAST_RUN], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /finding\(s\) remain after 3 round\(s\)/);
    assert.match(harness.stderr, /summary\.last-run-marker/);
    assert.equal(
      calls.length,
      3,
      "one run plus two resumes, capped at MAX_ROUNDS",
    );
  });

  test("surfaces the error and bails when the agent process never starts", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    const summaryPath = join(wikiRoot, "staff-engineer.md");
    writeFileSync(summaryPath, MISSING_LAST_RUN);

    // An iterator that rejects on the first step with no prior event → no
    // sessionId, mimicking the SDK failing to launch (e.g. the root guard
    // rejecting --dangerously-skip-permissions: it exits before any NDJSON).
    const calls = [];
    const query = () => {
      calls.push(1);
      return {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            Promise.reject(new Error("Claude Code process exited with code 1")),
        }),
      };
    };
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(
      harness.stderr,
      /agent run failed: Claude Code process exited with code 1/,
    );
    assert.equal(calls.length, 1, "no resume after a launch failure");
  });

  test("hands a missing ### Decision to the writer, which inserts one", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // In-budget weekly log whose dated entry lacks a leading ### Decision.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(
      logPath,
      [
        "# Staff Engineer — 2026-W21",
        "",
        "## 2026-05-20",
        "",
        "- did stuff",
        "",
      ].join("\n"),
    );

    // The writer opens the entry with a ### Decision drawn from its narrative;
    // the re-audit is then clean.
    const FIXED = [
      "# Staff Engineer — 2026-W21",
      "",
      "## 2026-05-20",
      "",
      "### Decision",
      "",
      "- did stuff",
      "",
    ].join("\n");
    const calls = [];
    const query = scriptedQuery(logPath, [FIXED], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(
      calls.length,
      1,
      "the writer is invoked to insert the heading",
    );
    assert.match(readFileSync(logPath, "utf-8"), /### Decision/);
    assert.deepEqual(result, { ok: true, code: 0 });
    assert.doesNotMatch(harness.stderr, /need human judgment/);
  });

  test("a non-grammar file is flagged for a human and left byte-identical", async () => {
    seedCleanWiki(wikiRoot);
    // No git state under wikiRoot, so the admission universe is the whole walk:
    // this rogue is in scope and rejected by the grammar.
    const roguePath = join(wikiRoot, "product-manager-2026-W24-history.md");
    const ROGUE = "# rogue narrative\n\nsome memory siphoned here\n";
    writeFileSync(roguePath, ROGUE);
    const harness = makeRuntime({ cwd: dir });

    // No agent query is supplied: a flag-only run must never spawn the writer.
    const result = await runFixCommand(
      ctxFor({ runtime: harness.runtime, options: { today: "2026-05-24" } }),
    );

    assert.deepEqual(result, { ok: false, code: 2 });
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /product-manager-2026-W24-history\.md/);
    // The flagged file is never moved or rewritten.
    assert.equal(readFileSync(roguePath, "utf-8"), ROGUE);
  });
});
