import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs, createMockSubprocess } from "@forwardimpact/libmock";

import { runCurateCommand } from "../src/commands/curate.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const PROJECT_ROOT = "/project";
const WIKI_ROOT = `${PROJECT_ROOT}/wiki`;
const FINDER = { findProjectRoot: () => PROJECT_ROOT };
const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

// A clean wiki seed; `extra` overlays files that introduce audit failures.
function cleanWiki(extra = {}) {
  return createMockFs({
    [`${WIKI_ROOT}/MEMORY.md`]: [
      "## Cross-Cutting Priorities",
      "",
      "| Item | Agents | Owner | Status | Added |",
      "| --- | --- | --- | --- | --- |",
      "| *None* | — | — | — | — |",
      "",
    ].join("\n"),
    [`${WIKI_ROOT}/storyboard-2026-M05.md`]: [
      "# Storyboard — 2026-05",
      "",
      ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
      "",
    ].join("\n"),
    ...extra,
  });
}

// An over-budget summary makes the audit dirty (a `fail`-level finding).
const OVER_BUDGET = {
  [`${WIKI_ROOT}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${Array(600).fill("x").join("\n")}\n`,
};

function curate(fsSync, { options = {}, responses = {} } = {}) {
  const subprocess = createMockSubprocess({ responses });
  const harness = makeRuntime({ fsSync, finder: FINDER, subprocess });
  return {
    harness,
    subprocess,
    run: runCurateCommand(
      ctxFor({
        runtime: harness.runtime,
        gitClient: { remoteGetUrl: async () => "" },
        options: { today: "2026-05-24", repo: "owner/repo", ...options },
      }),
    ),
  };
}

describe("gemba-wiki curate", () => {
  test("a clean wiki routes nothing and makes no gh call", async () => {
    const { harness, subprocess, run } = curate(cleanWiki());
    const result = await run;
    assert.equal(result.ok, true);
    // The audit shells out to `git ls-files`; what must not happen is any gh
    // routing call.
    assert.ok(!subprocess.calls.some((c) => c.cmd === "gh"));
    assert.match(harness.stdout, /clean/);
  });

  test("a dirty wiki with no open issue creates one", async () => {
    const { subprocess, run } = curate(cleanWiki(OVER_BUDGET), {
      responses: { gh: { stdout: "[]" } },
    });
    const result = await run;
    assert.equal(result.ok, true);

    const create = subprocess.calls.find(
      (c) => c.cmd === "gh" && c.args[0] === "issue" && c.args[1] === "create",
    );
    assert.ok(create, "expected a gh issue create call");
    assert.ok(create.args.includes("--title"));
    assert.equal(
      create.args[create.args.indexOf("--title") + 1],
      "Wiki curation: shared-state audit findings",
    );
    assert.ok(create.args.includes("--label"));
    assert.equal(
      create.args[create.args.indexOf("--label") + 1],
      "wiki-curation",
    );
    // Body rides a temp file, never argv.
    assert.ok(create.args.includes("--body-file"));
    assert.ok(!create.args.some((a) => a === "--body"));
    // No comment call when there is no existing issue.
    assert.ok(
      !subprocess.calls.some(
        (c) => c.args[0] === "issue" && c.args[1] === "comment",
      ),
    );
  });

  test("a dirty wiki with an open issue comments on it", async () => {
    const { subprocess, run } = curate(cleanWiki(OVER_BUDGET), {
      responses: { gh: { stdout: '[{"number":42}]' } },
    });
    const result = await run;
    assert.equal(result.ok, true);

    const comment = subprocess.calls.find(
      (c) => c.cmd === "gh" && c.args[0] === "issue" && c.args[1] === "comment",
    );
    assert.ok(comment, "expected a gh issue comment call");
    assert.equal(comment.args[2], "42");
    assert.ok(comment.args.includes("--body-file"));
    assert.ok(
      !subprocess.calls.some(
        (c) => c.args[0] === "issue" && c.args[1] === "create",
      ),
    );
  });

  test("an over-large finding set truncates the body under GitHub's limit", async () => {
    // Many distinct over-budget summaries push the full findings JSON past
    // GitHub's 65536-char body limit; curate must still post a fitting body.
    const many = {};
    for (let i = 0; i < 300; i++) {
      many[`${WIKI_ROOT}/staff-engineer-${i}.md`] =
        `# Staff Engineer ${i} — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${Array(600).fill(`pad-${i}`).join("\n")}\n`;
    }
    const { harness, run } = curate(cleanWiki(many), {
      options: { "dry-run": true },
    });
    const result = await run;
    assert.equal(result.ok, true);
    assert.ok(
      harness.stdout.length <= 65536,
      `body must fit GitHub's limit, was ${harness.stdout.length}`,
    );
    assert.match(harness.stdout, /Showing \d+ of \d+ findings/);
  });

  test("--dry-run prints the body and makes no gh call", async () => {
    const { harness, subprocess, run } = curate(cleanWiki(OVER_BUDGET), {
      options: { "dry-run": true },
    });
    const result = await run;
    assert.equal(result.ok, true);
    assert.ok(!subprocess.calls.some((c) => c.cmd === "gh"));
    assert.match(harness.stdout, /\[dry-run\]/);
    assert.match(harness.stdout, /```json/);
  });
});
