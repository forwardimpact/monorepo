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

  test("sealed parts of every legacy + new shape pass on day one (1770)", () => {
    // Mirrors the live tree: legacy `(part N of M)`, bare title-cased, bare
    // slug-cased on a staff-engineer file, and the new `(part N)` shape.
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W23-part1.md`]:
        "# Staff Engineer — 2026-W23 (part 1 of 4)\n\nbody\n",
      [`${WIKI}/staff-engineer-2026-W23-part2.md`]:
        "# Staff Engineer — 2026-W23\n\nbody\n",
      [`${WIKI}/staff-engineer-2026-W23-part3.md`]:
        "# staff-engineer — 2026-W23\n\nbody\n",
      [`${WIKI}/staff-engineer-2026-W23-part4.md`]:
        "# Staff Engineer — 2026-W23 (part 4)\n\nbody\n",
    });
    const ids = idsOf(audit(seed));
    assert.ok(!ids.includes("weekly-log-part.h1-shape"), "no shape finding");
    assert.ok(
      !ids.includes("weekly-log-part.h1-agent-matches-filename"),
      "no agent-prefix finding (slug-match covers casing)",
    );
  });

  test("new (part N) shape valid; structurally broken still fails (1770)", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W23-part1.md`]:
        "# Staff Engineer — 2026-W23 (part 1 of 2)\n\nbody\n",
      [`${WIKI}/staff-engineer-2026-W23-part2.md`]:
        "# Staff Engineer — 2026-W23\n\nbody\n",
      [`${WIKI}/staff-engineer-2026-W23-part3.md`]:
        "# Staff Engineer — 2026-W23 (part 3)\n\nbody\n",
      // Bad week token (W2 not W23) → the only shape finding.
      [`${WIKI}/staff-engineer-2026-W23-part4.md`]:
        "# Staff Engineer — 2026-W2 (part 4)\n\nbody\n",
    });
    const shapeFindings = audit(seed).filter(
      (f) => f.id === "weekly-log-part.h1-shape",
    );
    assert.equal(shapeFindings.length, 1);
    assert.match(shapeFindings[0].path, /part4\.md$/);
  });

  test("agent-prefix mismatch flagged on a (part N) part; slug-equal not (1770)", () => {
    const seed = cleanSeed("2026-05-24", {
      // Title slug 'wrong-title' ≠ filename prefix 'staff-engineer' → flagged.
      [`${WIKI}/staff-engineer-2026-W23-part1.md`]:
        "# Wrong Title — 2026-W23 (part 1)\n\nbody\n",
      // Casing/separator-only difference is slug-equal → not flagged.
      [`${WIKI}/staff-engineer-2026-W23-part2.md`]:
        "# staff-engineer — 2026-W23 (part 2)\n\nbody\n",
    });
    const mism = audit(seed).filter(
      (f) => f.id === "weekly-log-part.h1-agent-matches-filename",
    );
    assert.equal(mism.length, 1);
    assert.match(mism[0].path, /part1\.md$/);
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
