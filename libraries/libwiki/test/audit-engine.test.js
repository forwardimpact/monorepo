import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAudit } from "../src/audit/engine.js";
import { RULES } from "../src/audit/rules.js";
import { buildContext } from "../src/audit/scopes.js";

const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

describe("RULES catalogue", () => {
  test("rule order is locked (catalogue snapshot)", () => {
    assert.deepEqual(
      RULES.map((r) => r.id),
      [
        "summary.last-run-marker",
        "summary.first-h2-inbox",
        "summary.memo-inbox-marker",
        "summary.open-blockers-last",
        "summary.line-budget",
        "summary.word-budget",
        "summary.h1-agent-matches-filename",
        "weekly-log.h1-shape",
        "weekly-log.line-budget",
        "weekly-log.word-budget",
        "weekly-log.h1-agent-matches-filename",
        "decision-block.heading-within-5",
        "weekly-log-part.h1-shape",
        "weekly-log-part.line-budget",
        "weekly-log-part.word-budget",
        "weekly-log-part.h1-agent-matches-filename",
        "memory.file-exists",
        "memory.priority-heading",
        "memory.priority-table-header",
        "memory.priority-separator-row",
        "memory.active-claims-table-header",
        "memory.active-claims-separator-row",
        "priority-row.column-count",
        "claims-row.claimed-at-format",
        "claims-row.expires-at-format",
        "expired-claim",
        "storyboard.current-month-exists",
        "storyboard.agent-h3-required",
        "storyboard.markers-balanced.xmr",
        "storyboard.markers-balanced.issues",
        "wiki.stray-file",
      ],
    );
  });

  test("every rule is well-formed", () => {
    const ids = new Set();
    for (const rule of RULES) {
      assert.ok(rule.id);
      assert.ok(rule.scope);
      assert.match(rule.severity, /^(fail|warn)$/);
      assert.equal(typeof rule.check, "function");
      assert.equal(typeof rule.message, "function");
      assert.ok(!ids.has(rule.id), `duplicate id: ${rule.id}`);
      ids.add(rule.id);
    }
  });
});

