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
import { makeRuntime, ctxFor } from "./helpers.js";

const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

function seedCleanWiki(wikiRoot) {
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

// Minimal technical-writer profile so composeProfilePrompt can read it.
function seedAgentProfile(projectRoot) {
  const agentsDir = join(projectRoot, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, "technical-writer.md"),
    "---\nname: technical-writer\n---\nYou are the technical writer.\n",
  );
}

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

/**
 * A mock SDK `query` that writes `versions[n]` to the summary on its n-th call
 * (clamped to the last version) and reports success. Records each call's
 * `resume` option so tests can assert run-vs-resume.
 */
function scriptedQuery(summaryPath, versions, calls) {
  return async function* ({ options }) {
    calls.push({ resume: options.resume ?? null });
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
});
