import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

import { parseRosterYaml } from "../src/roster/yaml.js";
import {
  applyScenario,
  buildWhatIfReport,
} from "../src/aggregation/what-if.js";
import { computeCoverage, resolveTeam } from "../src/aggregation/coverage.js";
import { detectRisks } from "../src/aggregation/risks.js";
import { parseScenario } from "../src/aggregation/scenarios.js";
import { runWhatIfCommand } from "../src/commands/what-if.js";
import { whatIfToText } from "../src/formatters/what-if/text.js";
import { whatIfToJson } from "../src/formatters/what-if/json.js";
import { whatIfToMarkdown } from "../src/formatters/what-if/markdown.js";

import { FIXTURE_ROSTER, loadStarterData } from "./fixtures.js";
import { ROWS } from "./fixtures/what-if/rows.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const MOVE_FIXTURE_YAML = `
teams:
  a:
    - name: Alice
      email: alice@example.com
      job: { discipline: software-engineering, level: J060 }
    - name: Carol
      email: carol@example.com
      job: { discipline: software-engineering, level: J060 }
  b:
    - name: Bob
      email: bob@example.com
      job: { discipline: software-engineering, level: J060 }
`;

let data;

before(async () => {
  ({ data } = await loadStarterData());
});

function snap(roster, target) {
  const resolved = resolveTeam(roster, data, target);
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { coverage, risks };
}

function buildMoveReport() {
  const roster = parseRosterYaml(MOVE_FIXTURE_YAML);
  const scenario = parseScenario({ move: "Alice", to: "b" }, { teamId: "a" });
  const beforeA = snap(roster, { teamId: "a" });
  const beforeB = snap(roster, { teamId: "b" });
  const mutated = applyScenario(roster, data, scenario);
  const afterA = snap(mutated, { teamId: "a" });
  const afterB = snap(mutated, { teamId: "b" });
  return buildWhatIfReport({
    scenario,
    teams: [
      { teamId: "a", role: "source", before: beforeA, after: afterA },
      { teamId: "b", role: "destination", before: beforeB, after: afterB },
    ],
  });
}

test("text formatter renders both team sections for --move", () => {
  const report = buildMoveReport();
  const output = whatIfToText({ report, data });

  const srcIdx = output.indexOf("Source team `a`:");
  const dstIdx = output.indexOf("Destination team `b`:");
  assert.ok(srcIdx >= 0, "source section label present");
  assert.ok(dstIdx >= 0, "destination section label present");
  assert.ok(srcIdx < dstIdx, "source section precedes destination section");

  const srcSection = output.slice(srcIdx, dstIdx);
  const dstSection = output.slice(dstIdx);

  assert.ok(
    srcSection.includes("- task-completion  depth: 2 → 1"),
    "source section: task-completion depth 2 → 1",
  );
  assert.ok(
    srcSection.includes("+ task-completion became single point of failure"),
    "source section: task-completion became SPOF",
  );

  assert.ok(
    dstSection.includes("+ task-completion  depth: 1 → 2"),
    "destination section: task-completion depth 1 → 2",
  );
  assert.ok(
    dstSection.includes("- task-completion no longer single point of failure"),
    "destination section: task-completion no longer SPOF",
  );

  assert.ok(
    !dstSection.includes("- task-completion  depth:"),
    "destination section does not carry source-side capability direction",
  );
  assert.ok(
    !dstSection.includes("+ task-completion became single point of failure"),
    "destination section does not carry source-side risk line",
  );

  assert.ok(
    !srcSection.includes("+ task-completion  depth:"),
    "source section does not carry destination-side capability direction",
  );
  assert.ok(
    !srcSection.includes("- task-completion no longer single point of failure"),
    "source section does not carry destination-side risk line",
  );
});

test("json formatter emits teams[] for --move", () => {
  const report = buildMoveReport();
  const out = whatIfToJson({ report });
  assert.equal(out.diff.teams.length, 2);
  assert.equal(out.diff.teams[0].teamId, "a");
  assert.equal(out.diff.teams[0].role, "source");
  assert.equal(out.diff.teams[1].teamId, "b");
  assert.equal(out.diff.teams[1].role, "destination");
  for (const entry of out.diff.teams) {
    assert.ok(Array.isArray(entry.capabilityChanges));
    assert.ok(entry.riskChanges && typeof entry.riskChanges === "object");
  }
});

test("markdown formatter renders both team headings for --move", () => {
  const report = buildMoveReport();
  const md = whatIfToMarkdown({ report });
  assert.ok(md.includes("## Source team `a`"));
  assert.ok(md.includes("## Destination team `b`"));

  const lines = md.split("\n");
  for (const heading of ["## Source team `a`", "## Destination team `b`"]) {
    const idx = lines.indexOf(heading);
    assert.ok(idx >= 0, `heading present: ${heading}`);
    const within = lines.slice(idx + 1, idx + 5);
    assert.ok(
      within.some((l) => l.startsWith("| Skill |")),
      `table header within 4 lines of heading: ${heading}`,
    );
  }
});

test("non-move scenarios match captured fixtures byte-for-byte", () => {
  for (const { id, target, cliOpts } of ROWS) {
    const roster = parseRosterYaml(FIXTURE_ROSTER);
    const scenario = parseScenario(cliOpts, target);
    const before = snap(roster, target);
    const mutated = applyScenario(roster, data, scenario);
    const after = snap(mutated, target);
    const report = buildWhatIfReport({
      scenario,
      teams: [
        {
          teamId: target.teamId ?? target.projectId,
          role: "target",
          before,
          after,
        },
      ],
    });
    const txt = whatIfToText({ report, data });
    const json = JSON.stringify(whatIfToJson({ report }), null, 2) + "\n";
    const md = whatIfToMarkdown({ report });

    assert.equal(
      txt,
      readFileSync(join(HERE, "fixtures/what-if", `${id}.txt`), "utf8"),
      `${id}.txt byte-identity`,
    );
    assert.equal(
      json,
      readFileSync(join(HERE, "fixtures/what-if", `${id}.json`), "utf8"),
      `${id}.json byte-identity`,
    );
    assert.equal(
      md,
      readFileSync(join(HERE, "fixtures/what-if", `${id}.md`), "utf8"),
      `${id}.md byte-identity`,
    );
  }
});

test("runWhatIfCommand emits diff.teams[] for --move via JSON output", async () => {
  // In-process: seed the roster file in a mock fs and capture stdout via the
  // injected mock proc — no real tmpdir, no global process patching.
  const rosterPath = "/work/roster.yaml";
  const runtime = createTestRuntime({
    fs: createMockFs({ [rosterPath]: MOVE_FIXTURE_YAML }),
  });
  await runWhatIfCommand({
    data,
    args: ["a"],
    options: {
      roster: rosterPath,
      move: "Alice",
      to: "b",
      format: "json",
    },
    runtime,
  });
  const parsed = JSON.parse(runtime.proc.stdout.chunks.join(""));
  assert.equal(parsed.diff.teams.length, 2);
  assert.equal(parsed.diff.teams[0].role, "source");
  assert.equal(parsed.diff.teams[1].role, "destination");
  assert.deepEqual(
    parsed.diff.teams.map((t) => t.teamId),
    ["a", "b"],
  );
});

test("CLI help strings name source/destination roles", () => {
  const src = readFileSync(
    join(HERE, "..", "bin", "fit-summit.js"),
    "utf8",
  ).toLowerCase();
  const whatIfBlockMatch = src.match(
    /name: "what-if"[\s\S]*?examples:\s*\[[\s\S]*?\]/,
  );
  assert.ok(whatIfBlockMatch, "what-if block found in bin/fit-summit.js");
  const whatIfBlock = whatIfBlockMatch[0];
  assert.ok(
    whatIfBlock.includes("source for --move"),
    "subcommand description names source for --move",
  );
  const moveMatch = whatIfBlock.match(/(?<!re)move:\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(moveMatch, "options.move definition found");
  assert.ok(moveMatch[0].includes("source"));
  assert.ok(moveMatch[0].includes("--to"));
  const toMatch = whatIfBlock.match(/\bto:\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(toMatch, "options.to definition found");
  assert.ok(toMatch[0].includes("destination"));
  assert.ok(toMatch[0].includes("move"));
});
