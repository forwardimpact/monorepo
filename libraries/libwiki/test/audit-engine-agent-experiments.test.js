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

describe("runRules — storyboard.markers-balanced.agent-experiments", () => {
  test("agent-experiments markers: balanced yields no finding", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/storyboard-2026-M05.md`]: [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
        "",
        "<!-- agent-experiments -->",
        "<!-- last-successful-sync: 2026-05-24 -->",
        "- #1 [staff-engineer] x (by a)",
        "<!-- /agent-experiments -->",
      ].join("\n"),
    });
    const finding = audit(seed).find(
      (f) => f.id === "storyboard.markers-balanced.agent-experiments",
    );
    assert.equal(finding, undefined);
  });

  test("agent-experiments markers: dangling-open detected", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/storyboard-2026-M05.md`]: [
        "# Storyboard — 2026-05",
        "",
        ...STORYBOARD_AGENTS.map((a) => `### ${a}`),
        "",
        "<!-- agent-experiments -->",
        "- #1 [staff-engineer] x (by a)",
      ].join("\n"),
    });
    const finding = audit(seed).find(
      (f) => f.id === "storyboard.markers-balanced.agent-experiments",
    );
    assert.ok(finding);
    assert.match(finding.message, /dangling-open/);
  });
});