describe("runAudit", () => {
  let dir;
  let wiki;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-eng-"));
    wiki = join(dir, "wiki");
    mkdirSync(wiki, { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const seedClean = (today = "2026-05-24") => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| *None* | — | — | — | — |",
        "",
      ].join("\n"),
    );
    const d = new Date(today);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    writeFileSync(
      join(wiki, `storyboard-${yyyy}-M${mm}.md`),
      [
        `# Storyboard — ${yyyy}-${mm}`,
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
        "",
      ].join("\n"),
    );
  };

  const audit = (today = "2026-05-24", graceUntil = null) =>
    runAudit(RULES, buildContext({ wikiRoot: wiki, today, graceUntil }));

  const idsOf = (findings) => findings.map((f) => f.id);

  test("clean wiki: zero fail-level findings", () => {
    seedClean();
    const fails = audit().filter((f) => f.level === "fail");
    assert.deepEqual(fails, []);
  });

  test("over-budget summary: fires summary.line-budget", () => {
    seedClean();
    const big = Array(100).fill("x").join("\n");
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    );
    assert.ok(idsOf(audit()).includes("summary.line-budget"));
  });

  test("grace window downgrades summary.line-budget to warn", () => {
    seedClean();
    const big = Array(100).fill("x").join("\n");
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n\n${big}\n`,
    );
    const lineBudget = audit("2026-05-24", "2099-01-01").find(
      (f) => f.id === "summary.line-budget",
    );
    assert.equal(lineBudget.level, "warn");
  });

  test("summary first H2 mismatch fires summary.first-h2-inbox", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Wrong Section\n\n## Message Inbox\n\n<!-- memo:inbox -->\n`,
    );
    const finding = audit().find((f) => f.id === "summary.first-h2-inbox");
    assert.ok(finding);
    assert.match(finding.message, /first H2 is 'Wrong Section'/);
  });

  test("summary missing memo:inbox marker fires when Message Inbox H2 present", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      `# Staff Engineer — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n(no marker)\n`,
    );
    assert.ok(idsOf(audit()).includes("summary.memo-inbox-marker"));
  });

  test("nothing-after-Open-Blockers: one finding per offender", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      [
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
    );
    const offenders = audit().filter(
      (f) => f.id === "summary.open-blockers-last",
    );
    assert.equal(offenders.length, 2);
  });

  test("summary H1 agent slug mismatch", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer.md"),
      `# Wrong Title — Summary\n\n**Last run**: nothing.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n`,
    );
    const finding = audit().find(
      (f) => f.id === "summary.h1-agent-matches-filename",
    );
    assert.ok(finding);
    assert.match(finding.message, /slug 'wrong-title'/);
  });

  test("weekly-log H1 shape failure", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer-2026-W25.md"),
      "# Wrong H1\n\nbody\n",
    );
    assert.ok(idsOf(audit()).includes("weekly-log.h1-shape"));
  });

  test("decision-block: each missing entry produces one finding", () => {
    seedClean();
    writeFileSync(
      join(wiki, "staff-engineer-2026-W25.md"),
      [
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
    );
    const offenders = audit("2026-06-22").filter(
      (f) => f.id === "decision-block.heading-within-5",
    );
    assert.equal(offenders.length, 2);
  });

  test("missing storyboard fires storyboard.current-month-exists", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| *None* | — | — | — | — |",
        "",
      ].join("\n"),
    );
    assert.ok(idsOf(audit()).includes("storyboard.current-month-exists"));
  });

  test("storyboard missing agent H3: one finding per missing agent", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
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
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        "### product-manager — backlog",
        "- item",
        "",
      ].join("\n"),
    );
    const missing = audit().filter(
      (f) => f.id === "storyboard.agent-h3-required",
    );
    assert.equal(missing.length, 4); // 5 agents required, 1 present
  });

  test("storyboard markers: dangling-open detected", () => {
    seedClean();
    writeFileSync(
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
        "",
        "<!-- xmr:metric:path.csv -->",
        "content with no close",
      ].join("\n"),
    );
    const finding = audit().find(
      (f) => f.id === "storyboard.markers-balanced.xmr",
    );
    assert.ok(finding);
    assert.match(finding.message, /dangling-open/);
  });

  test("priority-row column count mismatch", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| --- | --- | --- | --- | --- |",
        "| short row | only-three | cells |",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      ].join("\n"),
    );
    assert.ok(idsOf(audit()).includes("priority-row.column-count"));
  });

  test("claim row with bad date format fires claims-row rule", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
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
    );
    writeFileSync(
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      ].join("\n"),
    );
    const finding = audit().find(
      (f) => f.id === "claims-row.claimed-at-format",
    );
    assert.ok(finding);
    assert.match(finding.message, /not-a-date/);
  });

  test("expired claim emits warn level", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
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
    );
    writeFileSync(
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      ].join("\n"),
    );
    const finding = audit("2026-05-24").find((f) => f.id === "expired-claim");
    assert.equal(finding.level, "warn");
  });

  test("priority separator row missing", () => {
    writeFileSync(
      join(wiki, "MEMORY.md"),
      [
        "## Cross-Cutting Priorities",
        "",
        "| Item | Agents | Owner | Status | Added |",
        "| *None* | — | — | — | — |",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(wiki, "storyboard-2026-M05.md"),
      [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
      ].join("\n"),
    );
    assert.ok(idsOf(audit()).includes("memory.priority-separator-row"));
  });

  test("stray file fires wiki.stray-file", () => {
    seedClean();
    writeFileSync(join(wiki, "weird.md"), "# Whatever\n");
    assert.ok(idsOf(audit()).includes("wiki.stray-file"));
  });

  test("when predicate skips rule when subject does not qualify", () => {
    // Empty wiki — memory does not exist, so memory.priority-heading should
    // NOT fire (its `when: memoryExists` returns false).
    const findings = audit();
    const ids = idsOf(findings);
    assert.ok(ids.includes("memory.file-exists"));
    assert.ok(!ids.includes("memory.priority-heading"));
  });
});
