import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";

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

  test("over-budget summary: fires summary.line-budget", () => {
    const big = Array(600).fill("x").join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    });
    assert.ok(idsOf(audit(seed)).includes("summary.line-budget"));
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

  test("heading-grammar drift fires on `## ` headings that defeat the seam-finder", () => {
    const seed = cleanSeed("2026-06-22", {
      [`${WIKI}/staff-engineer-2026-W25.md`]: [
        "# Staff Engineer — 2026-W25",
        "",
        "## Run 220 — 2026-06-22 something", // drifted: not the dated grammar
        "",
        "### Decision",
        "",
        "## 2026-06-23", // conforming — must NOT fire
        "",
        "### Decision",
        "",
        "## Mon 2026-06-24 — note", // drifted
      ].join("\n"),
    });
    const offenders = audit(seed, "2026-06-22").filter(
      (f) => f.id === "weekly-log.heading-grammar",
    );
    assert.equal(offenders.length, 2);
    assert.match(offenders[0].message, /does not match the dated grammar/);
    assert.match(offenders[0].hint, /fit-wiki log/);
  });

  test("heading-grammar drift fires on sealed parts too (criterion 7)", () => {
    const seed = cleanSeed("2026-06-22", {
      [`${WIKI}/staff-engineer-2026-W25-part1.md`]: [
        "# Staff Engineer — 2026-W25 (part 1 of 2)",
        "",
        "## Run 9 — drifted heading",
      ].join("\n"),
    });
    assert.ok(
      idsOf(audit(seed, "2026-06-22")).includes(
        "weekly-log-part.heading-grammar",
      ),
    );
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

  // -- conflict.markers (spec 1890, criteria 1–6) --

  const OPEN = "<<<<<<< HEAD";
  const SEP = "=======";
  const CLOSE = ">>>>>>> origin/master";

  function summaryWith(...body) {
    return [
      "# Staff Engineer — Summary",
      "",
      "**Last run**: nothing.",
      "",
      "## Message Inbox",
      "",
      "<!-- memo:inbox -->",
      "",
      ...body,
      "",
    ].join("\n");
  }

  const conflictFindings = (findings) =>
    findings.filter((f) => f.id === "conflict.markers");

  test("C1: fires on a branch-merge conflict block in a summary", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(OPEN, "ours", SEP, "x", CLOSE),
    });
    const hits = conflictFindings(audit(seed));
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].level, "fail");
  });

  test("C1: fires on the stash-pop label forms", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(
        "<<<<<<< Updated upstream",
        "a",
        SEP,
        "b",
        ">>>>>>> Stashed changes",
      ),
    });
    assert.ok(conflictFindings(audit(seed)).length >= 1);
  });

  test("C1: split block across two sealed parts fires on EACH file", () => {
    // Reproduces wiki repair 7c281c59: seal rotation severs one block — the
    // open marker only in part 27, the separator + close only in part 28. A
    // complete-in-file-block matcher would miss both.
    const part27 = [
      "# Staff Engineer — 2026-W21 (part 27 of 28)",
      "",
      "tail of an entry",
      OPEN,
      "ours-content",
    ].join("\n");
    const part28 = [
      "# Staff Engineer — 2026-W21 (part 28 of 28)",
      "",
      "theirs-content",
      SEP,
      CLOSE,
    ].join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W21-part27.md`]: part27,
      [`${WIKI}/staff-engineer-2026-W21-part28.md`]: part28,
    });
    const hits = conflictFindings(audit(seed));
    const byPath = (suffix) =>
      hits.filter((f) => f.path.endsWith(suffix)).map((f) => f.message);
    const p27 = byPath("part27.md");
    const p28 = byPath("part28.md");
    assert.equal(p27.length, 1, "part 27 fires once (open)");
    assert.match(p27[0], /\(open\)/);
    assert.equal(p28.length, 1, "part 28 fires once (close)");
    assert.match(p28[0], /\(close\)/);
  });

  test("C2: does not fire on the quoted-rider shape (fenced + spans)", () => {
    // The W24 rider quotes both label forms in backtick code spans inside a
    // fenced block, including a column-1 wrapped close and an in-span
    // separator. Anchored by content shape, not filename.
    const rider = summaryWith(
      "The corruption deposited markers documented below:",
      "",
      "```text",
      "<<<<<<< Updated upstream",
      "=======",
      ">>>>>>> 7c281c59",
      "```",
      "",
      "Inline: a `>>>>>>> sha` and `<<<<<<< HEAD` and an in-span `=======`.",
    );
    assert.deepEqual(
      conflictFindings(
        audit({
          [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
          [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
          [`${WIKI}/staff-engineer.md`]: rider,
        }),
      ),
      [],
    );
  });

  test("C2: does not fire on straight-quote mid-line prose markers", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(
        'The marker "<<<<<<< HEAD" appeared mid-sentence, then "=======".',
      ),
    });
    assert.deepEqual(conflictFindings(audit(seed)), []);
  });

  test("C3: does not fire on a setext-heading underline", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith("A Heading", SEP, "body"),
    });
    assert.deepEqual(conflictFindings(audit(seed)), []);
  });

  test("C4: fires inside STATUS.md's fenced row table (data, not prose)", () => {
    const status = [
      "# Spec Status",
      "",
      "## Rows",
      "",
      "```",
      "0010\tplan\timplemented",
      OPEN,
      "0020\tplan\tapproved",
      SEP,
      "0020\tplan\tdraft",
      CLOSE,
      "```",
      "",
    ].join("\n");
    const seed = cleanSeed("2026-05-24", { [`${WIKI}/STATUS.md`]: status });
    const hits = conflictFindings(audit(seed));
    assert.ok(
      hits.some((f) => f.path.endsWith("STATUS.md")),
      "STATUS.md fence must not exempt conflict markers",
    );
  });

  test("C5: hint adjudicates the merged form and carries no trim guidance", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(OPEN, SEP, CLOSE),
    });
    const finding = conflictFindings(audit(seed))[0];
    assert.match(finding.hint, /adjudicate/);
    assert.doesNotMatch(finding.hint, /trim/);
  });

  test("C6: marker finding co-occurs with the word-budget finding", () => {
    // #1668 event 2 peaked at 2158/2048 words while carrying a marker block;
    // the size breach alone misattributed the defect. Both must now fire.
    const filler = Array(7000).fill("word").join(" ");
    const log = [
      "# Staff Engineer — 2026-W21",
      "",
      "## 2026-05-20",
      "",
      "### Decision",
      "",
      filler,
      "",
      OPEN,
      "ours",
      SEP,
      "theirs",
      CLOSE,
      "",
    ].join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W21.md`]: log,
    });
    const ids = idsOf(audit(seed));
    assert.ok(ids.includes("weekly-log.word-budget"));
    assert.ok(ids.includes("conflict.markers"));
  });

  test("when predicate skips rule when subject does not qualify", () => {
    // Empty wiki — memory does not exist, so memory.priority-heading should
    // NOT fire (its `when: memoryExists` returns false).
    const ids = idsOf(audit({}));
    assert.ok(ids.includes("memory.file-exists"));
    assert.ok(!ids.includes("memory.priority-heading"));
  });
});
