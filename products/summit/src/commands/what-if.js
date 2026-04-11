/**
 * `fit-summit what-if <team> [options]` — simulate roster changes and
 * show their impact on coverage and risks before anyone acts.
 */

import { loadRoster } from "../roster/index.js";
import { computeCoverage, resolveTeam } from "../aggregation/coverage.js";
import { detectRisks } from "../aggregation/risks.js";
import {
  applyScenario,
  diffCoverage,
  diffRisks,
} from "../aggregation/what-if.js";
import { parseScenario, ScenarioError } from "../aggregation/scenarios.js";
import { TeamNotFoundError } from "../aggregation/errors.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { whatIfToText } from "../formatters/what-if/text.js";
import { whatIfToJson } from "../formatters/what-if/json.js";
import { whatIfToMarkdown } from "../formatters/what-if/markdown.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runWhatIfCommand({ data, args, options }) {
  const format = resolveFormat(options);
  const target = resolveTarget(args, options);

  let scenario;
  try {
    scenario = parseScenario(options, target);
  } catch (e) {
    if (e instanceof ScenarioError) {
      throw new Error(e.message, { cause: e });
    }
    throw e;
  }

  const roster = await loadRoster(getRosterSource(options));

  const before = computeSnapshot(roster, data, target);
  let mutated;
  try {
    mutated = applyScenario(roster, data, scenario);
  } catch (e) {
    if (e instanceof ScenarioError) {
      throw new Error(e.message, { cause: e });
    }
    throw e;
  }
  const after = computeSnapshot(mutated, data, target);

  const coverageDiff = diffCoverage(before.coverage, after.coverage);
  const riskDiff = diffRisks(before.risks, after.risks);

  if (format === Format.JSON) {
    process.stdout.write(
      JSON.stringify(
        whatIfToJson({ scenario, coverageDiff, riskDiff }),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (format === Format.MARKDOWN) {
    process.stdout.write(
      whatIfToMarkdown({ scenario, coverageDiff, riskDiff }),
    );
    return;
  }
  process.stdout.write(
    whatIfToText({ scenario, coverageDiff, riskDiff, data }),
  );
}

function resolveTarget(args, options) {
  if (options.project) return { projectId: options.project };
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: a team id is required. Usage: fit-summit what-if <team> [mutation] or fit-summit what-if --project <name> [mutation].",
    );
  }
  return { teamId };
}

function computeSnapshot(roster, data, target) {
  let resolved;
  try {
    resolved = resolveTeam(roster, data, target);
  } catch (e) {
    if (e instanceof TeamNotFoundError) {
      throw new Error(`summit: ${e.message}`, { cause: e });
    }
    throw e;
  }
  const coverage = computeCoverage(resolved, data);
  const risks = detectRisks({ resolvedTeam: resolved, coverage, data });
  return { resolved, coverage, risks };
}
