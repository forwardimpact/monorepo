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
    ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
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
    assert.match(offenders[0].hint, /gemba-wiki log/);
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

  test("valid carry surface: no carry-surface findings", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/release-engineer-carries.md`]: [
        "# release-engineer — Carries",
        "",
        "### Dependent-spec carry",
        "",
        "**Carry-clearance:** spec merges + plan-approved.",
        "",
        "### Experiment-verdict carry",
        "",
        "**Carry-clearance:** verdict horizon reached.",
        "",
      ].join("\n"),
    });
    const carry = idsOf(audit(seed)).filter((id) =>
      id.startsWith("carry-surface."),
    );
    assert.deepEqual(carry, []);
  });

  test("carry entry missing clearance trigger: one finding per block", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/release-engineer-carries.md`]: [
        "# release-engineer — Carries",
        "",
        "### Has trigger",
        "",
        "**Carry-clearance:** verdict horizon.",
        "",
        "### Missing trigger",
        "",
        "body with no clearance line",
        "",
      ].join("\n"),
    });
    const offenders = audit(seed).filter(
      (f) => f.id === "carry-surface.entry-has-clearance",
    );
    assert.equal(offenders.length, 1);
  });

  test("carry surface H1 slug mismatch fires", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/release-engineer-carries.md`]: [
        "# wrong-agent — Carries",
        "",
        "### Entry",
        "",
        "**Carry-clearance:** verdict.",
        "",
      ].join("\n"),
    });
    const finding = audit(seed).find(
      (f) => f.id === "carry-surface.h1-agent-matches-filename",
    );
    assert.ok(finding);
    assert.match(finding.message, /slug 'wrong-agent'/);
  });

  test("carry-named file without the Carry H1 is unclassified", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/release-engineer-carries.md`]:
        "# Not A Carry Surface\n\nbody\n",
    });
    const carry = idsOf(audit(seed)).filter((id) =>
      id.startsWith("carry-surface."),
    );
    assert.deepEqual(carry, []);
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
        "### product-manager",
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
        ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
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

  // The agent-experiments marker-balance behaviour family lives in the sibling
  // audit-engine-agent-experiments.test.js (test-file-shape split).

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

  test("over-budget MEMORY.md fires line and word budget rules", () => {
    // 200 lines × 13 words = 2600 words: over both the 128-line and 2048-word
    // MEMORY budgets. The canonical sections stay valid so only the budgets fire.
    const filler = Array.from(
      { length: 200 },
      (_, i) =>
        `word ${i} lorem ipsum dolor sit amet consectetur adipiscing elit sed do`,
    ).join("\n");
    const seed = {
      [`${WIKI}/MEMORY.md`]: `${MEMORY_NONE}\n${filler}\n`,
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
    };
    const ids = idsOf(audit(seed));
    assert.ok(ids.includes("memory.line-budget"));
    assert.ok(ids.includes("memory.word-budget"));
  });

  test("clean MEMORY.md does not fire the budget rules", () => {
    const ids = idsOf(audit(cleanSeed()));
    assert.ok(!ids.includes("memory.line-budget"));
    assert.ok(!ids.includes("memory.word-budget"));
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

  // The conflict.markers behaviour family lives in the sibling
  // audit-engine-conflict-markers.test.js (split to keep each file under the
  // line cap). The metrics-csv.duplicate-row family lives in the sibling
  // audit-engine-metrics.test.js, and the admission-scope family in
  // audit-engine-admission.test.js (same split rationale).
});
