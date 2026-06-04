import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFixCommand } from "../src/commands/fix.js";
import { weeklyLogPath } from "../src/weekly-log.js";
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

  test("bisects a multi-day over-cap log into conforming parts; audit clean, no agent", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // Valid H1 + 4 day-sections @ 150 lines: each section is under both
    // budgets, jointly they overflow the line budget. The bisecting seal splits
    // them into conforming parts and the re-audit is clean.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    let text = "# Staff Engineer — 2026-W21\n";
    for (let s = 0; s < 4; s++) {
      text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 150; i++) text += "- filler\n";
    }
    writeFileSync(logPath, text);

    // The agent must never be constructed for a deterministic rotation.
    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "rotation does not invoke the agent");
    assert.match(harness.stdout, /rotated/);
    assert.match(harness.stdout, /fixed: wiki audit is clean/);
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")) &&
        existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      "the over-cap log is sealed into ≥2 conforming parts",
    );
    assert.ok(existsSync(logPath), "a fresh main log is started");
    // The over-cap multi-day log now resolves clean — no human flag.
    assert.deepEqual(result, { ok: true, code: 0 });
    assert.doesNotMatch(harness.stderr, /weekly-log-part\.line-budget/);
  });

  test("flags only the irreducible single-day section that cannot be split", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // One day-section alone exceeds the line budget — it cannot be split at a
    // day seam, so it seals as an over-cap part the audit still flags.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-19\n";
    for (let i = 0; i < 600; i++) text += "- filler\n";
    writeFileSync(logPath, text);

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "rotation does not invoke the agent");
    assert.ok(existsSync(logPath), "a fresh main log is started");
    // Only the irreducible residue flags for a human.
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /weekly-log-part\.line-budget/);
  });

  test("flags a missing ### Decision instead of letting the agent backfill it", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // In-budget weekly log whose dated entry lacks a leading ### Decision.
    writeFileSync(
      weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24"),
      [
        "# Staff Engineer — 2026-W21",
        "",
        "## 2026-05-20",
        "",
        "- did stuff",
        "",
      ].join("\n"),
    );

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
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
      0,
      "the agent is never asked to fix a flag finding",
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /decision-block\.heading-within-5/);
  });

  test("leaves a healthy current-week log alone when a prior week is over budget", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // Prior week (W20) over budget — the finding.
    const priorLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-17");
    writeFileSync(
      priorLog,
      ["# Staff Engineer — 2026-W20", ""]
        .concat(Array(600).fill("- filler"))
        .join("\n") + "\n",
    );
    // Current week (W21) healthy — must NOT be force-rotated.
    const currentLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(
      currentLog,
      "# Staff Engineer — 2026-W21\n\n## 2026-05-24\n\n### Decision\n\n- ok\n",
    );

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "the agent is never invoked");
    assert.ok(
      !existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "the healthy current-week log is not rotated",
    );
    assert.ok(existsSync(priorLog), "the prior-week log is left for a human");
    // The unrotatable prior-week budget finding is flagged, not handed to the agent.
    assert.equal(result.code, 2);
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /weekly-log\.line-budget/);
  });
});
