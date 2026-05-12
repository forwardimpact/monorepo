import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyScenario,
  buildWhatIfReport,
} from "../../../src/aggregation/what-if.js";
import {
  computeCoverage,
  resolveTeam,
} from "../../../src/aggregation/coverage.js";
import { detectRisks } from "../../../src/aggregation/risks.js";
import { parseScenario } from "../../../src/aggregation/scenarios.js";
import { whatIfToJson } from "../../../src/formatters/what-if/json.js";
import { whatIfToMarkdown } from "../../../src/formatters/what-if/markdown.js";
import { whatIfToText } from "../../../src/formatters/what-if/text.js";
import { parseRosterYaml } from "../../../src/roster/yaml.js";
import { FIXTURE_ROSTER, loadStarterData } from "../../fixtures.js";
import { ROWS } from "./rows.mjs";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const { data } = await loadStarterData();
  function snap(r, t) {
    const resolved = resolveTeam(r, data, t);
    const coverage = computeCoverage(resolved, data);
    const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
    return { coverage, risks };
  }
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
    writeFileSync(join(here, `${id}.txt`), whatIfToText({ report, data }));
    writeFileSync(
      join(here, `${id}.json`),
      JSON.stringify(whatIfToJson({ report }), null, 2) + "\n",
    );
    writeFileSync(join(here, `${id}.md`), whatIfToMarkdown({ report }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
