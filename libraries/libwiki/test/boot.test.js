import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { buildDigest } from "../src/boot.js";

const ROOT = "/wiki";

// Run buildDigest against an in-memory wiki seeded with `files`; it reads
// `${wikiRoot}/<name>.md` through the injected sync surface and tolerates
// absent files.
function digestOf(files = {}) {
  return buildDigest({
    wikiRoot: ROOT,
    agent: "staff-engineer",
    today: "2026-05-19",
    fs: createMockFs(files),
  });
}

describe("buildDigest", () => {
  test("returns empty digest when wiki is empty", () => {
    const digest = digestOf();
    assert.equal(digest.summary, "");
    assert.deepEqual(digest.owned_priorities, []);
    assert.deepEqual(digest.cross_cutting, []);
    assert.deepEqual(digest.claims, []);
    assert.equal(digest.inbox_count, 0);
  });

  test("parses summary, priorities, claims, inbox count", () => {
    const digest = digestOf({
      [`${ROOT}/staff-engineer.md`]:
        "# Staff Engineer — Summary\n\nOne-line summary of the agent.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n- 2026-05-18 from **release-engineer**: ping\n",
      [`${ROOT}/MEMORY.md`]:
        "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| big migration | All | staff-engineer | active | 2026-05-01 |\n| someone-else thing | All | release-engineer | active | 2026-05-01 |\n\n## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2026-05-19 | 2026-05-26 |\n",
    });
    assert.equal(digest.summary, "One-line summary of the agent.");
    assert.equal(digest.owned_priorities.length, 1);
    assert.equal(digest.owned_priorities[0].item, "big migration");
    assert.equal(digest.cross_cutting.length, 1);
    assert.equal(digest.claims.length, 1);
    assert.equal(digest.claims[0].target, "spec-NNNN");
    assert.equal(digest.inbox_count, 1);
  });

  test("missing Active Claims section yields empty claims (silent tolerance)", () => {
    const digest = digestOf({
      [`${ROOT}/MEMORY.md`]:
        "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    });
    assert.deepEqual(digest.claims, []);
  });

  test("collects storyboard bullets only from the agent's own section", () => {
    const digest = digestOf({
      [`${ROOT}/storyboard-2026-M05.md`]:
        "# Storyboard — 2026-05\n\n### staff-engineer — backlog\n\n- own item\n\n### release-engineer — backlog\n\n- someone else's item\n",
    });
    assert.equal(digest.storyboard_items.length, 1);
    assert.equal(digest.storyboard_items[0].threshold, "own item");
  });

  test("h2 after the last agent section closes it — Notes bullets are not misattributed", () => {
    // Mirrors the live storyboard format: the last-listed agent's section
    // holds only an h4 metric and a fenced XmR block, then a team-wide
    // `## Notes` h2 follows with bullets that belong to no agent.
    const digest = digestOf({
      [`${ROOT}/storyboard-2026-M05.md`]: [
        "# Storyboard — 2026-05",
        "",
        "### release-engineer",
        "",
        "#### merges",
        "",
        "```",
        "chart",
        "```",
        "",
        "### staff-engineer",
        "",
        "#### designs_shipped",
        "",
        "```",
        "chart",
        "```",
        "",
        "**Signals:** xRule1",
        "",
        "## Notes",
        "",
        "- team-wide note one",
        "- team-wide note two",
        "",
      ].join("\n"),
    });
    assert.deepEqual(digest.storyboard_items, []);
  });

  test("filters out expired claims from digest", () => {
    const digest = digestOf({
      [`${ROOT}/MEMORY.md`]:
        "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/x | — | 2026-05-01 | 2026-05-10 |\n| staff-engineer | new | feat/y | — | 2026-05-19 | 2026-05-26 |\n",
    });
    assert.equal(digest.claims.length, 1);
    assert.equal(digest.claims[0].target, "new");
  });

  test("reports summary and weekly-log headroom for both budgets (spec 1730 criterion 6)", () => {
    const summary = `# Staff Engineer — Summary\n${Array(40)
      .fill("settled state line")
      .join("\n")}\n`;
    const weekly = `# Staff Engineer — 2026-W21\n${Array(60)
      .fill("## 2026-05-19 entry line")
      .join("\n")}\n`;
    const digest = digestOf({
      "/wiki/staff-engineer.md": summary,
      "/wiki/staff-engineer-2026-W21.md": weekly,
    });
    // Field shape exactly matches the design interface.
    assert.deepEqual(Object.keys(digest.summary_headroom).sort(), [
      "line_cap",
      "lines",
      "lines_remaining",
      "word_cap",
      "words",
      "words_remaining",
    ]);
    assert.equal(digest.summary_headroom.line_cap, 496);
    assert.equal(digest.summary_headroom.word_cap, 2048);
    assert.equal(
      digest.summary_headroom.lines_remaining,
      496 - digest.summary_headroom.lines,
    );
    assert.equal(digest.weekly_log_headroom.line_cap, 496);
    assert.equal(digest.weekly_log_headroom.word_cap, 6400);
    assert.ok(digest.weekly_log_headroom.lines > 0);
    assert.equal(
      digest.weekly_log_headroom.words_remaining,
      6400 - digest.weekly_log_headroom.words,
    );
  });

  test("absent files report near-full headroom (criterion 6)", () => {
    // The canonical countLines treats "" as one line, so an absent file reports
    // 1 line / 0 words — effectively the full ceiling for a fresh surface.
    const digest = digestOf();
    assert.equal(digest.summary_headroom.lines, 1);
    assert.equal(digest.summary_headroom.lines_remaining, 495);
    assert.equal(digest.weekly_log_headroom.words, 0);
    assert.equal(digest.weekly_log_headroom.words_remaining, 6400);
  });
});
