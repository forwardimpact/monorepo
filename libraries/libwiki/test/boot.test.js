import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createMockFs,
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";
import { buildDigest } from "../src/boot.js";
import { renderAgentExperiments } from "../src/issue-list-renderer.js";

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

  test("reports summary and weekly-log headroom for both budgets", () => {
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

  const STORYBOARD = `${ROOT}/storyboard-2026-M05.md`;

  test("materialized block yields an experiment item for the booting agent only", () => {
    const digest = digestOf({
      [STORYBOARD]: [
        "# Storyboard — 2026-05",
        "",
        "### staff-engineer",
        "#### implementations_shipped",
        "",
        "## Experiments",
        "<!-- agent-experiments -->",
        "<!-- last-successful-sync: 2026-05-18 -->",
        "- #1694 [staff-engineer] Exp Staff June 12 (by dickolsson)",
        "- #1625 [release-engineer] Exp RE June 11 (by someone)",
        "<!-- /agent-experiments -->",
      ].join("\n"),
    });
    const exp = digest.storyboard_items.filter((i) => i.source === "experiment");
    assert.equal(exp.length, 1);
    assert.equal(exp[0].issue, 1694); // criterion 6: provenance fields present
    assert.equal(exp[0].author, "dickolsson");
    assert.equal(exp[0].dim, "staff-engineer");
    assert.equal(exp[0].threshold, "Exp Staff June 12");
  });

  test("a live-format agent-section bullet still yields a digest item (criterion 8)", () => {
    const digest = digestOf({
      [STORYBOARD]: [
        "# Storyboard — 2026-05",
        "",
        "### staff-engineer",
        "- ship the materialization surface",
        "",
        "### release-engineer",
        "- not mine",
      ].join("\n"),
    });
    const bullets = digest.storyboard_items.filter((i) => i.source === "bullet");
    assert.equal(bullets.length, 1);
    assert.equal(bullets[0].threshold, "ship the materialization surface");
  });

  test("h3 scan does not double-parse block bullets or run past agent sections", () => {
    const digest = digestOf({
      [STORYBOARD]: [
        "# Storyboard — 2026-05",
        "",
        "### staff-engineer",
        "- mine",
        "",
        "## Notes",
        "- team-wide note, not mine",
        "",
        "## Experiments",
        "<!-- agent-experiments -->",
        "<!-- last-successful-sync: 2026-05-18 -->",
        "- #1 [staff-engineer] block item (by a)",
        "<!-- /agent-experiments -->",
      ].join("\n"),
    });
    // exactly one bullet (the agent's own h3 bullet) + one experiment item;
    // the team-wide note and the block bullet must NOT appear as h3 bullets.
    const bullets = digest.storyboard_items.filter((i) => i.source === "bullet");
    assert.equal(bullets.length, 1);
    assert.equal(bullets[0].threshold, "mine");
    const exp = digest.storyboard_items.filter((i) => i.source === "experiment");
    assert.equal(exp.length, 1);
    assert.equal(exp[0].issue, 1);
  });

  test("standing carries delivered verbatim; absence yields empty; summary unchanged", () => {
    const withCarries = digestOf({
      [`${ROOT}/staff-engineer.md`]: [
        "# Staff Engineer — Summary",
        "",
        "Last-run paragraph stays the summary.",
        "",
        "## Standing Carries",
        "- carry **one** with `markup` and #123",
        "- carry two",
      ].join("\n"),
    });
    assert.equal(withCarries.summary, "Last-run paragraph stays the summary.");
    assert.deepEqual(withCarries.standing_carries, [
      "carry **one** with `markup` and #123",
      "carry two",
    ]);

    const noCarries = digestOf({
      [`${ROOT}/staff-engineer.md`]:
        "# Staff Engineer — Summary\n\nOnly a last-run paragraph.\n",
    });
    assert.deepEqual(noCarries.standing_carries, []);
    assert.equal(noCarries.summary, "Only a last-run paragraph.");
  });

  test("buildDigest needs only a filesystem surface (offline, fail-never)", () => {
    // digestOf constructs buildDigest with `fs` only — no subprocess/network
    // capability is injected, so the boot path cannot reach the tracker.
    const digest = digestOf();
    assert.deepEqual(digest.standing_carries, []);
    assert.deepEqual(digest.storyboard_items, []);
  });

  test("round-trip: boot consumes exactly what the renderer writes (criterion 7)", async () => {
    // Render the block from issues via the real renderer (no hand-built
    // lookalike), drop it into a storyboard file, then build the digest from
    // that file. Renderer grammar and parser grammar must agree.
    const subprocess = createMockSubprocess({
      responses: {
        gh: {
          stdout: JSON.stringify([
            {
              number: 1694,
              title: "Exp Staff — round trip",
              labels: [
                { name: "experiment" },
                { name: "agent:staff-engineer" },
              ],
              author: { login: "dickolsson" },
            },
          ]),
          exitCode: 0,
        },
      },
    });
    const itemLines = await renderAgentExperiments({
      cwd: "/repo",
      runtime: createTestRuntime({ subprocess }),
    });
    const storyboard = [
      "# Storyboard — 2026-05",
      "",
      "## Experiments",
      "<!-- agent-experiments -->",
      "<!-- last-successful-sync: 2026-05-18 -->",
      ...itemLines,
      "<!-- /agent-experiments -->",
    ].join("\n");
    const digest = digestOf({ [STORYBOARD]: storyboard });
    const exp = digest.storyboard_items.filter((i) => i.source === "experiment");
    assert.equal(exp.length, 1);
    assert.equal(exp[0].issue, 1694);
    assert.equal(exp[0].threshold, "Exp Staff — round trip");
    assert.equal(exp[0].author, "dickolsson");
  });
});
