import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import {
  buildContext,
  partitionInbox,
  resolveScope,
} from "../src/audit/scopes.js";
import { countLines, countWords } from "../src/budget.js";
import {
  INBOX_LINE_BUDGET,
  INBOX_WORD_BUDGET,
  MAX_MEMO_LINES,
  MAX_MEMO_WORDS,
  SUMMARY_WORD_BUDGET,
} from "../src/constants.js";

const WIKI = "/wiki";
const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

const MEMORY_NONE = [
  "## Cross-Cutting Priorities",
  "",
  "| Item | Agents | Owner | Status | Added |",
  "| --- | --- | --- | --- | --- |",
  "| *None* | — | — | — | — |",
  "",
].join("\n");

function storyboard(yyyy, mm) {
  return [
    `# Storyboard — ${yyyy}-${mm}`,
    "",
    ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
    "",
  ].join("\n");
}

// The clean-wiki seed (MEMORY.md + the current-month storyboard for `today`),
// overlaid with `extra`. buildContext reads these via runtime.fsSync.
function cleanSeed(today = "2026-05-24", extra = {}) {
  const d = new Date(today);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return {
    [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
    [`${WIKI}/storyboard-${yyyy}-M${mm}.md`]: storyboard(yyyy, mm),
    ...extra,
  };
}

function audit(seed, today = "2026-05-24") {
  const ctx = buildContext({
    wikiRoot: WIKI,
    today,
    fs: createMockFs(seed),
  });
  return runRules(RULES, ctx, { resolveScope });
}

const idsOf = (findings) => findings.map((f) => f.id);

describe("runRules", () => {
  test("clean wiki: zero fail-level findings", () => {
    const fails = audit(cleanSeed()).filter((f) => f.level === "fail");
    assert.deepEqual(fails, []);
  });

  test("over-budget summary body fires summary.line-budget, not inbox", () => {
    // Big content lives in a body section after the inbox, so it counts
    // against the summary body budget rather than the inbox budget.
    const big = Array(600).fill("x").join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n## Open Blockers\n\n${big}\n`,
    });
    const ids = idsOf(audit(seed));
    assert.ok(ids.includes("summary.line-budget"));
    assert.ok(!ids.includes("inbox.line-budget"));
  });

  test("summary first H2 mismatch fires summary.first-h2-inbox", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Wrong Section\n\n## Message Inbox\n\n<!-- memo:inbox -->\n`,
    });
    const finding = audit(seed).find((f) => f.id === "summary.first-h2-inbox");
    assert.ok(finding);
    assert.match(finding.message, /First H2 is 'Wrong Section'/);
  });

  test("summary missing memo:inbox marker fires when Message Inbox H2 present", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n(no marker)\n`,
    });
    assert.ok(idsOf(audit(seed)).includes("summary.memo-inbox-marker"));
  });

  test("nothing-after-Open-Blockers: one finding per offender", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: [
        "# Staff Engineer — Summary",
        "",
        "**Last run**: nothing.",
        "",
        "## Message Inbox",
        "",
        "<!-- memo:inbox -->",
        "",
        "## Open Blockers",
        "",
        "## Stragglers",
        "",
        "## More",
      ].join("\n"),
    });
    const offenders = audit(seed).filter(
      (f) => f.id === "summary.open-blockers-last",
    );
    assert.equal(offenders.length, 2);
  });

  test("summary H1 agent slug mismatch", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: `# Wrong Title — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n`,
    });
    const finding = audit(seed).find(
      (f) => f.id === "summary.h1-agent-matches-filename",
    );
    assert.ok(finding);
    assert.match(finding.message, /slug 'wrong-title'/);
  });

  test("weekly-log H1 shape failure", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W25.md`]: "# Wrong H1\n\nbody\n",
    });
    assert.ok(idsOf(audit(seed)).includes("weekly-log.h1-shape"));
  });

  test("decision-block: each missing entry produces one finding", () => {
    const seed = cleanSeed("2026-06-22", {
      [`${WIKI}/staff-engineer-2026-W25.md`]: [
        "# Staff Engineer — 2026-W25",
        "",
        "## 2026-06-22",
        "",
        "### Wrong Heading",
        "",
        "## 2026-06-23",
        "",
        "### Decision",
        "",
        "**Surveyed:** x",
        "",
        "## 2026-06-24",
        "",
        "### Also Wrong",
      ].join("\n"),
    });
    const offenders = audit(seed, "2026-06-22").filter(
      (f) => f.id === "decision-block.heading-within-5",
    );
    assert.equal(offenders.length, 2);
    for (const f of offenders) {
      assert.match(f.message, /lacks a line that is exactly '### Decision'/);
      assert.match(f.hint, /exactly '### Decision'/);
    }
  });

  test("decision-block: suffixed heading is reported as a near miss", () => {
    const seed = cleanSeed("2026-06-22", {
      [`${WIKI}/staff-engineer-2026-W25.md`]: [
        "# Staff Engineer — 2026-W25",
        "",
        "## 2026-06-22",
        "",
        "### Decision — widened the scope of #1371",
        "",
        "body",
      ].join("\n"),
    });
    const finding = audit(seed, "2026-06-22").find(
      (f) => f.id === "decision-block.heading-within-5",
    );
    assert.ok(finding, "suffixed heading must not satisfy the exact match");
    assert.match(
      finding.message,
      /opens with '### Decision — widened the scope of #1371'/,
    );
    assert.match(finding.message, /must be exactly '### Decision'/);
  });

  test("decision-block: bare heading after a suffixed one still passes", () => {
    const seed = cleanSeed("2026-06-22", {
      [`${WIKI}/staff-engineer-2026-W25.md`]: [
        "# Staff Engineer — 2026-W25",
        "",
        "## 2026-06-22",
        "",
        "### Decision — duplicate header",
        "",
        "### Decision",
        "",
        "body",
      ].join("\n"),
    });
    const offenders = audit(seed, "2026-06-22").filter(
      (f) => f.id === "decision-block.heading-within-5",
    );
    assert.deepEqual(offenders, []);
  });

  test("missing storyboard fires storyboard.current-month-exists", () => {
    const seed = { [`${WIKI}/MEMORY.md`]: MEMORY_NONE };
    assert.ok(idsOf(audit(seed)).includes("storyboard.current-month-exists"));
  });

  test("storyboard missing agent H3: one finding per missing agent", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: [
        "# Storyboard — 2026-05",
        "",
        "### product-manager — backlog",
        "- item",
        "",
      ].join("\n"),
    };
    const missing = audit(seed).filter(
      (f) => f.id === "storyboard.agent-h3-required",
    );
    assert.equal(missing.length, 4); // 5 agents required, 1 present
  });

  test("storyboard markers: dangling-open detected", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/storyboard-2026-M05.md`]: [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
        "",
        "<!-- xmr:metric:path.csv -->",
        "content with no close",
      ].join("\n"),
    });
    const finding = audit(seed).find(
      (f) => f.id === "storyboard.markers-balanced.xmr",
    );
    assert.ok(finding);
    assert.match(finding.message, /dangling-open/);
  });

  test("priority-row column count mismatch", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| short row | only-three | cells |",
        "",
      ].join("\n"),
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
    };
    assert.ok(idsOf(audit(seed)).includes("priority-row.column-count"));
  });

  test("claim row with bad date format fires claims-row rule", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| *None* | — | — | — | — |",
        "",
        "## Active Claims",
        "",
        "| agent | target | branch | pr | claimed_at | expires_at |",
        "| --- | --- | --- | --- | --- | --- |",
        "| staff | spec-1 | feat/x | — | not-a-date | 2026-06-01 |",
        "",
      ].join("\n"),
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
    };
    const finding = audit(seed).find(
      (f) => f.id === "claims-row.claimed-at-format",
    );
    assert.ok(finding);
    assert.match(finding.message, /not-a-date/);
  });

  test("expired claim emits warn level", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| *None* | — | — | — | — |",
        "",
        "## Active Claims",
        "",
        "| agent | target | branch | pr | claimed_at | expires_at |",
        "| --- | --- | --- | --- | --- | --- |",
        "| staff | spec-1 | feat/x | — | 2026-05-01 | 2026-05-10 |",
        "",
      ].join("\n"),
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
    };
    const finding = audit(seed, "2026-05-24").find(
      (f) => f.id === "expired-claim",
    );
    assert.equal(finding.level, "warn");
  });

  test("priority separator row missing", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| *None* | — | — | — | — |",
        "",
      ].join("\n"),
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
    };
    assert.ok(idsOf(audit(seed)).includes("memory.priority-separator-row"));
  });

  test("stray file is not audited", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/weird.md`]: "# Whatever\n",
    });
    assert.ok(!idsOf(audit(seed)).includes("wiki.stray-file"));
  });

  test("when predicate skips rule when subject does not qualify", () => {
    // Empty wiki — memory does not exist, so memory.priority-heading should
    // NOT fire (its `when: memoryExists` returns false).
    const ids = idsOf(audit({}));
    assert.ok(ids.includes("memory.file-exists"));
    assert.ok(!ids.includes("memory.priority-heading"));
  });
});

describe("partitionInbox", () => {
  function inspect(fileText) {
    const { inboxLines, bodyLines } = partitionInbox(fileText.split("\n"));
    const inboxText = inboxLines.join("\n");
    const bodyText = bodyLines.join("\n");
    return {
      inboxText,
      bodyText,
      // Content line counts partition the file: they sum to the whole-file
      // count, with no double-count and no gap.
      linesMatch: inboxLines.length + bodyLines.length === countLines(fileText),
      // Words sum too (the join reproduces each span's words).
      wordsMatch:
        countWords(bodyText) + countWords(inboxText) === countWords(fileText),
    };
  }

  test("splits at the inbox heading and the next H2", () => {
    const { inboxText, bodyText, wordsMatch, linesMatch } = inspect(
      "# A — Summary\n\n## Message Inbox\n\n<!-- memo:inbox -->\n- a memo\n\n## Notes\n\nbody text here\n",
    );
    assert.match(inboxText, /a memo/);
    assert.ok(!/a memo/.test(bodyText));
    assert.match(bodyText, /body text here/);
    assert.ok(wordsMatch && linesMatch);
  });

  test("inbox region runs to end of file when no later H2", () => {
    const { inboxText, wordsMatch, linesMatch } = inspect(
      "# A — Summary\n\n## Message Inbox\n\n<!-- memo:inbox -->\n- tail memo\n",
    );
    assert.match(inboxText, /tail memo/);
    assert.ok(wordsMatch && linesMatch);
  });

  test("heading-less summary puts everything in the body", () => {
    const { inboxText, bodyText, wordsMatch, linesMatch } = inspect(
      "# A — Summary\n\n## Notes\n\neverything here\n",
    );
    assert.equal(inboxText, "");
    assert.match(bodyText, /everything here/);
    assert.ok(wordsMatch && linesMatch);
  });

  test("inbox heading that is not the first H2 still splits at the heading", () => {
    const { inboxText, bodyText, wordsMatch, linesMatch } = inspect(
      "# A — Summary\n\n## Earlier\n\nbefore\n\n## Message Inbox\n\nthe memo\n",
    );
    assert.match(inboxText, /the memo/);
    assert.match(bodyText, /before/);
    assert.ok(!/the memo/.test(bodyText));
    assert.ok(wordsMatch && linesMatch);
  });
});

// Build a structurally valid summary: H1, last-run line, Message Inbox first
// (with marker and the given inbox body), then a trailing Open Blockers body.
function summaryFile({ inboxBody = "- small", openBlockers = "" }) {
  return [
    "# Staff Engineer — Summary",
    "",
    "**Last run**: nothing.",
    "",
    "## Message Inbox",
    "",
    "<!-- memo:inbox -->",
    inboxBody,
    "",
    "## Open Blockers",
    openBlockers,
    "",
  ].join("\n");
}

describe("memo/summary budget interaction (spec 1860)", () => {
  // SC1: a fresh memo in the inbox does not move the summary body budget even
  // when the whole file would breach.
  test("delivery to a near-cap summary does not fire the summary budget", () => {
    const memo = Array(300).fill("m").join(" ");
    const body = Array(SUMMARY_WORD_BUDGET - 30)
      .fill("w")
      .join(" ");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryFile({
        inboxBody: memo,
        openBlockers: body,
      }),
    });
    const ids = idsOf(audit(seed));
    // The body alone is under the summary budget; the whole file (body+memo)
    // would have breached under the old whole-file measure.
    assert.ok(!ids.includes("summary.word-budget"));
    assert.ok(countWords(memo) + countWords(body) > SUMMARY_WORD_BUDGET);
  });

  // SC2: a conforming inbox (at the band edge) plus one maximum delivery lands
  // at the ceiling and breaches neither inbox bound, on both dimensions.
  test("delivery to a conforming inbox never trips the inbox bound", () => {
    // Conforming-edge inbox body sized to exactly the reserve on both axes,
    // then one maximum delivery, landing the region at the ceiling.
    const edgeWords = INBOX_WORD_BUDGET - MAX_MEMO_WORDS;
    const edgeLines = INBOX_LINE_BUDGET - MAX_MEMO_LINES;
    // The inbox region = heading + marker + body. Reserve a few words/lines for
    // the heading and marker so the measured region sits at the edge.
    const bodyWords = Array(edgeWords - 6)
      .fill("w")
      .join(" ");
    const padLines = Array(Math.max(0, edgeLines - 8))
      .fill("")
      .join("\n");
    const memoWords = Array(MAX_MEMO_WORDS).fill("m").join(" ");
    const inboxBody = `${bodyWords}\n${padLines}\n${memoWords}`;
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryFile({ inboxBody }),
    });
    const ids = idsOf(audit(seed));
    assert.ok(!ids.includes("inbox.word-budget"));
    assert.ok(!ids.includes("inbox.line-budget"));
  });

  // SC2: an inbox already past the conforming band breaches on delivery.
  test("an over-accumulated inbox fires the inbox bound", () => {
    const over = Array(INBOX_WORD_BUDGET + 50)
      .fill("w")
      .join(" ");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryFile({ inboxBody: over }),
    });
    assert.ok(idsOf(audit(seed)).includes("inbox.word-budget"));
  });

  // SC5: planted non-memo text in the inbox region is the only over-bound
  // content and produces a fail finding; without it, clean.
  test("over-bound inbox content is measured; removing it is clean", () => {
    const planted = Array(INBOX_WORD_BUDGET + 10)
      .fill("x")
      .join(" ");
    const withText = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryFile({ inboxBody: planted }),
    });
    const withTextFails = audit(withText).filter((f) => f.level === "fail");
    assert.ok(withTextFails.some((f) => f.id === "inbox.word-budget"));

    const without = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryFile({ inboxBody: "- small" }),
    });
    const withoutFails = audit(without).filter((f) => f.level === "fail");
    assert.deepEqual(withoutFails, []);
  });

  // SC5: over-bound text under a renamed (non-`## Message Inbox`) heading is
  // body content, so it trips the summary body budget — it cannot escape both
  // measures by renaming the inbox heading.
  test("over-bound text under a renamed inbox heading routes to the body budget", () => {
    const planted = Array(SUMMARY_WORD_BUDGET + 50)
      .fill("x")
      .join(" ");
    const seed = cleanSeed("2026-05-24", {
      // No `## Message Inbox` heading — the whole file is body.
      [`${WIKI}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Inbox (renamed)\n\n${planted}\n`,
    });
    const ids = idsOf(audit(seed));
    assert.ok(ids.includes("summary.word-budget"));
    assert.ok(!ids.includes("inbox.word-budget"));
  });
});
