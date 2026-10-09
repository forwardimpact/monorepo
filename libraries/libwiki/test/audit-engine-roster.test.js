import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";
import { profileText, STORYBOARD_AGENTS } from "./helpers.js";

// The storyboard.agent-h3-required family. The rule derives its requirement
// from the profiles under the project's agents directory, so every seed here
// carries a project root. The other rule families live in audit-engine.test.js
// and its siblings.
const PROJECT = "/project";
const WIKI = `${PROJECT}/wiki`;

const MEMORY_NONE = [
  "## Cross-Cutting Priorities",
  "",
  "| Item | Agents | Owner | Status | Added |",
  "| --- | --- | --- | --- | --- |",
  "| *None* | — | — | — | — |",
  "",
].join("\n");

// One profile per agent under the project's agents directory.
function profiles(agents = STORYBOARD_AGENTS) {
  return Object.fromEntries(
    agents.map((a) => [`${PROJECT}/.claude/agents/${a}.md`, profileText(a)]),
  );
}

function storyboard(agents = STORYBOARD_AGENTS) {
  return [
    "# Storyboard — 2026-05",
    "",
    ...agents.map((a) => `### ${a}`),
    "",
  ].join("\n");
}

function context(seed) {
  return buildContext({
    wikiRoot: WIKI,
    today: "2026-05-24",
    fs: createMockFs(seed),
    projectRoot: PROJECT,
  });
}

function h3Findings(seed) {
  return runRules(RULES, context(seed), { resolveScope }).filter(
    (f) => f.id === "storyboard.agent-h3-required",
  );
}

describe("storyboard.agent-h3-required", () => {
  test("a board with every profile's H3 yields no finding", () => {
    const seed = {
      ...profiles(),
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard(),
    };
    assert.deepEqual(h3Findings(seed), []);
    assert.deepEqual(context(seed).roster, STORYBOARD_AGENTS);
  });

  test("a storyboard without an agent H3: one finding per missing profile", () => {
    const seed = {
      ...profiles(),
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard(["product-manager"]),
    };
    assert.equal(h3Findings(seed).length, 4); // 5 profiles required, 1 present
  });

  test("a board that lacks one profile's H3 yields one finding", () => {
    const seed = {
      ...profiles([...STORYBOARD_AGENTS, "improvement-coach"]),
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard(),
    };
    const missing = h3Findings(seed);
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /'### improvement-coach'/);
  });

  test("a reference file under the agents directory adds no requirement", () => {
    const seed = {
      ...profiles(),
      [`${PROJECT}/.claude/agents/x-team-protocol.md`]: "# Protocol\n",
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: storyboard(),
    };
    assert.deepEqual(h3Findings(seed), []);
    assert.deepEqual(context(seed).roster, STORYBOARD_AGENTS);
  });

  test("no profiles directory: no section required and an empty roster", () => {
    const seed = {
      [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
      [`${WIKI}/storyboard-2026-M05.md`]: "# Storyboard — 2026-05\n",
    };
    assert.deepEqual(h3Findings(seed), []);
    assert.deepEqual(context(seed).roster, []);
  });
});
