import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs, createMockSubprocess } from "@forwardimpact/libmock";
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

// The clean-wiki seed holds MEMORY.md and the storyboard for `today`'s
// month. `extra` overlays it. buildContext reads these through runtime.fsSync.
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

const idsOf = (findings) => findings.map((f) => f.id);

// A `git ls-files` exit 1 means no git state, so the admission universe is the
// whole on-disk walk (the test-fixture path). createMockSubprocess keys
// responses by command, so every `git` call returns this.
const NO_GIT = createMockSubprocess({ responses: { git: { exitCode: 1 } } });

function admissionAudit(seed, today = "2026-05-24") {
  const ctx = buildContext({
    wikiRoot: WIKI,
    today,
    fs: createMockFs(seed),
    subprocess: NO_GIT,
  });
  return runRules(RULES, ctx, { resolveScope });
}

// This wiki seed exercises every admitted class plus directories. The on-disk
// walk needs the sidecar/metrics files present alongside the clean-seed md.
function admissionSeed(extra = {}) {
  return cleanSeed("2026-05-24", {
    [`${WIKI}/Home.md`]: "# Home\n",
    [`${WIKI}/STATUS.md`]: "```\n```\n",
    [`${WIKI}/staff-engineer.md`]: "# Staff Engineer — Summary\n",
    [`${WIKI}/staff-engineer-2026-W24.md`]: "# Staff Engineer — 2026-W24\n",
    [`${WIKI}/staff-engineer-2026-W24-part1.md`]: "# x — 2026-W24 (part 1)\n",
    [`${WIKI}/trace-analysis-2026-06-11.md`]: "# study\n",
    [`${WIKI}/metrics/kata-design/2026.csv`]: "ts,v\n",
    [`${WIKI}/staff-engineer/exp-51.csv`]: "ts,v\n",
    ...extra,
  });
}

describe("admission scope", () => {
  test("clean wiki of every class fires zero admission findings", () => {
    const ids = idsOf(admissionAudit(admissionSeed()));
    assert.ok(!ids.includes("admission.not-in-grammar"));
  });

  test("the audit flags the #1570 rogue exactly once and names its path", () => {
    const seed = admissionSeed({
      [`${WIKI}/product-manager-2026-W24-history.md`]: "# rogue\n",
    });
    const flagged = admissionAudit(seed).filter(
      (f) => f.id === "admission.not-in-grammar",
    );
    assert.equal(flagged.length, 1);
    assert.match(flagged[0].message, /product-manager-2026-W24-history\.md/);
    assert.equal(flagged[0].level, "fail");
  });

  test("the audit flags the historical .claude/worktrees true positive", () => {
    const seed = admissionSeed({
      [`${WIKI}/.claude/worktrees/agent-a41a176e/scratch.md`]: "x\n",
    });
    const flagged = admissionAudit(seed)
      .filter((f) => f.id === "admission.not-in-grammar")
      .map((f) => f.message);
    assert.equal(flagged.length, 1);
    assert.match(flagged[0], /\.claude\/worktrees\/agent-a41a176e/);
  });

  test("the admission scope is empty when the caller supplies no subprocess", () => {
    // The rotation pre-pass builds a context without a subprocess. It must not
    // run git or the tree walk. It must produce no admission findings.
    const ctx = buildContext({
      wikiRoot: WIKI,
      today: "2026-05-24",
      fs: createMockFs(
        admissionSeed({
          [`${WIKI}/product-manager-2026-W24-history.md`]: "# rogue\n",
        }),
      ),
    });
    const ids = idsOf(runRules(RULES, ctx, { resolveScope }));
    assert.ok(!ids.includes("admission.not-in-grammar"));
  });
});
