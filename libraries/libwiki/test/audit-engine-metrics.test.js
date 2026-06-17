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

describe("runRules — metrics-csv.duplicate-row", () => {
  const CSV = `${WIKI}/metrics/improvement-coach/2026.csv`;
  const csvHeader = "date,metric,value,unit,run,note,event_type";

  test("exact-duplicate metrics row fires a finding naming file and line", () => {
    const seed = cleanSeed("2026-05-24", {
      [CSV]: [
        csvHeader,
        "2026-05-24,storyboard_words,6094,count,,,",
        "2026-05-24,storyboard_words,6094,count,,,", // exact duplicate (line 3)
        "",
      ].join("\n"),
    });
    const findings = audit(seed).filter(
      (f) => f.id === "metrics-csv.duplicate-row",
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].level, "fail");
    assert.equal(findings[0].path, CSV);
    assert.equal(findings[0].lineNo, 3);
  });

  test("differentiating one duplicate row clears the finding", () => {
    const seed = cleanSeed("2026-05-24", {
      [CSV]: [
        csvHeader,
        "2026-05-24,storyboard_words,6094,count,,,",
        "2026-05-24,storyboard_words,6094,count,run-2,,", // run id differs
        "",
      ].join("\n"),
    });
    assert.ok(
      !idsOf(audit(seed)).includes("metrics-csv.duplicate-row"),
      "a column edit makes the rows non-identical",
    );
  });

  test("distinct metrics rows produce no finding", () => {
    const seed = cleanSeed("2026-05-24", {
      [CSV]: [
        csvHeader,
        "2026-05-24,storyboard_autogen_words,5116,count,,,",
        "2026-05-24,storyboard_narrative_words,1063,count,,,",
        "",
      ].join("\n"),
    });
    assert.ok(!idsOf(audit(seed)).includes("metrics-csv.duplicate-row"));
  });

  test("nested metrics CSVs are discovered recursively", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/metrics/kata-spec/2026.csv`]: [
        csvHeader,
        "2026-05-24,m,1,count,,,",
        "2026-05-24,m,1,count,,,",
        "",
      ].join("\n"),
    });
    const findings = audit(seed).filter(
      (f) => f.id === "metrics-csv.duplicate-row",
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, `${WIKI}/metrics/kata-spec/2026.csv`);
  });
});
