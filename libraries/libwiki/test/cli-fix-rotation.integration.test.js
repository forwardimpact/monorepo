import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFixCommand } from "../src/commands/fix.js";
import { weeklyLogPath } from "../src/weekly-log.js";
import {
  makeRuntime,
  ctxFor,
  seedCleanWiki,
  seedAgentProfile,
  scriptedQuery,
} from "./helpers.js";

// The deterministic layer of `gemba-wiki fix`: main-log rotation and sealed-part
// re-bisection. Both are content-preserving and never invoke the agent. The
// agent/summary orchestration tests live in cli-fix.integration.test.js.
describe("gemba-wiki fix CLI — deterministic rotation layer", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fix-rot-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("bisects a multi-day over-cap log into conforming parts; audit clean, no agent", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // Valid H1 + 4 day-sections @ 150 lines: each section is under both
    // budgets, jointly they overflow the line budget. The bisecting seal splits
    // them into conforming parts and the re-audit is clean.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    let text = "# Staff Engineer — 2026-W21\n";
    for (let s = 0; s < 4; s++) {
      text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 150; i++) text += "- filler\n";
    }
    writeFileSync(logPath, text);

    // The agent must never be constructed for a deterministic rotation.
    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "rotation does not invoke the agent");
    assert.match(harness.stdout, /rotated/);
    assert.match(harness.stdout, /fixed: wiki audit is clean/);
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")) &&
        existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      "the over-cap log is sealed into ≥2 conforming parts",
    );
    assert.ok(existsSync(logPath), "a fresh main log is started");
    // The over-cap multi-day log now resolves clean — no human flag.
    assert.deepEqual(result, { ok: true, code: 0 });
    assert.doesNotMatch(harness.stderr, /weekly-log-part\.line-budget/);
  });

  test("flags only the irreducible single-day section that cannot be split", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // One day-section alone exceeds the line budget — it cannot be split at a
    // day seam, so it seals as an over-cap part the audit still flags. The part
    // re-bisect pass also cannot reduce it, so it survives for a human.
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    let text = "# Staff Engineer — 2026-W21\n## 2026-05-19\n";
    for (let i = 0; i < 600; i++) text += "- filler\n";
    writeFileSync(logPath, text);

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "rotation does not invoke the agent");
    assert.ok(existsSync(logPath), "a fresh main log is started");
    // Only the irreducible residue flags for a human.
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /weekly-log-part\.line-budget/);
  });

  test("re-bisects an over-budget sealed part deterministically; audit clean, no agent", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // A sealed part that drifted over budget (e.g. hand-edited) but still has
    // multiple day-section seams — re-bisectable without an agent.
    const partPath = join(wikiRoot, "staff-engineer-2026-W21-part1.md");
    let text = "# Staff Engineer — 2026-W21 (part 1 of 1)\n";
    for (let s = 0; s < 4; s++) {
      text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 150; i++) text += "- filler\n";
    }
    writeFileSync(partPath, text);

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "re-bisection does not invoke the agent");
    assert.match(harness.stdout, /rotated/);
    assert.match(harness.stdout, /fixed: wiki audit is clean/);
    assert.ok(
      existsSync(join(wikiRoot, "staff-engineer-2026-W21-part2.md")),
      "overflow lands on a fresh sibling slot",
    );
    assert.deepEqual(result, { ok: true, code: 0 });
    assert.doesNotMatch(harness.stderr, /need human judgment/);
  });

  test("seals an over-budget main log AND re-bisects an over-budget part in one run; clean, no agent", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // A current-week main log over budget, plus a pre-existing sealed part also
    // over budget. The two deterministic passes must compose: new slots from
    // each never collide (nextFreeSlots re-checks occupancy), and both clear.
    const mkMultiDay = (h1) => {
      let text = `${h1}\n`;
      for (let s = 0; s < 4; s++) {
        text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
        for (let i = 1; i < 150; i++) text += "- filler\n";
      }
      return text;
    };
    const logPath = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(logPath, mkMultiDay("# Staff Engineer — 2026-W21"));
    const partPath = join(wikiRoot, "staff-engineer-2026-W21-part1.md");
    writeFileSync(
      partPath,
      mkMultiDay("# Staff Engineer — 2026-W21 (part 1 of 1)"),
    );

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "neither pass invokes the agent");
    assert.deepEqual(result, { ok: true, code: 0 });
    assert.doesNotMatch(harness.stderr, /need human judgment/);
    assert.ok(existsSync(logPath), "a fresh main log is started");
  });

  test("leaves a healthy current-week log alone when a prior week is over budget", async () => {
    seedCleanWiki(wikiRoot);
    seedAgentProfile(dir);
    // Prior week (W20) over budget — the finding.
    const priorLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-17");
    writeFileSync(
      priorLog,
      ["# Staff Engineer — 2026-W20", ""]
        .concat(Array(600).fill("- filler"))
        .join("\n") + "\n",
    );
    // Current week (W21) healthy — must NOT be force-rotated.
    const currentLog = weeklyLogPath(wikiRoot, "staff-engineer", "2026-05-24");
    writeFileSync(
      currentLog,
      "# Staff Engineer — 2026-W21\n\n## 2026-05-24\n\n### Decision\n\n- ok\n",
    );

    const calls = [];
    const query = scriptedQuery(join(wikiRoot, "unused.md"), [""], calls);
    const harness = makeRuntime({ cwd: dir });

    const result = await runFixCommand(
      ctxFor({
        runtime: harness.runtime,
        query,
        options: { today: "2026-05-24" },
      }),
    );

    assert.equal(calls.length, 0, "the agent is never invoked");
    assert.ok(
      !existsSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md")),
      "the healthy current-week log is not rotated",
    );
    assert.ok(existsSync(priorLog), "the prior-week log is left for a human");
    // The unrotatable prior-week budget finding is flagged, not handed to the agent.
    assert.equal(result.code, 2);
    assert.match(harness.stderr, /need human judgment/);
    assert.match(harness.stderr, /weekly-log\.line-budget/);
  });
});
